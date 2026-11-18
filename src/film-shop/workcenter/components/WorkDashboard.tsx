import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Inbox, Palette, Store, Zap } from 'lucide-react';
import { StatTile } from '@/film-shop/components/common/Pieces';
import { useWorkcenterCtx } from '@/film-shop/workcenter/components/WorkcenterProvider';
import type { QueueFilter } from '@/film-shop/workcenter/components/WorkQueueBoard';

/** Dashboard ภายใน — กดการ์ดแล้วกรองคิวงานจริง */
export function WorkDashboard({ onFilter }: { onFilter: (f: QueueFilter) => void }) {
  const { stats } = useWorkcenterCtx();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="work-dashboard">
      <StatTile icon={Inbox} label="งานเข้าใหม่" value={stats.newToday} tone="primary" onClick={() => onFilter({ status: 'new' })} />
      <StatTile icon={ClipboardCheck} label="รอตรวจสอบออเดอร์" value={stats.orderReview} tone="primary" onClick={() => onFilter({ status: 'order_review' })} />
      <StatTile icon={Palette} label="รอคิวออกแบบ" value={stats.designQueue} onClick={() => onFilter({ status: 'design_queue' })} />
      <StatTile icon={Zap} label="งานด่วน" value={stats.urgent} tone="urgent" onClick={() => onFilter({ urgent: true })} />
      <StatTile icon={Clock} label="ใกล้ครบกำหนด/เลยกำหนด" value={stats.dueSoon} tone="urgent" onClick={() => onFilter({ dueSoon: true })} />
      <StatTile icon={AlertTriangle} label="งานติดปัญหา (รอข้อมูล/รออนุมัติ)" value={stats.problem} tone="urgent" onClick={() => onFilter({ problem: true })} />
      <StatTile icon={Store} label="งานอยู่ร้านใหญ่" value={stats.atSupplier} onClick={() => onFilter({ outsourced: true })} />
      <StatTile icon={CheckCircle2} label="พร้อมส่งมอบ" value={stats.ready} tone="success" onClick={() => onFilter({ status: 'ready' })} />
    </div>
  );
}