/**
 * ช่องกรอกตัวเลขของฟอร์มรับงาน (ใช้ร่วมกันระหว่างฟอร์มรันคิวและฟอร์มรับงานใหม่)
 * เก็บข้อความที่พิมพ์ไว้ชั่วคราวเพื่อให้พิมพ์ทศนิยมได้ และแจ้งเตือนใต้ช่องเมื่อรูปแบบผิด
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseMoneyInput, parseQtyInput } from '@/film-shop/lib/queueIntake';

export interface NumFieldProps {
  id?: string;
  testId?: string;
  label?: string;
  placeholder?: string;
  value: number;
  kind: 'money' | 'qty';
  className?: string;
  onValue: (n: number) => void;
}

export default function NumField({
  id, testId, label, placeholder, value, kind, className, onValue,
}: NumFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = text ?? String(value ?? 0);
  return (
    <div className="w-full">
      <Input
        id={id}
        data-testid={testId}
        aria-label={label}
        aria-invalid={!!error}
        inputMode="decimal"
        placeholder={placeholder}
        className={className}
        value={shown}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          // ช่องเงินที่ปล่อยว่าง = 0 เพื่อให้ยอดรวม/ส่วนลดคำนวณใหม่ทันทีแบบเรียลไทม์
          if (kind === 'money' && raw.trim() === '') { setError(null); onValue(0); return; }
          const r = kind === 'money' ? parseMoneyInput(raw) : parseQtyInput(raw);
          setError(r.error);
          if (r.value !== null) onValue(r.value);
        }}
        onBlur={() => { setText(null); setError(null); }}
      />
      {error && (
        <p role="alert" data-testid={testId ? `${testId}-error` : undefined} className="mt-1 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
