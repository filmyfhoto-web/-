import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Activity, Monitor, MapPin, Users, Search } from "lucide-react";

export default function AdminSecurity() {
  const [events, setEvents] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("login_events")
        .select("*")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(500);
      const rows = data ?? [];
      setEvents(rows);
      const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        const map: Record<string, any> = {};
        (ps ?? []).forEach((p: any) => { map[p.id] = p; });
        setProfiles(map);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayCount = events.filter(e => new Date(e.occurred_at) >= today).length;
    const uniqueUsers = new Set(events.map(e => e.user_id)).size;
    const uniqueCountries = new Set(events.map(e => e.country).filter(Boolean)).size;
    return { total: events.length, today: todayCount, uniqueUsers, uniqueCountries };
  }, [events]);

  const daily = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const count = events.filter(e => {
        const t = new Date(e.occurred_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      days.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, count });
    }
    return days;
  }, [events]);
  const maxDaily = Math.max(1, ...daily.map(d => d.count));

  const filtered = useMemo(() => {
    if (!q) return events;
    const t = q.toLowerCase();
    return events.filter(e => {
      const p = profiles[e.user_id];
      return (p?.full_name || "").toLowerCase().includes(t)
        || (p?.email || "").toLowerCase().includes(t)
        || (e.country || "").toLowerCase().includes(t)
        || (e.city || "").toLowerCase().includes(t)
        || (e.ip || "").includes(t);
    });
  }, [events, profiles, q]);

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-1">ความปลอดภัย / Log การเข้าใช้งาน</h1>
      <p className="text-sm text-muted-foreground mb-5">บันทึกผู้ใช้ที่เข้าสู่ระบบ พร้อมอุปกรณ์และที่ตั้งโดยประมาณ (30 วันล่าสุด)</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat icon={Activity} label="เข้าสู่ระบบวันนี้" value={stats.today} />
        <Stat icon={Users} label="ผู้ใช้ที่เข้าใช้งาน (30 วัน)" value={stats.uniqueUsers} />
        <Stat icon={Monitor} label="ทั้งหมด (30 วัน)" value={stats.total} />
        <Stat icon={MapPin} label="ประเทศ" value={stats.uniqueCountries} />
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-card p-5 mb-5">
        <div className="font-semibold mb-3">ผู้ใช้งานรายวัน (30 วัน)</div>
        <div className="flex items-end gap-1 h-32">
          {daily.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.count}`}>
              <div className="w-full bg-primary/80 hover:bg-primary rounded-t-md transition-all"
                style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }} />
              {i % 5 === 0 && <div className="text-[10px] text-muted-foreground">{d.date}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อ/อีเมล/IP/ประเทศ..." className="rounded-xl pl-10" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent text-xs">
              <tr>
                <th className="text-left p-3">เวลา</th>
                <th className="text-left p-3">ผู้ใช้</th>
                <th className="text-left p-3">อุปกรณ์</th>
                <th className="text-left p-3">ที่ตั้ง</th>
                <th className="text-left p-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const p = profiles[e.user_id];
                return (
                  <tr key={e.id} className="border-t border-border hover:bg-accent/30">
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(e.occurred_at)}</td>
                    <td className="p-3">
                      <div className="font-medium">{p?.full_name || "-"}</div>
                      <div className="text-xs text-muted-foreground">{p?.email}</div>
                    </td>
                    <td className="p-3 text-xs">{e.device || "-"}</td>
                    <td className="p-3 text-xs">{[e.city, e.region, e.country].filter(Boolean).join(", ") || "-"}</td>
                    <td className="p-3 text-xs font-mono">{e.ip || "-"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">ยังไม่มีข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 shadow-card flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center text-primary">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="font-bold text-xl">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}