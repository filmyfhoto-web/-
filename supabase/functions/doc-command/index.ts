/**
 * FILM SHOP — document command endpoint.
 *
 * Actions:
 *  - transcribe: Thai speech-to-text (LOVABLE_API_KEY stays server side)
 *  - parse:      deterministic parse of a typed/spoken command
 *
 * Drafts themselves are written by the client with the caller's session so
 * existing RLS applies; finalisation happens in the transactional
 * public.document_command_finalize() RPC.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseDocCommand, computeDraftTotals } from '../_shared/docCommandParser.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const STAFF_ROLES = new Set(['owner', 'admin', 'stock_staff', 'photo_staff']);

/**
 * Only signed-in staff may call this endpoint — the transcription path spends
 * paid AI credits, so an anonymous caller must never reach it.
 */
async function requireStaff(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId);
  const ok = (roles ?? []).some((r: { role?: string }) => STAFF_ROLES.has(String(r.role)));
  if (!ok) return json({ error: 'forbidden' }, 403);

  return { userId };
}

const EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/m4a': 'm4a',
};

/** Thai transcription through the Lovable AI gateway. */
export async function transcribeAudio(file: Blob, apiKey: string): Promise<string> {
  const type = (file.type || 'audio/wav').split(';')[0];
  const form = new FormData();
  form.append('model', 'openai/gpt-4o-mini-transcribe');
  form.append('file', file, `command.${EXT[type] ?? 'wav'}`);
  form.append('language', 'th');

  const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`transcription_failed_${res.status}: ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  return String(data?.text ?? '').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireStaff(req);
    if (auth instanceof Response) return auth;

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const apiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!apiKey) {
        return json({ error: 'missing_secret', secret: 'LOVABLE_API_KEY' }, 503);
      }
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File) || file.size < 1024) {
        return json({ error: 'empty_audio' }, 400);
      }
      if (file.size > 20 * 1024 * 1024) return json({ error: 'audio_too_large' }, 413);

      const transcript = await transcribeAudio(file, apiKey);
      if (!transcript) return json({ error: 'empty_transcript' }, 422);
      const fields = parseDocCommand(transcript);
      return json({
        transcript,
        fields,
        totals: computeDraftTotals(fields.items, fields),
      });
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? '');
    if (!text.trim()) return json({ error: 'empty_text' }, 400);
    const fields = parseDocCommand(text);
    return json({ transcript: text, fields, totals: computeDraftTotals(fields.items, fields) });
  } catch (err) {
    console.error('[doc-command]', err);
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});