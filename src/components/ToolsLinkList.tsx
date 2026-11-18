import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export type ToolLink = { to: string; label: string; desc?: string };
export type ToolGroup = { title: string; links: ToolLink[] };

/**
 * Shared "advanced tools" list: grouped links plus a search box.
 * Used by the one tools page per workspace so daily menus stay short
 * while every feature is still one search away.
 */
export default function ToolsLinkList({ groups }: { groups: ToolGroup[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = groups
    .map((g) => ({
      ...g,
      links: g.links.filter(
        (l) => !query || `${l.label} ${l.desc ?? ""}`.toLowerCase().includes(query),
      ),
    }))
    .filter((g) => g.links.length > 0);

  return (
    <div className="space-y-4" data-testid="tools-link-list">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาเครื่องมือ"
          className="pl-9 rounded-xl h-11"
          data-testid="tools-search"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">ไม่พบเครื่องมือที่ค้นหา</p>
      ) : (
        filtered.map((g) => (
          <section key={g.title} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.title}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-2xl border bg-card px-4 py-3 hover:bg-accent transition-colors"
                >
                  <div className="font-semibold text-sm">{l.label}</div>
                  {l.desc && <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
