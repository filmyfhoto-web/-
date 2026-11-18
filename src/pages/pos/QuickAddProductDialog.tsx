import { Dialog, DialogContent } from "@/components/ui/dialog";
import ProductForm from "@/components/products/ProductForm";
import type { SavedProduct } from "@/lib/productSave";

/**
 * QuickAddProductDialog — POS "เพิ่มสินค้า" dialog. Delegates to the shared
 * ProductForm so the layout matches admin / stock / staff exactly.
 */
export type QuickAddCreated = SavedProduct;

export default function QuickAddProductDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (p: QuickAddCreated) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 overflow-hidden gap-0 max-h-[92vh] flex flex-col"
        data-testid="pos-quick-add-dialog"
      >
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-5 py-3">
          <div className="text-xs opacity-90">ตัวจัดการสินค้า</div>
          <div className="text-lg font-bold leading-tight">เพิ่มสินค้า</div>
        </div>
        <div className="overflow-y-auto p-5">
          <ProductForm
            mode="create"
            onCancel={() => onOpenChange(false)}
            onSaved={(p) => {
              onCreated(p);
              onOpenChange(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}