import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { Employee } from '@/film-shop/types';
import { UserCircle, Plus, Edit2, Trash2, X, Save, Phone, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const positions = ['ผู้จัดการ', 'พนักงานขาย', 'ช่างพิมพ์', 'ช่างติดตั้ง', 'ธุรการ', 'อื่นๆ'];

export function EmployeeManager() {
  const { employees, addEmployee, updateEmployee, deleteEmployee } = useAppData();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    position: '',
    phone: '',
    email: '',
    startDate: new Date().toISOString().split('T')[0],
    isActive: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.position) {
      toast.error('กรุณากรอกชื่อและตำแหน่ง');
      return;
    }

    if (editingEmployee) {
      updateEmployee(editingEmployee.id, {
        ...formData,
        startDate: new Date(formData.startDate),
      });
      toast.success('อัพเดทข้อมูลพนักงานเรียบร้อย');
    } else {
      addEmployee({
        ...formData,
        startDate: new Date(formData.startDate),
      });
      toast.success('เพิ่มพนักงานใหม่เรียบร้อย');
    }

    handleCloseDialog();
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      position: employee.position,
      phone: employee.phone || '',
      email: employee.email || '',
      startDate: new Date(employee.startDate).toISOString().split('T')[0],
      isActive: employee.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('ต้องการลบพนักงานนี้หรือไม่?')) {
      deleteEmployee(id);
      toast.success('ลบพนักงานเรียบร้อย');
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingEmployee(null);
    setFormData({
      name: '',
      position: '',
      phone: '',
      email: '',
      startDate: new Date().toISOString().split('T')[0],
      isActive: true,
    });
  };

  const activeCount = employees.filter(e => e.isActive).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5 text-primary" />
                จัดการข้อมูลพนักงาน
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                พนักงานทั้งหมด {employees.length} คน (ทำงานอยู่ {activeCount} คน)
              </p>
            </div>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingEmployee(null); setFormData({ name: '', position: '', phone: '', email: '', startDate: new Date().toISOString().split('T')[0], isActive: true }); }}>
                  <Plus className="h-4 w-4" />
                  เพิ่มพนักงาน
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingEmployee ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}
                  </DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>ชื่อ-นามสกุล *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="ชื่อพนักงาน"
                    />
                  </div>
                  
                  <div>
                    <Label>ตำแหน่ง *</Label>
                    <Select
                      value={formData.position}
                      onValueChange={(v) => setFormData({ ...formData, position: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="เลือกตำแหน่ง" />
                      </SelectTrigger>
                      <SelectContent>
                        {positions.map(pos => (
                          <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>เบอร์โทรศัพท์</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="0xx-xxx-xxxx"
                    />
                  </div>
                  
                  <div>
                    <Label>อีเมล</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  
                  <div>
                    <Label>วันที่เริ่มงาน</Label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                    <Label>พนักงานยังทำงานอยู่</Label>
                  </div>
                  
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={handleCloseDialog}>
                      <X className="h-4 w-4" />
                      ยกเลิก
                    </Button>
                    <Button type="submit">
                      <Save className="h-4 w-4" />
                      {editingEmployee ? 'บันทึก' : 'เพิ่มพนักงาน'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <UserCircle className="h-12 w-12 mb-4 opacity-50" />
              <p>ยังไม่มีข้อมูลพนักงาน</p>
              <p className="text-sm">คลิก "เพิ่มพนักงาน" เพื่อเริ่มต้น</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {employees.map((employee) => (
                <div
                  key={employee.id}
                  className="rounded-lg border border-border p-4 hover:shadow-card-hover transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold ${employee.isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {employee.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{employee.name}</p>
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      </div>
                    </div>
                    <Badge variant={employee.isActive ? 'default' : 'secondary'}>
                      {employee.isActive ? 'ทำงาน' : 'ลาออก'}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    {employee.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        {employee.phone}
                      </div>
                    )}
                    {employee.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        {employee.email}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      เริ่มงาน: {formatDate(employee.startDate)}
                    </p>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEdit(employee)}
                    >
                      <Edit2 className="h-4 w-4" />
                      แก้ไข
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(employee.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
