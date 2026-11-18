import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkcenterProvider } from '@/film-shop/workcenter/components/WorkcenterProvider';
import { WorkDashboard } from '@/film-shop/workcenter/components/WorkDashboard';
import { WorkIntakePage } from '@/film-shop/workcenter/components/WorkIntakePage';
import { WorkQueueBoard, type QueueFilter } from '@/film-shop/workcenter/components/WorkQueueBoard';
import { OutsourcePage } from '@/film-shop/workcenter/components/OutsourcePage';

/** ศูนย์รับงานภายในร้าน / รันคิวงาน — mobile-first, ภาษาไทยทั้งหมด */
export function WorkcenterPage() {
  const [tab, setTab] = useState('board');
  const [filter, setFilter] = useState<QueueFilter>({});
  const [search, setSearch] = useState('');

  return (
    <WorkcenterProvider>
      <div className="space-y-4" data-testid="workcenter">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขงาน / ออเดอร์ / ชื่อลูกค้า / เบอร์โทร"
              aria-label="ค้นหางาน"
              data-testid="work-search"
              className="h-10 pl-8"
            />
          </div>
          <Button asChild variant="outline" size="sm" className="h-10 gap-1.5" data-testid="link-control-room">
            <Link to="/admin/control-room">
              <ShieldAlert className="h-4 w-4" />
              ห้องควบคุมงาน
            </Link>
          </Button>
        </div>

        <WorkDashboard onFilter={(f) => { setFilter(f); setTab('board'); }} />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="intake" data-testid="tab-intake">รับงานใหม่</TabsTrigger>
            <TabsTrigger value="board" data-testid="tab-board">รันคิวงาน</TabsTrigger>
            <TabsTrigger value="outsource" data-testid="tab-outsource">งานส่งร้านใหญ่</TabsTrigger>
          </TabsList>
          <TabsContent value="intake" className="mt-4">
            <WorkIntakePage onDone={() => setTab('board')} />
          </TabsContent>
          <TabsContent value="board" className="mt-4">
            <WorkQueueBoard key={JSON.stringify(filter)} initialFilter={filter} search={search} />
          </TabsContent>
          <TabsContent value="outsource" className="mt-4">
            <OutsourcePage />
          </TabsContent>
        </Tabs>
      </div>
    </WorkcenterProvider>
  );
}