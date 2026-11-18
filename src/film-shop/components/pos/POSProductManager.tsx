import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit, Trash2, Package } from 'lucide-react';
import { usePOSProducts, POSProductDB } from '@/film-shop/hooks/usePOSProducts';

const CATEGORIES = [
  { id: 'photocopy', name: 'ถ่ายเอกสาร', color: '#3b82f6', icon: '📄' },
  { id: 'print', name: 'พิมพ์เอกสาร', color: '#22c55e', icon: '🖨️' },
  { id: 'photo', name: 'ถ่ายรูป/อัดรูป', color: '#a855f7', icon: '📷' },
  { id: 'card', name: 'ทำบัตร', color: '#f97316', icon: '💳' },
  { id: 'binding', name: 'เข้าเล่ม', color: '#ec4899', icon: '📚' },
  { id: 'special', name: 'บริการพิเศษ', color: '#14b8a6', icon: '✨' },
];

const COLOR_OPTIONS = [
  '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6',
  '#ef4444', '#eab308', '#6366f1', '#84cc16', '#f43f5e', '#06b6d4',
];

const ICON_OPTIONS = [
  '📄', '🖨️', '📷', '💳', '📚', '✨', '📦', '🏷️', '🎨', '📋', 
  '🖼️', '📝', '🎁', '💼', '📁', '🗂️', '📎', '✂️', '📏', '🔖',
];

interface ProductFormData {
  name: string;
  price: string;
  unit: string;
  category: string;
  color: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

const defaultFormData: ProductFormData = {
  name: '',
  price: '',
  unit: 'หน้า',
  category: 'photocopy',
  color: '#3b82f6',
  icon: '📦',
  is_active: true,
  sort_order: 0,
};

export function POSProductManager() {
  const { products, fetchAllProducts, addProduct, updateProduct, deleteProduct } = usePOSProducts();
  const [allProducts, setAllProducts] = useState<POSProductDB[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<POSProductDB | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(defaultFormData);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    loadAllProducts();
  }, []);

  const loadAllProducts = async () => {
    const data = await fetchAllProducts();
    setAllProducts(data);
  };

  const filteredProducts = filterCategory === 'all' 
    ? allProducts 
    : allProducts.filter(p => p.category === filterCategory);

  const handleOpenDialog = (product?: POSProductDB) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        price: product.price.toString(),
        unit: product.unit,
        category: product.category,
        color: product.color,
        icon: product.icon || '📦',
        is_active: product.is_active,
        sort_order: product.sort_order,
      });
    } else {
      setEditingProduct(null);
      const cat = CATEGORIES.find(c => c.id === 'photocopy');
      setFormData({
        ...defaultFormData,
        icon: cat?.icon || '📦',
        sort_order: allProducts.length + 1,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) return;

    const productData = {
      name: formData.name.trim(),
      price: parseFloat(formData.price),
      unit: formData.unit,
      category: formData.category,
      color: formData.color,
      icon: formData.icon,
      is_active: formData.is_active,
      sort_order: formData.sort_order,
    };

    if (editingProduct) {
      await updateProduct(editingProduct.id, productData);
    } else {
      await addProduct(productData);
    }

    setIsDialogOpen(false);
    loadAllProducts();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('ต้องการลบสินค้านี้ใช่หรือไม่?')) {
      await deleteProduct(id);
      loadAllProducts();
    }
  };

  const getCategoryName = (categoryId: string) => {
    return CATEGORIES.find(c => c.id === categoryId)?.name || categoryId;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          จัดการสินค้า/บริการ POS
        </CardTitle>
        <CardDescription>
          เพิ่ม แก้ไข ลบ หรือเปลี่ยนราคาสินค้าและบริการ
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter and Add Button */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="ทุกหมวดหมู่" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกหมวดหมู่</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                เพิ่มสินค้า
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>ชื่อสินค้า/บริการ</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="เช่น ถ่ายเอกสาร A4"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>ราคา (บาท)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>หน่วย</Label>
                    <Input
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="หน้า, ชิ้น, เล่ม"
                    />
                  </div>
                </div>
                <div>
                  <Label>หมวดหมู่</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(v) => {
                      const cat = CATEGORIES.find(c => c.id === v);
                      setFormData({ 
                        ...formData, 
                        category: v,
                        color: cat?.color || formData.color,
                        icon: cat?.icon || formData.icon,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ไอคอน</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ICON_OPTIONS.map(icon => (
                      <button
                        key={icon}
                        type="button"
                        className={`w-10 h-10 rounded-lg border-2 text-xl flex items-center justify-center transition-all ${
                          formData.icon === icon ? 'border-primary bg-primary/10 scale-110' : 'border-muted hover:border-primary/50'
                        }`}
                        onClick={() => setFormData({ ...formData, icon })}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>สี</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {COLOR_OPTIONS.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${
                          formData.color === color ? 'border-gray-900 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label>เปิดใช้งาน</Label>
                </div>
                <Button onClick={handleSave} className="w-full">
                  {editingProduct ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Products Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">สี</TableHead>
                <TableHead>ชื่อสินค้า</TableHead>
                <TableHead>หมวดหมู่</TableHead>
                <TableHead className="text-right">ราคา</TableHead>
                <TableHead>หน่วย</TableHead>
                <TableHead className="text-center">สถานะ</TableHead>
                <TableHead className="text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div 
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: product.color }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{getCategoryName(product.category)}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    ฿{product.price.toFixed(2)}
                  </TableCell>
                  <TableCell>{product.unit}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={product.is_active ? 'default' : 'outline'}>
                      {product.is_active ? 'เปิด' : 'ปิด'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleOpenDialog(product)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    ไม่พบสินค้า
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
