import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('supabase/functions/doc-command/index.ts', 'utf8');

describe('doc-command endpoint auth', () => {
  it('requires a bearer token and verifies it server-side', () => {
    expect(src).toContain('requireStaff');
    expect(src).toContain('auth.getClaims');
    expect(src).toMatch(/'unauthorized'/);
  });

  it('checks a staff role before doing any paid work', () => {
    expect(src).toContain("from('user_roles')");
    expect(src).toMatch(/'forbidden'/);
    expect(src.indexOf('requireStaff(req)')).toBeLessThan(src.indexOf("Deno.env.get('LOVABLE_API_KEY')"));
  });
});
