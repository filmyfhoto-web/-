import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Save, RotateCcw, Bell, ScanLine } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_BADGE_SETTINGS,
  loadBadgeSettings,
  saveBadgeSettings,
  type PosBadgeSettings,
  type PoStatus,
} from "@/lib/posBadgeSettings";
import { usePosBadges } from "@/hooks/usePosBadges";
import PwaCacheResetCard from "@/components/PwaCacheResetCard";
import {
  loadScanPrefs,
  saveScanPrefs,
  DEFAULT_SCAN_PREFS,
  type ScanPrefs,
  type DeviceProfile,
} from "./scanPrefs";
import {
  loadBarcodeRules,
  saveBarcodeRules,
  DEFAULT_RULES,
  type BarcodeRules,
} from "./barcodeRules";

import {
  DEFAULT_POS_SETTINGS as DEFAULTS,
  loadPosSettings as load,
  savePosSettings,
  type PosSettingsPrefs as Prefs,
} from "./receiptPrefs";

export default function PosSettings() {
  const [p, setP] = useState<Prefs>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [n, setN] = useState<PosBadgeSettings>(DEFAULT_BADGE_SETTINGS);
  const [nDirty, setNDirty] = useState(false);
  const badges = usePosBadges();
  const [sp, setSp] = useState<ScanPrefs>(DEFAULT_SCAN_PREFS);
  const [rules, setRules] = useState<BarcodeRules>(DEFAULT_RULES);
  const [scanDirty, setScanDirty] = useState(false);

  useEffect(() => {
    setP(load());
    setN(loadBadgeSettings());
    setSp(loadScanPrefs());
    setRules(loadBarcodeRules());
  }, []);
  function upd<K extends keyof Prefs>(k: K, v: Prefs[K]) { setP((old) => ({ ...old, [k]: v })); setDirty(true); }
  function updN(next: PosBadgeSettings) { setN(next); setNDirty(true); }
  function updSp<K extends keyof ScanPrefs>(k: K, v: ScanPrefs[K]) {
    setSp((old) => ({ ...old, [k]: v }));
    setScanDirty(true);
  }
  function updRules<K extends keyof BarcodeRules>(k: K, v: BarcodeRules[K]) {
    setRules((old) => ({ ...old, [k]: v }));
    setScanDirty(true);
  }
  function saveScan() {
    saveScanPrefs(sp);
    saveBarcodeRules(rules);
    setScanDirty(false);
    toast.success("บันทึกการตั้งค่าสแกนแล้ว");
  }
  function resetScan() {
    if (!confirm("รีเซ็ตการตั้งค่าสแกนเป็นค่าเริ่มต้น?")) return;
    setSp(DEFAULT_SCAN_PREFS);
    setRules(DEFAULT_RULES);
    setScanDirty(true);
  }

  function save() {
    savePosSettings(p);
    setDirty(false);
    toast.success("บันทึกการตั้งค่าแล้ว");
  }
  function reset() {
    if (!confirm("รีเซ็ตค่าเริ่มต้นทั้งหมด?")) return;
    setP(DEFAULTS); setDirty(true);
  }
  function saveN() {
    saveBadgeSettings(n);
    setNDirty(false);
    toast.success("บันทึกการแจ้งเตือนแล้ว");
  }
  function resetN() {
    if (!confirm("รีเซ็ตค่าแจ้งเตือนเป็นค่าเริ่มต้น?")) return;
    setN(DEFAULT_BADGE_SETTINGS); setNDirty(true);
  }

  const PO_STATUSES: { value: PoStatus; label: string }[] = [
    { value: "draft", label: "ร่าง" },
    { value: "pending_approval", label: "รออนุมัติ" },
    { value: "approved_waiting_receipt", label: "อนุมัติแล้ว รอรับสินค้า" },
    { value: "ordered", label: "สั่งซื้อแล้ว" },
  ];
  const DELIVERY_STATUSES: { value: "preparing" | "shipping" | "delivered"; label: string }[] = [
    { value: "preparing", label: "กำลังเตรียม" },
    { value: "shipping", label: "กำลังจัดส่ง" },
    { value: "delivered", label: "ส่งสำเร็จ" },
  ];

  return (
    <div className="p-3 md:p-5 max-w-[900px] mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /> ตั้งค่า POS</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-1" /> รีเซ็ต</Button>
          <Button onClick={save} disabled={!dirty} className="bg-blue-600 hover:bg-blue-700 text-white"><Save className="h-4 w-4 mr-1" /> บันทึก</Button>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">ทั่วไป</TabsTrigger>
          <TabsTrigger value="printer">เครื่องพิมพ์</TabsTrigger>
          <TabsTrigger value="tax">ภาษี &amp; เลขที่บิล</TabsTrigger>
          <TabsTrigger value="scanner" data-testid="tab-scanner">
            <ScanLine className="h-3.5 w-3.5 mr-1" /> การสแกนบาร์โค้ด
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="h-3.5 w-3.5 mr-1" /> การแจ้งเตือน
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scanner">
          <Card className="p-4 space-y-4" data-testid="scanner-panel">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>โปรไฟล์อุปกรณ์สแกน</Label>
                <Select
                  value={sp.deviceProfile}
                  onValueChange={(v) => updSp("deviceProfile", v as DeviceProfile)}
                >
                  <SelectTrigger data-testid="scan-device-profile"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">อัตโนมัติ (แนะนำ)</SelectItem>
                    <SelectItem value="usb-wedge">USB / คีย์บอร์ดเวดจ์</SelectItem>
                    <SelectItem value="mobile-app">แอปมือถือ / Bluetooth</SelectItem>
                    <SelectItem value="camera">เฉพาะกล้อง (ปิดคีย์บอร์ด)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  ปรับความเร็ว/รูปแบบการอ่านคีย์ให้เข้ากับอุปกรณ์ที่ใช้
                </p>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  data-testid="scan-rapid"
                  checked={sp.rapidScanEnabled}
                  onCheckedChange={(v) => updSp("rapidScanEnabled", v)}
                />
                <Label>เปิดโหมดยิงบาร์โค้ดรัวๆ</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  data-testid="scan-continuous"
                  checked={sp.continuousCamera}
                  onCheckedChange={(v) => updSp("continuousCamera", v)}
                />
                <Label>กล้อง: ยิงต่อเนื่อง</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  data-testid="scan-flash"
                  checked={sp.flashEnabled}
                  onCheckedChange={(v) => updSp("flashEnabled", v)}
                />
                <Label>แสดงแฟลชสีเขียวเมื่อยิงสำเร็จ</Label>
              </div>
              <div className="md:col-span-2">
                <Label>ระดับเสียงบี๊บ ({Math.round(sp.beepVolume * 100)}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(sp.beepVolume * 100)}
                  onChange={(e) => updSp("beepVolume", Number(e.target.value) / 100)}
                  data-testid="scan-volume"
                  className="w-full"
                />
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="font-semibold text-sm">กฎอ่านบาร์โค้ด (Barcode rules)</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>ตัด prefix</Label>
                  <Input
                    value={rules.stripPrefix}
                    onChange={(e) => updRules("stripPrefix", e.target.value)}
                    placeholder="เช่น 00, TH"
                    data-testid="rule-prefix"
                  />
                </div>
                <div>
                  <Label>ตัด suffix</Label>
                  <Input
                    value={rules.stripSuffix}
                    onChange={(e) => updRules("stripSuffix", e.target.value)}
                    placeholder="เช่น -1"
                    data-testid="rule-suffix"
                  />
                </div>
                <div>
                  <Label>ความยาวที่ยอมรับ (คั่นด้วย , เช่น 8,12,13)</Label>
                  <Input
                    value={rules.allowedLengths.join(",")}
                    onChange={(e) =>
                      updRules(
                        "allowedLengths",
                        e.target.value
                          .split(",")
                          .map((s) => Number(s.trim()))
                          .filter((n) => Number.isFinite(n) && n > 0),
                      )
                    }
                    placeholder="เว้นว่าง = รับทุกความยาว"
                    data-testid="rule-lengths"
                  />
                </div>
                <div>
                  <Label>ตัวพิมพ์</Label>
                  <Select value={rules.caseMode} onValueChange={(v) => updRules("caseMode", v as BarcodeRules["caseMode"])}>
                    <SelectTrigger data-testid="rule-case"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asis">ตามที่ได้รับ</SelectItem>
                      <SelectItem value="upper">พิมพ์ใหญ่</SelectItem>
                      <SelectItem value="lower">พิมพ์เล็ก</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                กฎเหล่านี้จะถูกใช้ก่อนค้นหาสินค้าทุกครั้ง (ทั้ง USB, กล้อง, ถ่ายรูป และช่องพิมพ์)
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetScan}>
                <RotateCcw className="h-4 w-4 mr-1" /> รีเซ็ตค่าสแกน
              </Button>
              <Button
                onClick={saveScan}
                disabled={!scanDirty}
                data-testid="scan-save"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Save className="h-4 w-4 mr-1" /> บันทึกค่าสแกน
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="general">
          <Card className="p-4 grid md:grid-cols-2 gap-3">
            <div>
              <Label>ป้ายชื่อร้าน (แสดงบนหน้า POS)</Label>
              <Input value={p.storeLabel} onChange={(e) => upd("storeLabel", e.target.value)} placeholder="เช่น ร้านเครื่องเขียน" />
            </div>
            <div>
              <Label>สกุลเงิน</Label>
              <Select value={p.currency} onValueChange={(v) => upd("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="THB">บาท (THB)</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>รูปแบบวันที่</Label>
              <Select value={p.dateFormat} onValueChange={(v) => upd("dateFormat", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="th">ไทย (พ.ศ.)</SelectItem>
                  <SelectItem value="iso">ISO (ค.ศ.)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="printer">
          <Card className="p-4 grid md:grid-cols-2 gap-3">
            <div>
              <Label>ขนาดกระดาษเริ่มต้น</Label>
              <Select value={p.paperSize} onValueChange={(v) => upd("paperSize", v as any)}>
                <SelectTrigger data-testid="settings-paper"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="80mm">ใบเสร็จ 80 มม.</SelectItem>
                  <SelectItem value="58mm">ใบเสร็จ 58 มม.</SelectItem>
                  <SelectItem value="A4">A4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>จำนวนสำเนา</Label>
              <Input type="number" min={1} max={5} value={p.copies} onChange={(e) => upd("copies", Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="md:col-span-2 flex items-center gap-3 pt-2">
              <Switch checked={p.autoPrint} onCheckedChange={(v) => upd("autoPrint", v)} />
              <Label>พิมพ์อัตโนมัติหลังเก็บเงิน</Label>
            </div>
            <div className="md:col-span-2 border-t pt-3 font-semibold text-sm">ข้อมูลร้านบนใบเสร็จ</div>
            <div>
              <Label>ชื่อร้าน</Label>
              <Input value={p.storeName} onChange={(e) => upd("storeName", e.target.value)} placeholder="เช่น ร้านเครื่องเขียน YYNATTA" data-testid="settings-store-name" />
            </div>
            <div>
              <Label>เบอร์โทร</Label>
              <Input value={p.storePhone} onChange={(e) => upd("storePhone", e.target.value)} />
            </div>
            <div>
              <Label>ที่อยู่</Label>
              <Input value={p.storeAddress} onChange={(e) => upd("storeAddress", e.target.value)} />
            </div>
            <div>
              <Label>เลขประจำตัวผู้เสียภาษี</Label>
              <Input value={p.storeTaxId} onChange={(e) => upd("storeTaxId", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>ข้อความท้ายใบเสร็จ</Label>
              <Input value={p.receiptFooter} onChange={(e) => upd("receiptFooter", e.target.value)} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tax">
          <Card className="p-4 grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2 flex items-center gap-3">
              <Switch checked={p.vatEnabled} onCheckedChange={(v) => upd("vatEnabled", v)} data-testid="settings-vat-enabled" />
              <Label>แสดง VAT บนใบเสร็จ (ใบกำกับภาษีอย่างย่อ)</Label>
            </div>
            <div>
              <Label>VAT (%)</Label>
              <Input type="number" min={0} max={30} step={0.5} value={p.vatRate} onChange={(e) => upd("vatRate", Number(e.target.value) || 0)} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={p.vatIncluded} onCheckedChange={(v) => upd("vatIncluded", v)} />
              <Label>ราคาสินค้ารวม VAT แล้ว</Label>
            </div>
            <div>
              <Label>คำนำหน้าเลขที่บิล</Label>
              <Input value={p.receiptPrefix} onChange={(e) => upd("receiptPrefix", e.target.value)} placeholder="R" />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="p-4 space-y-4" data-testid="notifications-panel">
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/40">
              <div>
                <div className="font-semibold flex items-center gap-2"><Bell className="h-4 w-4" /> เปิดใช้แจ้งเตือนจุดแดงทั้งหมด</div>
                <div className="text-xs text-muted-foreground">ปิดสวิตช์นี้เพื่อซ่อนจุดแดงทุกเมนู</div>
              </div>
              <Switch
                data-testid="notif-master"
                checked={n.enabled}
                onCheckedChange={(v) => updN({ ...n, enabled: v })}
              />
            </div>

            {/* Delivery */}
            <div className={`rounded-lg border p-3 space-y-2 ${n.enabled ? "" : "opacity-50"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">จัดส่งสินค้า <span className="ml-2 text-xs text-muted-foreground">ปัจจุบัน {badges.delivery} รายการ</span></div>
                  <div className="text-xs text-muted-foreground">แจ้งเมื่อมีออเดอร์รอเตรียม/รอส่ง</div>
                </div>
                <Switch
                  data-testid="notif-delivery"
                  disabled={!n.enabled}
                  checked={n.delivery.enabled}
                  onCheckedChange={(v) => updN({ ...n, delivery: { ...n.delivery, enabled: v } })}
                />
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                {DELIVERY_STATUSES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={!n.enabled || !n.delivery.enabled}
                      checked={n.delivery.statuses.includes(s.value)}
                      onCheckedChange={(v) => {
                        const set = new Set(n.delivery.statuses);
                        if (v) set.add(s.value); else set.delete(s.value);
                        updN({ ...n, delivery: { ...n.delivery, statuses: Array.from(set) as any } });
                      }}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Low stock */}
            <div className={`rounded-lg border p-3 space-y-2 ${n.enabled ? "" : "opacity-50"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">สินค้าใกล้หมด <span className="ml-2 text-xs text-muted-foreground">ปัจจุบัน {badges.lowStock} รายการ</span></div>
                  <div className="text-xs text-muted-foreground">ใช้ค่าเริ่มต้นเมื่อสินค้าไม่ได้กำหนดเกณฑ์เอง</div>
                </div>
                <Switch
                  data-testid="notif-low"
                  disabled={!n.enabled}
                  checked={n.lowStock.enabled}
                  onCheckedChange={(v) => updN({ ...n, lowStock: { ...n.lowStock, enabled: v } })}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-sm">เกณฑ์ต่ำสุดเริ่มต้น</Label>
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  disabled={!n.enabled || !n.lowStock.enabled}
                  value={n.lowStock.defaultThreshold}
                  onChange={(e) => updN({ ...n, lowStock: { ...n.lowStock, defaultThreshold: Math.max(0, Number(e.target.value) || 0) } })}
                />
                <span className="text-xs text-muted-foreground">ชิ้น</span>
              </div>
            </div>

            {/* PO */}
            <div className={`rounded-lg border p-3 space-y-2 ${n.enabled ? "" : "opacity-50"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">ใบสั่งซื้อ (PO) ค้าง <span className="ml-2 text-xs text-muted-foreground">ปัจจุบัน {badges.pendingPo} รายการ</span></div>
                  <div className="text-xs text-muted-foreground">เลือกสถานะที่ต้องการนับ</div>
                </div>
                <Switch
                  data-testid="notif-po"
                  disabled={!n.enabled}
                  checked={n.pendingPo.enabled}
                  onCheckedChange={(v) => updN({ ...n, pendingPo: { ...n.pendingPo, enabled: v } })}
                />
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                {PO_STATUSES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={!n.enabled || !n.pendingPo.enabled}
                      checked={n.pendingPo.statuses.includes(s.value)}
                      onCheckedChange={(v) => {
                        const set = new Set(n.pendingPo.statuses);
                        if (v) set.add(s.value); else set.delete(s.value);
                        updN({ ...n, pendingPo: { ...n.pendingPo, statuses: Array.from(set) as PoStatus[] } });
                      }}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Pending receipts */}
            <div className={`rounded-lg border p-3 space-y-2 ${n.enabled ? "" : "opacity-50"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">ใบเสร็จค้างชำระ <span className="ml-2 text-xs text-muted-foreground">ปัจจุบัน {badges.pendingReceipts} รายการ</span></div>
                  <div className="text-xs text-muted-foreground">แจ้งเมื่อสถานะการชำระ = รอชำระ</div>
                </div>
                <Switch
                  data-testid="notif-receipts"
                  disabled={!n.enabled}
                  checked={n.pendingReceipts.enabled}
                  onCheckedChange={(v) => updN({ ...n, pendingReceipts: { enabled: v } })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetN}><RotateCcw className="h-4 w-4 mr-1" /> รีเซ็ตแจ้งเตือน</Button>
              <Button
                onClick={saveN}
                disabled={!nDirty}
                data-testid="notif-save"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Save className="h-4 w-4 mr-1" /> บันทึกการแจ้งเตือน
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <PwaCacheResetCard />

      <p className="text-xs text-muted-foreground">ค่าเหล่านี้เก็บในเครื่องนี้ (localStorage) เพื่อใช้กับหน้า POS</p>
    </div>
  );
}