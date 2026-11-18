import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Wifi, Printer, Usb, CheckCircle2, Info } from 'lucide-react';
import { useNetworkPrinter, PrinterType, NetworkPrinterConfig } from '@/film-shop/hooks/useNetworkPrinter';
import { useToast } from '@/film-shop/hooks/use-toast';

interface NetworkPrinterSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRINTER_OPTIONS: { type: PrinterType; icon: React.ReactNode; label: string; badge: string; description: string; tips: string[] }[] = [
  {
    type: 'airprint',
    icon: <Wifi className="h-5 w-5" />,
    label: 'AirPrint (iPad / iPhone)',
    badge: 'แนะนำ',
    description: 'พิมพ์ผ่าน Wi-Fi ด้วย iOS/iPadOS — ไม่ต้องติดตั้ง driver',
    tips: [
      'เชื่อม iPad กับ Wi-Fi เดียวกับเครื่องพิมพ์',
      'กด "พิมพ์" → เลือกเครื่องพิมพ์ในระบบ',
      'Aimo F300 ต้องใช้ Print Server (TP-Link TL-PS310U) เพื่อแปลง USB เป็น Wi-Fi',
    ],
  },
  {
    type: 'network',
    icon: <Printer className="h-5 w-5" />,
    label: 'Network IP Printer (LAN)',
    badge: 'ต้องการ Print Server',
    description: 'ส่งงานพิมพ์ผ่าน IP Address ในวงเดียวกัน (ต้องใช้ Print Server)',
    tips: [
      'กรอก IP Address ของ Print Server',
      'Port ปกติคือ 9100 (RAW printing)',
      'ต้องเชื่อม iPad กับ Wi-Fi เดียวกับเครือข่าย',
    ],
  },
  {
    type: 'usb',
    icon: <Usb className="h-5 w-5" />,
    label: 'USB ตรง (WebUSB)',
    badge: 'Chrome เท่านั้น',
    description: 'เชื่อมต่อ USB โดยตรง — ใช้กับ Chrome/Edge บน Windows/Mac เท่านั้น ไม่รองรับ iPad',
    tips: [
      'รองรับเฉพาะ Chrome / Edge บน Windows, Mac',
      'ไม่รองรับ Safari หรือ iPad',
      'ใช้ปุ่ม "เชื่อมต่อ USB" ในหน้าตัวอย่างใบเสร็จ',
    ],
  },
];

export function NetworkPrinterSettings({ open, onOpenChange }: NetworkPrinterSettingsProps) {
  const { config, saveConfig } = useNetworkPrinter();
  const { toast } = useToast();
  const [draft, setDraft] = useState<NetworkPrinterConfig>({ ...config });

  const handleSave = () => {
    saveConfig(draft);
    toast({ title: '✅ บันทึกการตั้งค่าเครื่องพิมพ์แล้ว' });
    onOpenChange(false);
  };

  const selected = PRINTER_OPTIONS.find(o => o.type === draft.type)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            ตั้งค่าเครื่องพิมพ์เครือข่าย
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Printer type selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">ประเภทการเชื่อมต่อ</Label>
          {PRINTER_OPTIONS.map(opt => (
              <button
                key={opt.type}
                onClick={() => setDraft(d => ({ ...d, type: opt.type }))}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                  draft.type === opt.type
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className={`mt-0.5 ${draft.type === opt.type ? 'text-primary' : 'text-muted-foreground'}`}>
                  {opt.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{opt.badge}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
                {draft.type === opt.type && (
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                )}
              </button>
            ))}
          </div>

          {/* Network IP settings — only shown when type = network */}
          {draft.type === 'network' && (
            <div className="space-y-2 p-3 bg-muted/40 rounded-lg">
              <Label className="text-sm font-medium">ข้อมูลเครื่องพิมพ์</Label>
              <div>
                <Label className="text-xs">IP Address</Label>
                <Input
                  value={draft.ipAddress}
                  onChange={e => setDraft(d => ({ ...d, ipAddress: e.target.value }))}
                  placeholder="192.168.1.100"
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input
                  value={draft.port}
                  onChange={e => setDraft(d => ({ ...d, port: e.target.value }))}
                  placeholder="9100"
                  className="h-9 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-muted border border-border rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-primary">
              <Info className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs font-semibold">วิธีใช้งาน ({selected.label})</span>
            </div>
            {selected.tips.map((tip, i) => (
              <p key={i} className="text-xs text-muted-foreground pl-5">• {tip}</p>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={handleSave}>บันทึก</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
