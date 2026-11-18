import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

/**
 * Optional "ผู้ช่วยค้นหาสินค้า AI" entry.
 *
 * Calls the server-side `ai-product-search` edge function, which turns a Thai
 * sentence into plain keywords. If the server has no AI secret configured (or
 * the call fails) we silently fall back to the customer's raw text and the
 * existing catalogue search — shopping is never blocked.
 */
export default function AiProductSearch({ onSearch }: { onSearch: (term: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-product-search", { body: { query } });
      const terms: string[] = (!error && (data as any)?.terms) || [];
      onSearch(terms[0] || query);
      if ((data as any)?.note) setNote((data as any).note);
      setOpen(false);
    } catch {
      onSearch(query);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl min-h-11 gap-2 border-primary/40 text-primary"
          data-testid="ai-search-entry"
        >
          <Sparkles className="w-4 h-4" aria-hidden /> ผู้ช่วยค้นหาสินค้า AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" aria-hidden /> ผู้ช่วยค้นหาสินค้า AI
          </DialogTitle>
          <DialogDescription>
            พิมพ์สิ่งที่ต้องการเป็นภาษาพูดได้เลย เช่น “อยากได้ปากกาน้ำเงินสำหรับงานโรงเรียน”
          </DialogDescription>
        </DialogHeader>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
          placeholder="อยากได้อะไร บอกได้เลย..."
          className="rounded-xl h-11"
          aria-label="คำค้นหาแบบภาษาพูด"
        />
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        <Button onClick={() => void run()} disabled={busy || !q.trim()} className="rounded-xl h-11 w-full">
          {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังค้นหา...</> : "ค้นหาสินค้า"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
