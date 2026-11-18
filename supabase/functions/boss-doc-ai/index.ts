/**
 * "บอส" — AI ผู้ช่วยออกเอกสาร (server side)
 *
 * รับคำสั่งภาษาไทย + ไฟล์แนบ (รูป/PDF/Excel/CSV) แล้วคืน JSON ที่ validate ได้
 * - LOVABLE_API_KEY อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่มีการส่งคีย์ออกไปหา client
 * - ยอดเงินที่คืนไปเป็นเพียงค่าเริ่มต้น — ฝั่งแอปคำนวณซ้ำเสมอ (src/lib/bossDocument.ts)
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildBossSystemPrompt, BOSS_DEFAULT_VAT_RATE } from '../_shared/bossSystemPrompt.ts';
import {
  sheetToText,
  isSupportedDocFile,
  unsupportedDocFileMessage,
  DOC_FILE_MAX_BYTES,
} from '../_shared/docFileIntake.ts';
import { docxToText, isDocxFile, isLegacyDocFile, legacyDocMessage } from '../_shared/docText.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STAFF_ROLES = new Set(['owner', 'admin', 'stock_staff', 'photo_staff']);

async function requireStaff(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId);
  const ok = (roles ?? []).some((r: { role?: string }) => STAFF_ROLES.has(String(r.role)));
  if (!ok) return json({ error: 'forbidden' }, 403);
  return { userId };
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const SHEET_RE = /\.(xlsx|xls|csv)$/i;

/** สร้าง content blocks ของ user message จากไฟล์แนบทั้งหมด (แจ้งไฟล์ที่อ่านไม่ได้เป็นรายไฟล์) */
async function buildContent(
  files: File[],
  instruction: string,
): Promise<{ content: unknown[]; used: string[]; skipped: { file: string; reason: string }[] }> {
  const content: unknown[] = [{ type: 'text', text: instruction }];
  const used: string[] = [];
  const skipped: { file: string; reason: string }[] = [];
  for (const f of files) {
    const mime = (f.type || 'application/octet-stream').split(';')[0];
    if (f.size > DOC_FILE_MAX_BYTES) {
      skipped.push({ file: f.name, reason: `ไฟล์ "${f.name}" ใหญ่เกิน 10MB` });
      continue;
    }
    if (isLegacyDocFile(mime, f.name)) {
      skipped.push({ file: f.name, reason: legacyDocMessage(f.name) });
      continue;
    }
    if (!isSupportedDocFile(mime, f.name)) {
      skipped.push({ file: f.name, reason: unsupportedDocFileMessage(mime, f.name) });
      continue;
    }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (SHEET_RE.test(f.name) || mime.includes('spreadsheet') || mime === 'text/csv') {
        const text = await sheetToText({ bytes, mime, fileName: f.name });
        content.push({ type: 'text', text: `ตารางจากไฟล์ ${f.name}:\n\n${text}` });
      } else if (isDocxFile(mime, f.name)) {
        const text = await docxToText(bytes);
        content.push({ type: 'text', text: `เนื้อหาจากไฟล์ Word ${f.name}:\n\n${text}` });
      } else if (mime === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        content.push({
          type: 'file',
          file: { filename: f.name, file_data: `data:application/pdf;base64,${toBase64(bytes)}` },
        });
      } else if (mime.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) {
        const text = new TextDecoder().decode(bytes).slice(0, 20000);
        content.push({ type: 'text', text: `เนื้อหาจากไฟล์ ${f.name}:\n\n${text}` });
      } else if (mime.startsWith('image/')) {
        content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${toBase64(bytes)}` } });
      } else {
        skipped.push({ file: f.name, reason: unsupportedDocFileMessage(mime, f.name) });
        continue;
      }
      used.push(f.name);
    } catch (e) {
      skipped.push({ file: f.name, reason: `อ่านไฟล์ "${f.name}" ไม่สำเร็จ (${String((e as Error)?.message ?? e).slice(0, 80)})` });
    }
  }
  return { content, used, skipped };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireStaff(req);
    if (auth instanceof Response) return auth;

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return json(
        { error: 'missing_secret', secret: 'LOVABLE_API_KEY', message: 'ยังไม่ได้ตั้งค่าผู้ให้บริการ AI สำหรับบอส' },
        503,
      );
    }

    const ct = req.headers.get('content-type') ?? '';
    let prompt = '';
    let documentType = 'quotation';
    let shop: string | null = null;
    let vatMode = 'exclusive';
    let vatRate = BOSS_DEFAULT_VAT_RATE;
    let files: File[] = [];

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      prompt = String(form.get('prompt') ?? '');
      documentType = String(form.get('documentType') ?? documentType);
      shop = (form.get('shop') as string) || null;
      vatMode = String(form.get('vatMode') ?? vatMode);
      vatRate = Number(form.get('vatRate') ?? vatRate);
      files = form.getAll('files').filter((f): f is File => f instanceof File);
    } else {
      const body = await req.json().catch(() => ({}));
      prompt = String(body?.prompt ?? '');
      documentType = String(body?.documentType ?? documentType);
      shop = body?.shop ?? null;
      vatMode = String(body?.vatMode ?? vatMode);
      vatRate = Number(body?.vatRate ?? vatRate);
    }

    if (!prompt.trim() && files.length === 0) return json({ error: 'empty_request' }, 400);

    const instruction = [
      prompt.trim() || 'ช่วยแกะข้อมูลจากไฟล์แนบเพื่อออกเอกสาร',
      '',
      `ค่าที่ผู้ใช้เลือกไว้ในหน้าจอ: ประเภทเอกสาร=${documentType}, ร้าน=${shop ?? 'ไม่ระบุ'}, vatMode=${vatMode}, vatRate=${vatRate}`,
      'ถ้าคำสั่งของผู้ใช้ระบุประเภทเอกสารหรือโหมด VAT ชัดเจน ให้ยึดตามคำสั่ง มิฉะนั้นให้ใช้ค่าข้างต้น',
    ].join('\n');

    const { content, used, skipped } = await buildContent(files, instruction);
    if (!prompt.trim() && used.length === 0) {
      return json({ error: 'no_readable_file', skippedFiles: skipped, message: skipped[0]?.reason ?? 'ไม่มีไฟล์ที่อ่านได้' }, 415);
    }

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildBossSystemPrompt() },
          { role: 'user', content },
        ],
      }),
    });
    if (res.status === 429) return json({ error: 'rate_limited', message: 'ใช้งาน AI ถี่เกินไป ลองใหม่อีกครั้ง' }, 429);
    if (res.status === 402) return json({ error: 'no_credits', message: 'เครดิต AI หมด กรุณาเติมเครดิต' }, 402);
    if (!res.ok) return json({ error: 'ai_failed', status: res.status, message: (await res.text()).slice(0, 300) }, 502);

    const raw = String((await res.json())?.choices?.[0]?.message?.content ?? '').trim();
    const jsonText = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return json({ error: 'ai_bad_json', message: 'บอสอ่านไฟล์แล้วแต่ตอบกลับไม่เป็นรูปแบบที่ใช้ได้' }, 422);
    }
    return json({ result: parsed, skippedFiles: skipped, usedFiles: used });
  } catch (err) {
    console.error('[boss-doc-ai]', err);
    return json({ error: 'server_error', message: String((err as Error)?.message ?? err) }, 500);
  }
});
