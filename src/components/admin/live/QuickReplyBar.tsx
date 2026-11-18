import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Zap } from "lucide-react";
import { renderTemplate } from "@/lib/templateRender";
import { useAuth } from "@/contexts/AuthContext";

type Tpl = { id: string; name: string; content: string; shortcut: string | null };

type Props = {
  onPick: (text: string) => void;
  order?: any;
  items?: any[];
  total?: number;
};

export default function QuickReplyBar({ onPick, order, items = [], total = 0 }: Props) {
  const { user } = useAuth();
  const [tpls, setTpls] = useState<Tpl[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("reply_templates" as any)
        .select("id,name,content,shortcut,quick_reply,is_active,sort_order")
        .eq("is_active", true)
        .eq("quick_reply", true)
        .order("sort_order", { ascending: true });
      setTpls(((data ?? []) as any[]).map((r) => ({
        id: r.id, name: r.name, content: r.content, shortcut: r.shortcut ?? null,
      })));
    })();
  }, []);

  if (tpls.length === 0) return null;

  const adminName = (user?.user_metadata as any)?.full_name || user?.email || undefined;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <Zap className="w-3 h-3" /> ตอบเร็ว:
      </div>
      {tpls.map((t) => (
        <Button
          key={t.id}
          size="sm"
          variant="outline"
          className="h-7 text-xs rounded-full"
          onClick={() =>
            onPick(renderTemplate(t.content, {
              order: order || {}, items, total, adminName,
            }))
          }
          title={t.shortcut || undefined}
        >
          {t.name}
        </Button>
      ))}
    </div>
  );
}