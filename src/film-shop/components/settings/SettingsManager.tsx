import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { Settings, Save, Store, FileText, Calculator, Database, BarChart3, ShoppingCart, Package, Printer, MessageCircle, AlertTriangle, Palette, Download } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ProductType } from '@/film-shop/types';
import { BackupManager } from './BackupManager';
import { CategoryManager } from './CategoryManager';
import { AlertSoundSettingsCard } from './AlertSoundSettings';
import { NotificationPrefsPanel } from './NotificationPrefsPanel';
import { QueueSettingsPanel } from './QueueSettingsPanel';
import { FsActivityLogCard } from './FsActivityLogCard';
import { ProductReport } from '../reports/ProductReport';
import { NetworkPrinterSettings } from '../pos/NetworkPrinterSettings';
import DisplayComfortCard from '@/components/settings/DisplayComfortCard';
import { useNetworkPrinter } from '@/film-shop/hooks/useNetworkPrinter';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/film-shop/lib/supabase';
import { downloadBackupJSON, downloadBackupCSV } from '@/film-shop/utils/dataBackup';

const FALLBACK_LABELS: Record<string, string> = {
  vinyl: 'ไวนิล',
  paswood: 'พาสวูด',
  sticker: 'สติ๊กเกอร์',
  foamboard: 'โฟมบอร์ด',
};

const TOC = [
  { id: 'fs-set-shop', label: 'ร้านและเอกสาร' },
  { id: 'fs-set-notify', label: 'แจ้งเตือนและเสียง' },
  { id: 'fs-set-notify2', label: 'ตั้งค่าการแจ้งเตือน' },
  
  { id: 'fs-set-queue', label: 'คิวงาน' },
  { id: 'fs-set-products', label: 'สินค้าและหมวดหมู่' },
  { id: 'fs-set-printer', label: 'เครื่องพิมพ์' },
  { id: 'fs-set-display', label: 'การแสดงผล' },
  { id: 'fs-set-reports', label: 'รายงานไวนิล' },
  { id: 'fs-set-data', label: 'ข้อมูลและสำรอง' },
  { id: 'fs-set-activity', label: 'ประวัติการใช้งาน' },
];

/** สารบัญด้านบน — คลิกแล้วเลื่อนไปหัวข้อในหน้าเดียวกัน ไม่เปลี่ยนหน้า */
function SettingsToc() {
  return (
    <nav
      aria-label="สารบัญตั้งค่า"
      data-testid="fs-settings-toc"
      className="sticky top-0 z-20 -mx-2 flex gap-2 overflow-x-auto bg-background/95 px-2 py-2 backdrop-blur"
    >
      {TOC.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function SettingsManager() {
  const { settings, setSettings } = useAppData();
  const { config: printerConfig, saveConfig: savePrinterConfig } = useNetworkPrinter();
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = async (kind: 'json' | 'csv') => {
    setBackingUp(true);
    try {
      if (kind === 'json') await downloadBackupJSON();
      else await downloadBackupCSV();
      setBackedUp(true);
      toast.success('ดาวน์โหลดข้อมูลสำรองเรียบร้อย');
    } catch (e: any) {
      toast.error('สำรองข้อมูลล้มเหลว: ' + (e.message || ''));
    } finally {
      setBackingUp(false);
    }
  };

  const handleResetAll = async () => {
    if (resetConfirm !== 'RESET') {
      toast.error('กรุณาพิมพ์ RESET เพื่อยืนยัน');
      return;
    }
    setResetting(true);
    const tables = ['paper_withdrawals', 'cash_drawer_transactions', 'cash_drawer_shifts', 'transactions', 'pos_receipts', 'invoices', 'customers'] as const;
    try {
      for (const t of tables) {
        const { error } = await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
      }
      toast.success('รีเซ็ตข้อมูลเรียบร้อย');
      setResetConfirm('');
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast.error('รีเซ็ตล้มเหลว: ' + (e.message || ''));
    } finally {
      setResetting(false);
    }
  };

  // Printer settings local state
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>(() => {
    try { return (localStorage.getItem('pos_paper_width') as '58mm' | '80mm') || '80mm'; } catch { return '80mm'; }
  });
  const [printFontSize, setPrintFontSize] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('pos_print_font_size') || '100'); } catch { return 100; }
  });
  const [printDensity, setPrintDensity] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('pos_print_density') || '100'); } catch { return 100; }
  });

  const handleSavePrinterSettings = () => {
    localStorage.setItem('pos_paper_width', paperWidth);
    localStorage.setItem('pos_print_font_size', printFontSize.toString());
    localStorage.setItem('pos_print_density', printDensity.toString());
    toast.success('บันทึกการตั้งค่าเครื่องพิมพ์แล้ว');
  };
  
  const [formData, setFormData] = useState({
    shopName: settings.shopName,
    shopAddress: settings.shopAddress,
    shopPhone: settings.shopPhone,
    shopTaxId: settings.shopTaxId,
    defaultPricePerSqm: settings.defaultPricePerSqm.toString(),
    receiptHeader: settings.receiptHeader || '',
    receiptFooter: settings.receiptFooter || '',
    quotationHeaderText: settings.quotationHeaderText || '',
    productPricing: settings.productPricing || {
      vinyl: 150,
      paswood: 200,
      sticker: 120,
      foamboard: 180,
    },
  });

  useEffect(() => {
    setFormData({
      shopName: settings.shopName,
      shopAddress: settings.shopAddress,
      shopPhone: settings.shopPhone,
      shopTaxId: settings.shopTaxId,
      defaultPricePerSqm: settings.defaultPricePerSqm.toString(),
      receiptHeader: settings.receiptHeader || '',
      receiptFooter: settings.receiptFooter || '',
      quotationHeaderText: settings.quotationHeaderText || '',
      productPricing: settings.productPricing || {
        vinyl: 150,
        paswood: 200,
        sticker: 120,
        foamboard: 180,
      },
    });
  }, [settings]);

  const handlePricingChange = (type: ProductType, value: string) => {
    setFormData({
      ...formData,
      productPricing: {
        ...formData.productPricing,
        [type]: parseFloat(value) || 0,
      },
    });
  };

  const handleSave = () => {
    setSettings({
      ...settings,
      shopName: formData.shopName,
      shopAddress: formData.shopAddress,
      shopPhone: formData.shopPhone,
      shopTaxId: formData.shopTaxId,
      defaultPricePerSqm: parseFloat(formData.defaultPricePerSqm) || 150,
      productPricing: formData.productPricing,
      receiptHeader: formData.receiptHeader,
      receiptFooter: formData.receiptFooter,
      quotationHeaderText: formData.quotationHeaderText,
    });
    toast.success('บันทึกการตั้งค่าเรียบร้อย');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsToc />

        <section id="fs-set-shop" className="scroll-mt-24 space-y-4 max-w-3xl">
          <h2 className="text-lg font-bold">ร้านและเอกสาร</h2>
          {/* Shop Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                ข้อมูลร้าน
              </CardTitle>
              <CardDescription>
                ข้อมูลที่จะแสดงในใบเสร็จและใบเสนอราคา
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>ชื่อร้าน</Label>
                <Input
                  value={formData.shopName}
                  onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                  placeholder="ชื่อร้าน"
                />
              </div>
              
              <div>
                <Label>ที่อยู่</Label>
                <Textarea
                  value={formData.shopAddress}
                  onChange={(e) => setFormData({ ...formData, shopAddress: e.target.value })}
                  placeholder="ที่อยู่ร้าน"
                  rows={2}
                />
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>เบอร์โทรศัพท์</Label>
                  <Input
                    value={formData.shopPhone}
                    onChange={(e) => setFormData({ ...formData, shopPhone: e.target.value })}
                    placeholder="0xx-xxx-xxxx"
                  />
                </div>
                
                <div>
                  <Label>เลขประจำตัวผู้เสียภาษี</Label>
                  <Input
                    value={formData.shopTaxId}
                    onChange={(e) => setFormData({ ...formData, shopTaxId: e.target.value })}
                    placeholder="1234567890123"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                ตั้งค่าราคาสินค้า (บาท/ตร.ม.)
              </CardTitle>
              <CardDescription>
                ราคาเริ่มต้นสำหรับแต่ละประเภทสินค้า สามารถปรับได้ตอนคำนวณ
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {(() => {
                  const labels = { ...FALLBACK_LABELS, ...(settings.productLabels || {}) };
                  const keys = Object.keys(settings.productLabels && Object.keys(settings.productLabels).length > 0
                    ? settings.productLabels
                    : FALLBACK_LABELS);
                  return keys.map((type) => (
                    <div key={type}>
                      <Label>{labels[type] || type}</Label>
                      <Input
                        type="number"
                        value={formData.productPricing[type] ?? 0}
                        onChange={(e) => handlePricingChange(type, e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  ));
                })()}
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                ราคาเหล่านี้จะถูกใช้เป็นค่าเริ่มต้นในเครื่องคำนวณราคา แต่สามารถปรับแก้ได้ทุกครั้งที่คำนวณ <br />
                <span className="text-xs">เพิ่ม/ลบประเภทสินค้าได้ที่หน้าคำนวณราคา (ปุ่ม "จัดการประเภท")</span>
              </p>
            </CardContent>
          </Card>

          {/* Receipt Settings */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                ตั้งค่าใบเสร็จ
              </CardTitle>
              <CardDescription>
                ข้อความที่จะแสดงในหัวและท้ายใบเสร็จ
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>หัวเรื่องใบเสร็จ</Label>
                <Input
                  value={formData.receiptHeader}
                  onChange={(e) => setFormData({ ...formData, receiptHeader: e.target.value })}
                  placeholder="ใบเสร็จรับเงิน"
                />
              </div>
              
              <div>
                <Label>ข้อความท้ายใบเสร็จ</Label>
                <Textarea
                  value={formData.receiptFooter}
                  onChange={(e) => setFormData({ ...formData, receiptFooter: e.target.value })}
                  placeholder="ขอบคุณที่ใช้บริการ"
                  rows={2}
                />
              </div>

              <div>
                <Label>ข้อความบนหัวใบเสนอราคา (default)</Label>
                <Textarea
                  value={formData.quotationHeaderText}
                  onChange={(e) => setFormData({ ...formData, quotationHeaderText: e.target.value })}
                  placeholder="เช่น ราคานี้ยืนยัน 30 วัน / เงื่อนไขการชำระเงิน 50% มัดจำ"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">ข้อความที่แสดงเหนือตารางในใบเสนอราคาทุกใบ (สามารถ override รายใบได้)</p>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} size="lg" className="w-full mt-6">
            <Save className="h-4 w-4" />
            บันทึกการตั้งค่า
          </Button>

          {/* Danger Zone */}
          <Card className="mt-8 border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone — รีเซ็ตข้อมูลทั้งหมด
              </CardTitle>
              <CardDescription>
                สำรองข้อมูลก่อนรีเซ็ตเสมอ เพื่อให้กู้คืนได้หากผิดพลาด
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Download className="h-4 w-4" /> สำรองข้อมูล (ดาวน์โหลด)
                </p>
                <p className="text-xs text-muted-foreground">
                  ดาวน์โหลดข้อมูลทุกตารางก่อนรีเซ็ต — เก็บไฟล์ไว้กู้คืนหากจำเป็น
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleBackup('json')} disabled={backingUp}>
                    <Download className="h-4 w-4" /> JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBackup('csv')} disabled={backingUp}>
                    <Download className="h-4 w-4" /> CSV (ทุกตาราง)
                  </Button>
                </div>
              </div>

              <AlertDialog onOpenChange={(open) => { if (!open) { setResetConfirm(''); setBackedUp(false); } }}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="lg">
                    <AlertTriangle className="h-4 w-4" />
                    รีเซ็ตข้อมูลทั้งหมด
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ยืนยันการรีเซ็ตข้อมูล</AlertDialogTitle>
                    <AlertDialogDescription>
                      การกระทำนี้ไม่สามารถย้อนกลับได้ — กรุณาดาวน์โหลดสำรองข้อมูลก่อน แล้วพิมพ์ <strong>RESET</strong> เพื่อยืนยัน
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleBackup('json')} disabled={backingUp}>
                        <Download className="h-4 w-4" /> ดาวน์โหลด JSON
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleBackup('csv')} disabled={backingUp}>
                        <Download className="h-4 w-4" /> ดาวน์โหลด CSV
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={backedUp} onCheckedChange={(v) => setBackedUp(!!v)} />
                      ฉันได้ดาวน์โหลดข้อมูลสำรองแล้ว
                    </label>
                    <Input
                      value={resetConfirm}
                      onChange={(e) => setResetConfirm(e.target.value)}
                      placeholder="พิมพ์ RESET"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setResetConfirm(''); setBackedUp(false); }}>ยกเลิก</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleResetAll}
                      disabled={resetting || resetConfirm !== 'RESET' || !backedUp}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {resetting ? 'กำลังรีเซ็ต...' : 'รีเซ็ต'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </section>

        <section id="fs-set-products" className="scroll-mt-24 space-y-4">
          <h2 className="text-lg font-bold">สินค้าและหมวดหมู่</h2>
          <CategoryManager />
        </section>

        <section id="fs-set-display" className="scroll-mt-24 space-y-4 max-w-3xl">
          <h2 className="text-lg font-bold">การแสดงผล</h2>
          <DisplayComfortCard />
        </section>

        <section id="fs-set-data" className="scroll-mt-24 space-y-4">
          <h2 className="text-lg font-bold">ข้อมูลและสำรอง</h2>
          <BackupManager />
        </section>

        <section id="fs-set-reports" className="scroll-mt-24 space-y-4">
          <h2 className="text-lg font-bold">รายงานไวนิล</h2>
          <ProductReport />
        </section>

        <section id="fs-set-printer" className="scroll-mt-24 space-y-4 max-w-3xl space-y-4">
          <h2 className="text-lg font-bold">เครื่องพิมพ์</h2>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-primary" />
                ตั้งค่าเครื่องพิมพ์
              </CardTitle>
              <CardDescription>
                กำหนดขนาดกระดาษ ขนาดตัวอักษร และการเชื่อมต่อเครื่องพิมพ์
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Paper Width */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">ขนาดกระดาษ</Label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPaperWidth('58mm')}
                    className={`flex-1 flex flex-col items-center gap-1 p-4 rounded-lg border-2 transition-colors ${
                      paperWidth === '58mm' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <span className="text-2xl">📜</span>
                    <span className="text-sm font-semibold">58mm</span>
                    <span className="text-xs text-muted-foreground">กระดาษแคบ</span>
                  </button>
                  <button
                    onClick={() => setPaperWidth('80mm')}
                    className={`flex-1 flex flex-col items-center gap-1 p-4 rounded-lg border-2 transition-colors ${
                      paperWidth === '80mm' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <span className="text-2xl">🧾</span>
                    <span className="text-sm font-semibold">80mm</span>
                    <span className="text-xs text-muted-foreground">กระดาษมาตรฐาน</span>
                  </button>
                </div>
              </div>

              {/* Font Size */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">ขนาดตัวอักษร</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{printFontSize}%</span>
                </div>
                <Slider
                  value={[printFontSize]}
                  min={70}
                  max={130}
                  step={5}
                  onValueChange={([v]) => setPrintFontSize(v)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>เล็ก (70%)</span>
                  <span>ปกติ (100%)</span>
                  <span>ใหญ่ (130%)</span>
                </div>
              </div>

              {/* Print Density / Line Spacing */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">ระยะห่างบรรทัด</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{printDensity}%</span>
                </div>
                <Slider
                  value={[printDensity]}
                  min={70}
                  max={130}
                  step={5}
                  onValueChange={([v]) => setPrintDensity(v)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>แน่น (70%)</span>
                  <span>ปกติ (100%)</span>
                  <span>กว้าง (130%)</span>
                </div>
              </div>

              {/* Connection type quick-view */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">การเชื่อมต่อปัจจุบัน</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPrinterDialog(true)}
                    className="h-8 text-xs"
                  >
                    <Printer className="h-3.5 w-3.5 mr-1" />
                    เปลี่ยน
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  {printerConfig.type === 'airprint' && '🖨️ AirPrint (iPad / iPhone)'}
                  {printerConfig.type === 'network' && `🌐 Network IP — ${printerConfig.ipAddress}:${printerConfig.port}`}
                  {printerConfig.type === 'usb' && '🔌 WebUSB (Chrome เท่านั้น)'}
                </div>
              </div>

              <Button onClick={handleSavePrinterSettings} size="lg" className="w-full">
                <Save className="h-4 w-4 mr-2" />
                บันทึกการตั้งค่าเครื่องพิมพ์
              </Button>
            </CardContent>
          </Card>
        </section>


        <section id="fs-set-notify" className="scroll-mt-24 space-y-4 max-w-3xl space-y-4">
          <h2 className="text-lg font-bold">แจ้งเตือนและเสียง</h2>
          <AlertSoundSettingsCard />
        </section>
      <section id="fs-set-notify2" className="scroll-mt-24 max-w-3xl space-y-4">
        <h2 className="text-lg font-bold">ตั้งค่าการแจ้งเตือน</h2>
        <NotificationPrefsPanel />
      </section>

      <section id="fs-set-queue" className="scroll-mt-24 max-w-3xl space-y-4">
        <h2 className="text-lg font-bold">คิวงาน</h2>
        <QueueSettingsPanel />
      </section>


      <section id="fs-set-activity" className="scroll-mt-24 max-w-3xl space-y-4">
        <h2 className="text-lg font-bold">ประวัติการใช้งาน</h2>
        <FsActivityLogCard />
      </section>

      {/* Printer Connection Dialog */}
      <NetworkPrinterSettings open={showPrinterDialog} onOpenChange={setShowPrinterDialog} />
    </div>
  );
}