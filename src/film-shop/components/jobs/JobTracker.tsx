import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { JobStatus } from '@/film-shop/types';
import { ClipboardList, Search, Clock, Loader2, Printer, CheckCircle, Truck, Send, MessageCircle, FileEdit } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const jobStatusConfig: Record<JobStatus, { label: string; color: string; icon: React.ElementType }> = {
  'pending': { label: 'รอดำเนินการ', color: 'bg-muted text-muted-foreground', icon: Clock },
  'in-progress': { label: 'กำลังผลิต', color: 'bg-primary text-primary-foreground', icon: Loader2 },
  'printing': { label: 'กำลังพิมพ์', color: 'bg-accent text-accent-foreground', icon: Printer },
  'completed': { label: 'เสร็จสิ้น', color: 'bg-success text-success-foreground', icon: CheckCircle },
  'delivered': { label: 'ส่งมอบแล้ว', color: 'bg-success/80 text-success-foreground', icon: Truck },
};

export function JobTracker() {
  const { invoices, updateInvoice } = useAppData();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [autoLineNotify, setAutoLineNotify] = useState<boolean>(() => {
    try { return localStorage.getItem('auto_line_notify') === 'true'; } catch { return false; }
  });
  const [sendingLine, setSendingLine] = useState<string | null>(null);

  const [showDrafts, setShowDrafts] = useState<boolean>(false);
  const draftCount = invoices.filter(i => i.isDraft).length;

  const filteredJobs = invoices.filter(invoice => {
    const matchesSearch = invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase());

    if (showDrafts) {
      return matchesSearch && invoice.isDraft;
    }
    if (invoice.isDraft) return false;

    if (statusFilter === 'active') {
      return matchesSearch && invoice.jobStatus !== 'delivered';
    }
    if (statusFilter === 'all') {
      return matchesSearch;
    }
    return matchesSearch && invoice.jobStatus === statusFilter;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleConfirmDraft = async (job: typeof invoices[0]) => {
    if (!job.customerName || job.total <= 0) {
      toast.error('ต้องมีชื่อลูกค้าและยอด > 0 ก่อนยืนยัน');
      return;
    }
    await updateInvoice(job.id, { isDraft: false });
    toast.success(`ยืนยัน ${job.invoiceNumber} เป็นงานจริงแล้ว`);
  };

  const sendLineNotification = async (invoiceId: string, invoiceNumber: string, customerName: string, oldStatus: string, newStatus: string, total: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('notify-job-status', {
        body: { invoiceId, invoiceNumber, customerName, oldStatus, newStatus, total },
      });
      if (error) throw error;
      toast.success('ส่งแจ้งเตือน LINE เรียบร้อย');
    } catch (err) {
      console.error('LINE notify error:', err);
      toast.error('ไม่สามารถส่งแจ้งเตือน LINE ได้');
    }
  };

  const handleStatusChange = async (invoiceId: string, newStatus: JobStatus) => {
    const job = invoices.find(i => i.id === invoiceId);
    if (!job) return;
    
    const oldStatus = job.jobStatus;
    updateInvoice(invoiceId, { jobStatus: newStatus });
    toast.success('อัพเดทสถานะงานเรียบร้อย');

    if (autoLineNotify && oldStatus !== newStatus) {
      await sendLineNotification(job.id, job.invoiceNumber, job.customerName, oldStatus, newStatus, job.total);
    }
  };

  const handleManualLineNotify = async (job: typeof invoices[0]) => {
    setSendingLine(job.id);
    await sendLineNotification(job.id, job.invoiceNumber, job.customerName, job.jobStatus, job.jobStatus, job.total);
    setSendingLine(null);
  };

  const handleAutoNotifyToggle = (checked: boolean) => {
    setAutoLineNotify(checked);
    localStorage.setItem('auto_line_notify', checked.toString());
    toast.success(checked ? 'เปิดแจ้งเตือน LINE อัตโนมัติ' : 'ปิดแจ้งเตือน LINE อัตโนมัติ');
  };

  const getNextStatus = (currentStatus: JobStatus): JobStatus | null => {
    const statusOrder: JobStatus[] = ['pending', 'in-progress', 'printing', 'completed', 'delivered'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    if (currentIndex < statusOrder.length - 1) {
      return statusOrder[currentIndex + 1];
    }
    return null;
  };

  const statusCounts = {
    pending: invoices.filter(i => i.jobStatus === 'pending').length,
    'in-progress': invoices.filter(i => i.jobStatus === 'in-progress').length,
    printing: invoices.filter(i => i.jobStatus === 'printing').length,
    completed: invoices.filter(i => i.jobStatus === 'completed').length,
    delivered: invoices.filter(i => i.jobStatus === 'delivered').length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Status Summary */}
      <div className="grid gap-4 grid-cols-3 md:grid-cols-5">
        {(Object.keys(jobStatusConfig) as JobStatus[]).map((status) => {
          const config = jobStatusConfig[status];
          const Icon = config.icon;
          return (
            <Card key={status} className="cursor-pointer hover:shadow-card-hover transition-shadow"
              onClick={() => setStatusFilter(status)}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{statusCounts[status]}</p>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              ติดตามสถานะงาน
            </CardTitle>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-line"
                  checked={autoLineNotify}
                  onCheckedChange={handleAutoNotifyToggle}
                />
                <Label htmlFor="auto-line" className="text-xs cursor-pointer">LINE อัตโนมัติ</Label>
              </div>

              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ค้นหางาน..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">งานที่กำลังทำ</SelectItem>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="pending">รอดำเนินการ</SelectItem>
                  <SelectItem value="in-progress">กำลังผลิต</SelectItem>
                  <SelectItem value="printing">กำลังพิมพ์</SelectItem>
                  <SelectItem value="completed">เสร็จสิ้น</SelectItem>
                  <SelectItem value="delivered">ส่งมอบแล้ว</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={showDrafts ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowDrafts(v => !v)}
              >
                <FileEdit className="h-4 w-4 mr-1" />
                Draft {draftCount > 0 && <Badge variant="secondary" className="ml-1">{draftCount}</Badge>}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mb-4 opacity-50" />
              <p>ไม่พบงานที่ค้นหา</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredJobs.map((job) => {
                const config = jobStatusConfig[job.jobStatus] ?? jobStatusConfig.pending;
                const Icon = config.icon;
                const nextStatus = getNextStatus(job.jobStatus);

                return (
                  <div
                    key={job.id}
                    className="rounded-lg border border-border p-4 hover:shadow-card-hover transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-lg ${config.color} hidden sm:block`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{job.invoiceNumber}</span>
                            <Badge variant={job.status === 'paid' ? 'default' : 'outline'}>
                              {job.status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ'}
                            </Badge>
                            {job.isDraft && (
                              <Badge variant="outline" className="border-warning text-warning">Draft</Badge>
                            )}
                            {job.createdVia === 'line' && (
                              <MessageCircle className="h-3.5 w-3.5 text-success" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{job.customerName}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            วันที่: {formatDate(job.documentDate || job.createdAt)} | ยอด: {formatCurrency(job.total)} บาท
                          </p>
                          <div className="mt-2">
                            <div className="flex flex-wrap gap-1 mt-1">
                              {job.items.slice(0, 3).map((item, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {item.name} ({item.width}x{item.height}m)
                                </Badge>
                              ))}
                              {job.items.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{job.items.length - 3} รายการ
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <Select
                          value={job.jobStatus}
                          onValueChange={(value) => handleStatusChange(job.id, value as JobStatus)}
                        >
                          <SelectTrigger className="w-full sm:w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">รอดำเนินการ</SelectItem>
                            <SelectItem value="in-progress">กำลังผลิต</SelectItem>
                            <SelectItem value="printing">กำลังพิมพ์</SelectItem>
                            <SelectItem value="completed">เสร็จสิ้น</SelectItem>
                            <SelectItem value="delivered">ส่งมอบแล้ว</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex gap-2">
                          {job.isDraft && (
                            <Button
                              variant="default"
                              size="sm"
                              className="flex-1 sm:flex-none bg-success hover:bg-success/90"
                              onClick={() => handleConfirmDraft(job)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              ยืนยันเป็นงานจริง
                            </Button>
                          )}
                          {!job.isDraft && nextStatus && (
                            <Button
                              variant="accent"
                              size="sm"
                              className="flex-1 sm:flex-none"
                              onClick={() => handleStatusChange(job.id, nextStatus)}
                            >
                              → {jobStatusConfig[nextStatus]?.label ?? "ขั้นถัดไป"}
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleManualLineNotify(job)}
                            disabled={sendingLine === job.id}
                            title="แจ้งเตือน LINE"
                          >
                            <Send className="h-4 w-4" />
                            <span className="hidden sm:inline ml-1">LINE</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
