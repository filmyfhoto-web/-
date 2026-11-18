import { useState, useEffect } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/film-shop/hooks/use-toast';
import { Users, Shield, FileText, Receipt, ShoppingCart, Loader2, UserPlus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'staff';
  created_at: string;
  email?: string;
}

interface SystemStats {
  totalInvoices: number;
  totalReceipts: number;
  totalOrders: number;
  totalCustomers: number;
  totalUsers: number;
}

export const AdminDashboard = () => {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    totalInvoices: 0,
    totalReceipts: 0,
    totalOrders: 0,
    totalCustomers: 0,
    totalUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'staff'>('staff');
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (rolesError) throw rolesError;
      setUserRoles(rolesData || []);

      // Fetch stats
      const [invoicesRes, receiptsRes, customersRes] = await Promise.all([
        supabase.from('invoices').select('id', { count: 'exact', head: true }),
        supabase.from('pos_receipts').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalInvoices: invoicesRes.count || 0,
        totalReceipts: receiptsRes.count || 0,
        totalOrders: 0,
        totalCustomers: customersRes.count || 0,
        totalUsers: rolesData?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถโหลดข้อมูลได้',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'staff') => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      setUserRoles(prev =>
        prev.map(ur => (ur.user_id === userId ? { ...ur, role: newRole } : ur))
      );

      toast({
        title: 'สำเร็จ',
        description: 'อัปเดตสิทธิ์ผู้ใช้เรียบร้อยแล้ว',
      });
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถอัปเดตสิทธิ์ได้',
        variant: 'destructive',
      });
    }
  };

  const handleAddUser = async () => {
    if (!newUserId.trim()) {
      toast({
        title: 'กรุณากรอก User ID',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: newUserId.trim(), role: newUserRole });

      if (error) throw error;

      toast({
        title: 'สำเร็จ',
        description: 'เพิ่มผู้ใช้เรียบร้อยแล้ว',
      });
      setAddDialogOpen(false);
      setNewUserId('');
      setNewUserRole('staff');
      fetchData();
    } catch (error: any) {
      console.error('Error adding user:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: error.message || 'ไม่สามารถเพิ่มผู้ใช้ได้',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('ต้องการลบผู้ใช้นี้ออกจากระบบ?')) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      setUserRoles(prev => prev.filter(ur => ur.user_id !== userId));

      toast({
        title: 'สำเร็จ',
        description: 'ลบผู้ใช้เรียบร้อยแล้ว',
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถลบผู้ใช้ได้',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ผู้ใช้ทั้งหมด</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ใบเสร็จ</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInvoices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">POS</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalReceipts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ตรายาง</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ลูกค้า</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
          </CardContent>
        </Card>
      </div>

      {/* User Roles Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                จัดการสิทธิ์ผู้ใช้
              </CardTitle>
              <CardDescription>
                กำหนดสิทธิ์การเข้าถึงระบบสำหรับผู้ใช้แต่ละคน
              </CardDescription>
            </div>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  เพิ่มผู้ใช้
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>เพิ่มผู้ใช้ใหม่</DialogTitle>
                  <DialogDescription>
                    กรอก User ID ของผู้ใช้ที่ต้องการเพิ่มเข้าระบบ
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="userId">User ID</Label>
                    <Input
                      id="userId"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">สิทธิ์</Label>
                    <Select value={newUserRole} onValueChange={(v: 'admin' | 'staff') => setNewUserRole(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    ยกเลิก
                  </Button>
                  <Button onClick={handleAddUser}>เพิ่มผู้ใช้</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>สิทธิ์ปัจจุบัน</TableHead>
                <TableHead>วันที่เพิ่ม</TableHead>
                <TableHead>เปลี่ยนสิทธิ์</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userRoles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    ไม่มีผู้ใช้ในระบบ
                  </TableCell>
                </TableRow>
              ) : (
                userRoles.map((ur) => (
                  <TableRow key={ur.id}>
                    <TableCell className="font-mono text-xs">
                      {ur.user_id.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant={ur.role === 'admin' ? 'default' : 'secondary'}>
                        {ur.role === 'admin' ? 'Admin' : 'Staff'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(ur.created_at).toLocaleDateString('th-TH')}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={ur.role}
                        onValueChange={(value: 'admin' | 'staff') => handleRoleChange(ur.user_id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUser(ur.user_id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle>คำอธิบายสิทธิ์การเข้าถึง</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Badge>Admin</Badge>
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>เข้าถึงได้ทุกเมนู</li>
                <li>จัดการตั้งค่าระบบ</li>
                <li>จัดการพนักงาน</li>
                <li>ดูรายรับ/รายจ่ายทั้งหมด</li>
                <li>ดูใบเสร็จ/ออเดอร์ของทุกคน</li>
                <li>จัดการสิทธิ์ผู้ใช้</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Badge variant="secondary">Staff</Badge>
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>หน้าหลัก (Dashboard)</li>
                <li>ขายหน้าร้าน (POS)</li>
                <li>คำนวณราคาไวนิล</li>
                <li>ทำตรายาง</li>
                <li>ใบเสร็จ/ใบเสนอราคา (เฉพาะของตัวเอง)</li>
                <li>ติดตามสถานะงาน</li>
                <li>ข้อมูลลูกค้า</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
