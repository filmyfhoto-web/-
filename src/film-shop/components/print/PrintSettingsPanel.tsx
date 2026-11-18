import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Printer, Download, Settings2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export type PaperSize = '80mm' | '100x70' | '100x75' | 'A5' | 'A4';

interface PrintSettingsProps {
  paperSize: PaperSize;
  onPaperSizeChange: (size: PaperSize) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  showPriceColumn: boolean;
  onShowPriceColumnChange: (show: boolean) => void;
  showQtyColumn: boolean;
  onShowQtyColumnChange: (show: boolean) => void;
  onPrint: () => void;
  onSaveImage: () => void;
  isLoading?: boolean;
}

export function PrintSettingsPanel({
  paperSize,
  onPaperSizeChange,
  fontSize,
  onFontSizeChange,
  showPriceColumn,
  onShowPriceColumnChange,
  showQtyColumn,
  onShowQtyColumnChange,
  onPrint,
  onSaveImage,
  isLoading = false,
}: PrintSettingsProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          ตั้งค่าการพิมพ์
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onPrint} disabled={isLoading} size="sm">
            <Printer className="h-4 w-4 mr-1" />
            พิมพ์
          </Button>
          <Button onClick={onSaveImage} disabled={isLoading} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            บันทึกรูป
          </Button>
        </div>
      </div>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">
          {isOpen ? '▼ ซ่อนการตั้งค่า' : '▶ แสดงการตั้งค่า'}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4">
          {/* Paper Size */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">ขนาดกระดาษ</Label>
            <div className="flex flex-wrap gap-2">
              {(['80mm', '100x70', '100x75', 'A5', 'A4'] as PaperSize[]).map((size) => (
                <Button
                  key={size}
                  variant={paperSize === size ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onPaperSizeChange(size)}
                  className="flex-1"
                >
                  {size === '100x70' ? '10×7 ซม.' : size === '100x75' ? '10×7.5 ซม.' : size}
                </Button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">ขนาดตัวอักษร: {fontSize}%</Label>
            <Slider
              value={[fontSize]}
              onValueChange={(val) => onFontSizeChange(val[0])}
              min={50}
              max={150}
              step={5}
            />
          </div>

          {/* Column Visibility */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">แสดงคอลัมน์</Label>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showPrice"
                  checked={showPriceColumn}
                  onCheckedChange={(checked) => onShowPriceColumnChange(checked === true)}
                />
                <Label htmlFor="showPrice" className="text-sm cursor-pointer">ราคา/หน่วย</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showQty"
                  checked={showQtyColumn}
                  onCheckedChange={(checked) => onShowQtyColumnChange(checked === true)}
                />
                <Label htmlFor="showQty" className="text-sm cursor-pointer">จำนวน/หน่วย</Label>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
