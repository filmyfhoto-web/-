import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { VinylItem, ProductType } from '@/film-shop/types';
import { Calculator, Plus, Trash2, FileText, Settings2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ManageProductTypesDialog } from './ManageProductTypesDialog';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const FALLBACK_LABELS: Record<string, string> = {
  vinyl: 'ไวนิล',
  paswood: 'พาสวูด',
  sticker: 'สติ๊กเกอร์',
  foamboard: 'โฟมบอร์ด',
};

interface CalculatorProps {
  onCreateInvoice?: (items: VinylItem[]) => void;
}

export function VinylCalculator({ onCreateInvoice }: CalculatorProps) {
  const { settings } = useAppData();

  const productLabels: Record<string, string> = {
    ...FALLBACK_LABELS,
    ...(settings.productLabels || {}),
  };
  // Only keep keys that exist in productLabels (so deleted types disappear)
  const productKeys = Object.keys(settings.productLabels && Object.keys(settings.productLabels).length > 0
    ? settings.productLabels
    : FALLBACK_LABELS);

  const [productType, setProductType] = useState<ProductType>(productKeys[0] || 'vinyl');
  const [name, setName] = useState('');
  const [width, setWidth] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [unit, setUnit] = useState<'meter' | 'foot'>('meter');
  const [pricePerSqm, setPricePerSqm] = useState<string>(
    (settings.productPricing?.[productKeys[0] || 'vinyl'] ?? settings.defaultPricePerSqm).toString()
  );
  const [quantity, setQuantity] = useState<string>('1');
  const [discount, setDiscount] = useState<string>('0');

  const [pricePerPiece, setPricePerPiece] = useState(0);
  const [totalPrice, setTotalPrice] = useState(0);

  const [items, setItems] = useState<VinylItem[]>([]);
  const [manageOpen, setManageOpen] = useState(false);

  // If currently-selected productType disappeared after editing, reset to first available
  useEffect(() => {
    if (productKeys.length > 0 && !productKeys.includes(productType)) {
      setProductType(productKeys[0]);
    }
  }, [productKeys.join('|')]);

  // Update price when product type changes
  useEffect(() => {
    const pricing = settings.productPricing || {};
    const price = pricing[productType];
    setPricePerSqm((price ?? settings.defaultPricePerSqm).toString());
  }, [productType, settings]);

  useEffect(() => {
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const price = parseFloat(pricePerSqm) || 0;
    const qty = parseInt(quantity) || 0;
    const disc = parseFloat(discount) || 0;

    // 1 foot = 0.3048 meter
    const factor = unit === 'foot' ? 0.3048 : 1;
    const area = (w * factor) * (h * factor);
    const unitPrice = area * price;
    const discountedPrice = unitPrice - disc;
    const total = discountedPrice * qty;

    setPricePerPiece(discountedPrice > 0 ? discountedPrice : 0);
    setTotalPrice(total > 0 ? total : 0);
  }, [width, height, pricePerSqm, quantity, discount, unit]);

  const handleAddItem = () => {
    if (!name || !width || !height || pricePerPiece <= 0) return;

    const factor = unit === 'foot' ? 0.3048 : 1;
    const wM = parseFloat(width) * factor;
    const hM = parseFloat(height) * factor;

    const newItem: VinylItem = {
      id: crypto.randomUUID(),
      name: `[${productLabels[productType]}] ${name}`,
      width: wM,
      height: hM,
      pricePerSqm: parseFloat(pricePerSqm),
      quantity: parseInt(quantity) || 1,
      unit: 'ชิ้น',
      discount: parseFloat(discount) || 0,
      pricePerPiece,
      total: totalPrice,
    };

    setItems([...items, newItem]);
    handleClear();
  };

  const handleClear = () => {
    setName('');
    setWidth('');
    setHeight('');
    setQuantity('1');
    setDiscount('0');
    setPricePerPiece(0);
    setTotalPrice(0);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="space-y-6 animate-fade-in">
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Calculator Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            คำนวณราคา
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product Type Selection */}
          <div>
            <div className="flex items-center justify-between">
              <Label>ประเภทสินค้า</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setManageOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                จัดการประเภท
              </Button>
            </div>
            <Select value={productType} onValueChange={(v) => setProductType(v as ProductType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {productKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {productLabels[key] || key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="name">ชื่อป้าย/รายการ</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ป้ายโฆษณา, แบนเนอร์"
            />
          </div>

          <div>
            <Label>หน่วยวัด</Label>
            <Select value={unit} onValueChange={(v) => setUnit(v as 'meter' | 'foot')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meter">เมตร (ม.)</SelectItem>
                <SelectItem value="foot">ฟุต (ft.)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="width">กว้าง ({unit === 'foot' ? 'ฟุต' : 'ม.'})</Label>
              <Input
                id="width"
                type="number"
                step="0.01"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="height">ยาว ({unit === 'foot' ? 'ฟุต' : 'ม.'})</Label>
              <Input
                id="height"
                type="number"
                step="0.01"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="pricePerSqm">ราคา/ตร.ม. (บาท) - {productLabels[productType]}</Label>
            <Input
              id="pricePerSqm"
              type="number"
              value={pricePerSqm}
              onChange={(e) => setPricePerSqm(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              สามารถปรับราคาได้ตามต้องการ (ค่าเริ่มต้นจากตั้งค่าระบบ)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">จำนวน (ชิ้น)</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="discount">ส่วนลด/ชิ้น (บาท)</Label>
              <Input
                id="discount"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>

          {/* Price Display */}
          <div className="mt-6 space-y-3 rounded-lg bg-muted p-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">พื้นที่</span>
              <span className="font-medium">
                {(() => {
                  const w = parseFloat(width) || 0;
                  const h = parseFloat(height) || 0;
                  const factor = unit === 'foot' ? 0.3048 : 1;
                  const sqm = (w * factor) * (h * factor);
                  return unit === 'foot'
                    ? `${(w * h).toFixed(2)} ตร.ฟุต (${sqm.toFixed(2)} ตร.ม.)`
                    : `${sqm.toFixed(2)} ตร.ม.`;
                })()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium text-foreground">ราคา/ชิ้น</span>
              <span className="text-2xl font-bold text-primary">
                {formatCurrency(pricePerPiece)} บาท
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-border pt-3">
              <span className="font-medium text-foreground">รวม</span>
              <span className="text-2xl font-bold bg-price-highlight text-price-highlight-foreground px-3 py-1 rounded">
                {formatCurrency(totalPrice)} บาท
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAddItem} className="flex-1" disabled={!name || pricePerPiece <= 0}>
              <Plus className="h-4 w-4" />
              เพิ่มรายการ
            </Button>
            <Button variant="outline" onClick={handleClear}>
              ล้าง
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              รายการ
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {items.length} รายการ
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-50" />
              <p>ยังไม่มีรายการ</p>
              <p className="text-sm">เพิ่มรายการจากเครื่องคำนวณ</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-table-header">
                      <TableHead>รายการ</TableHead>
                      <TableHead className="text-center">ขนาด</TableHead>
                      <TableHead className="text-center">ราคา/ตร.ม.</TableHead>
                      <TableHead className="text-center">จำนวน</TableHead>
                      <TableHead className="text-center">ส่วนลด/ชิ้น</TableHead>
                      <TableHead className="text-right">ราคา/ชิ้น</TableHead>
                      <TableHead className="text-right">รวม</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item.id} className={index % 2 === 1 ? 'bg-table-row-alt' : ''}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-center text-sm">
                          {item.width} x {item.height} ม.
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            className="w-16 text-center h-7 text-sm"
                            value={item.pricePerSqm}
                            onChange={(e) => {
                              const newPricePerSqm = parseFloat(e.target.value) || 0;
                              const area = item.width * item.height;
                              const newPricePerPiece = (area * newPricePerSqm) - item.discount;
                              const newTotal = newPricePerPiece * item.quantity;
                              setItems(items.map(i => 
                                i.id === item.id 
                                  ? { ...i, pricePerSqm: newPricePerSqm, pricePerPiece: newPricePerPiece > 0 ? newPricePerPiece : 0, total: newTotal > 0 ? newTotal : 0 }
                                  : i
                              ));
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="1"
                            className="w-14 text-center h-7 text-sm"
                            value={item.quantity}
                            onChange={(e) => {
                              const newQuantity = parseInt(e.target.value) || 1;
                              const newTotal = item.pricePerPiece * newQuantity;
                              setItems(items.map(i => 
                                i.id === item.id 
                                  ? { ...i, quantity: newQuantity, total: newTotal > 0 ? newTotal : 0 }
                                  : i
                              ));
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            className="w-16 text-center h-7 text-sm"
                            value={item.discount}
                            onChange={(e) => {
                              const newDiscount = parseFloat(e.target.value) || 0;
                              const area = item.width * item.height;
                              const newPricePerPiece = (area * item.pricePerSqm) - newDiscount;
                              const newTotal = newPricePerPiece * item.quantity;
                              setItems(items.map(i => 
                                i.id === item.id 
                                  ? { ...i, discount: newDiscount, pricePerPiece: newPricePerPiece > 0 ? newPricePerPiece : 0, total: newTotal > 0 ? newTotal : 0 }
                                  : i
                              ));
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className="w-20 text-right h-7 text-sm"
                            value={item.pricePerPiece}
                            onChange={(e) => {
                              const newPricePerPiece = parseFloat(e.target.value) || 0;
                              const newTotal = newPricePerPiece * item.quantity;
                              setItems(items.map(i => 
                                i.id === item.id 
                                  ? { ...i, pricePerPiece: newPricePerPiece, total: newTotal > 0 ? newTotal : 0 }
                                  : i
                              ));
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(item.total)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-lg bg-primary p-4">
                <span className="text-lg font-medium text-primary-foreground">รวมทั้งหมด</span>
                <span className="text-2xl font-bold text-primary-foreground">
                  {formatCurrency(grandTotal)} บาท
                </span>
              </div>

              {onCreateInvoice && (
                <Button
                  variant="accent"
                  className="w-full mt-4"
                  onClick={() => onCreateInvoice(items)}
                >
                  <FileText className="h-4 w-4" />
                  สร้างใบเสนอราคา/ใบเสร็จ
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>

    <ManageProductTypesDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}