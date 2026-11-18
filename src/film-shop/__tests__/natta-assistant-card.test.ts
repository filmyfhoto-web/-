import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FILM_SHOP_LINE_CHANNELS, NATTA_WEBHOOK_URL } from '../components/settings/NattaAssistantCard';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../components/settings/NattaAssistantCard.tsx'),
  'utf8',
);
const FN = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/functions/film-natta-line-credentials/index.ts'),
  'utf8',
);

describe('การ์ดตั้งค่าม่วงจดให้', () => {
  it('อนุญาตเฉพาะช่อง LINE ของ Film Shop (ไม่มีร้านปริ้นงาน/คัลเลอร์แล็ป)', () => {
    expect([...FILM_SHOP_LINE_CHANNELS]).toEqual(['natta', 'runqueue', 'default']);
    expect(FILM_SHOP_LINE_CHANNELS[0]).toBe('natta');
    expect(FILM_SHOP_LINE_CHANNELS).not.toContain('shop2');
  });

  it('เรียก edge function ที่ถูกต้องและไม่แตะโทเคน LINE ฝั่งหน้าเว็บ', () => {
    expect(SRC).toMatch(/functions\.invoke\('film-richmenu-setup'/);
    expect(SRC).toMatch(/functions\.invoke\('film-natta-line-credentials'/);
    expect(SRC).toMatch(/store_id: selected/);
    expect(SRC).not.toMatch(/channel_access_token: '|LINE_TOKEN|Bearer /);
  });

  it('เลือกช่อง natta เป็นค่าเริ่มต้นเมื่อมีช่องนี้', () => {
    expect(SRC).toMatch(/eligible\.find\(\(s\) => s\.id === 'natta'\)/);
  });

  it('มีข้อความทดสอบและสถานะติดตั้งครบ', () => {
    expect(SRC).toContain('ขายรูป 360');
    expect(SRC).toContain('ค่าส่ง 80');
    expect(SRC).toContain('สรุปวันนี้');
    expect(SRC).toContain('ติดตั้งแล้ว');
    expect(SRC).toContain('rich_menu_id');
    expect(SRC).toContain('Access Token');
  });

  it('แสดง webhook URL ของช่อง natta และมีปุ่มคัดลอก', () => {
    expect(NATTA_WEBHOOK_URL).toContain('/functions/v1/line-webhook?ch=natta');
    expect(SRC).toContain('คัดลอก Webhook URL');
  });

  it('มี 3 ขั้นตอน + คำเตือนออก Channel Secret ใหม่ และปิดปุ่ม Rich Menu จนกว่าจะมี token', () => {
    expect(SRC).toContain('1. Channel ID');
    expect(SRC).toContain('2. Channel Secret');
    expect(SRC).toContain('3. Channel Access Token');
    expect(SRC).toContain('Issue/Reissue');
    expect(SRC).toMatch(/disabled=\{busy \|\| !selected \|\| !tokenReady\}/);
    expect(SRC).toContain('Verify / เปิด Use webhook');
  });

  it('ไม่เก็บค่าลับลงเครื่องผู้ใช้และไม่ log ค่า', () => {
    expect(SRC).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(SRC).not.toMatch(/console\.(log|info|warn|error)/);
  });
});

describe('edge function จัดการคีย์ LINE ของม่วงจดให้', () => {
  it('บังคับสิทธิ์ owner/admin ผ่าน has_role', () => {
    expect(FN).toContain('"unauthorized"');
    expect(FN).toContain('"forbidden"');
    expect(FN).toMatch(/has_role[\s\S]*_role: "admin"/);
    expect(FN).toMatch(/_role: "owner"/);
  });

  it('แตะเฉพาะแถว id=natta เท่านั้น', () => {
    expect(FN).toContain('const CHANNEL_ID = "natta"');
    expect(FN).not.toMatch(/shop2|runqueue/);
    expect(FN).not.toMatch(/body\)\?\.channel\b|store_id/);
  });

  it('ไม่คืนค่า secret/token ดิบกลับไป', () => {
    expect(FN).toMatch(/secret_configured: Boolean/);
    expect(FN).toMatch(/token_configured: Boolean/);
    const statusPayload = FN.slice(FN.indexOf('const readStatus'), FN.indexOf('if (req.method === "GET"'));
    expect(statusPayload).not.toMatch(/secret: secret|token: token|channel_secret:|channel_access_token:/);
    expect(FN).not.toMatch(/console\.log/);
  });
});
