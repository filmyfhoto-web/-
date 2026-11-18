import { supabase } from '@/film-shop/lib/supabase';

const BACKUP_TABLES = [
  'shop_settings',
  'customers',
  'employees',
  'invoices',
  'pos_receipts',
  'pos_products',
  'transactions',
  'cash_drawer_shifts',
  'cash_drawer_transactions',
  'paper_withdrawals',
] as const;

const stamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function fetchAllData() {
  const out: Record<string, any[]> = {};
  for (const t of BACKUP_TABLES) {
    const { data, error } = await supabase.from(t as any).select('*');
    if (error) throw new Error(`${t}: ${error.message}`);
    out[t] = data || [];
  }
  return out;
}

export async function downloadBackupJSON() {
  const data = await fetchAllData();
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    tables: data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `backup-${stamp()}.json`);
}

const toCSV = (rows: any[]): string => {
  if (!rows.length) return '';
  const colSet = new Set<string>();
  rows.forEach(r => Object.keys(r).forEach(k => colSet.add(k)));
  const cols: string[] = Array.from(colSet);
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(',');
  const body = rows.map(r => cols.map(c => escape(r[c])).join(',')).join('\n');
  return header + '\n' + body;
};

export async function downloadBackupCSV() {
  const data = await fetchAllData();
  const sections: string[] = [];
  for (const [table, rows] of Object.entries(data)) {
    sections.push(`### TABLE: ${table} (${rows.length} rows)`);
    sections.push(toCSV(rows));
    sections.push('');
  }
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + sections.join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `backup-${stamp()}.csv`);
}
