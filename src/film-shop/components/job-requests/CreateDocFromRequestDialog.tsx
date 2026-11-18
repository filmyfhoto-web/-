import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceForm } from "@/film-shop/components/invoices/InvoiceForm";
import { useAppData } from "@/film-shop/hooks/useAppData";
import { supabase } from "@/film-shop/lib/supabase";
import { toast } from "sonner";
import { VinylItem, Invoice } from "@/film-shop/types";

interface JobReq {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  category: string | null;
  title: string;
  description: string | null;
  width: number | null;
  length: number | null;
  quantity: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: JobReq | null;
  docType: Invoice["type"];
  onLinked: (linked: { invoiceId: string; type: string }) => void;
}

export function CreateDocFromRequestDialog({ open, onOpenChange, request, docType, onLinked }: Props) {
  const { settings } = useAppData();

  if (!request) return null;

  const w = Number(request.width) || 0;
  const h = Number(request.length) || 0;
  const qty = Number(request.quantity) || 1;
  const pricePerSqm = settings.defaultPricePerSqm || 150;
  const area = w * h;
  const pricePerPiece = area > 0 ? area * pricePerSqm : pricePerSqm;
  const total = pricePerPiece * qty;

  const initialItems: VinylItem[] = [
    {
      id: crypto.randomUUID(),
      name: request.title,
      width: w,
      height: h,
      pricePerSqm,
      quantity: qty,
      unit: area > 0 ? "ตร.ม." : "ชิ้น",
      discount: 0,
      pricePerPiece,
      total,
      category: request.category || undefined,
    },
  ];

  const handleSaved = async (created: { id?: string; invoiceNumber: string }) => {
    if (!created.id) return;
    const { error } = await supabase
      .from("job_requests")
      .update({
        linked_invoice_id: created.id,
        linked_doc_type: docType,
        status: "in-progress",
      })
      .eq("id", request.id);
    if (error) {
      toast.error("เชื่อมโยงเอกสารกับคำสั่งงานไม่สำเร็จ");
      return;
    }
    toast.success(`เชื่อมโยง ${created.invoiceNumber} กับคำสั่งงานแล้ว`);

    // Notify admins via LINE (non-blocking)
    supabase.functions.invoke("notify-doc-created", {
      body: {
        invoiceId: created.id,
        invoiceNumber: created.invoiceNumber,
        docType,
        customerName: request.customer_name,
        total,
        jobRequestTitle: request.title,
      },
    }).catch((e) => console.error("notify-doc-created failed", e));

    onLinked({ invoiceId: created.id, type: docType });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            สร้าง{docType === "quotation" ? "ใบเสนอราคา" : docType === "invoice" ? "ใบวางบิล" : "ใบเสร็จ"}จากคำสั่งงาน
          </DialogTitle>
        </DialogHeader>
        <InvoiceForm
          onClose={() => onOpenChange(false)}
          initialItems={initialItems}
          sourceJobRequestId={request.id}
          onSaved={handleSaved}
          initialData={{
            type: docType,
            customerName: request.customer_name,
            customerPhone: request.customer_phone || "",
            notes: request.description || "",
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
