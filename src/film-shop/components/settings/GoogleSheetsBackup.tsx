import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/film-shop/hooks/use-toast';
import { Download, Upload, Sheet, Loader2, FileSpreadsheet, Play, CheckCircle2, Database, ExternalLink, Copy, AlertTriangle, Wifi, WifiOff, Clock, Settings2 } from 'lucide-react';
import { supabase } from '@/film-shop/lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';

interface GoogleSheetsBackupProps {
  onExportData?: () => Promise<any[]>;
}

const SHEETS_INFO = [
  { name: 'Dashboard', description: 'สรุปยอดประจำวัน/เดือน', icon: '📊' },
  { name: 'POS_Sales', description: 'ขายหน้าร้าน', icon: '🛒' },
  { name: 'RubberStamp', description: 'ออเดอร์ตรายาง', icon: '🔖' },
  { name: 'Invoices', description: 'ใบเสร็จ/ใบเสนอราคา', icon: '📄' },
  { name: 'JobTracking', description: 'ติดตามสถานะงาน', icon: '📋' },
  { name: 'Customers', description: 'ข้อมูลลูกค้า', icon: '👥' },
  { name: 'SalesReport', description: 'รายงานการขายรายเดือน', icon: '📈' },
  { name: 'Transactions', description: 'รายรับ/รายจ่าย', icon: '💰' },
];

const GOOGLE_APPS_SCRIPT_CODE = `// === Google Apps Script สำหรับ Film Shop Sync ===
// วาง Code นี้ใน Google Apps Script แล้ว Deploy เป็น Web App

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = data.sheets;
    
    // Process each sheet
    Object.keys(sheets).forEach(function(sheetName) {
      var sheetData = sheets[sheetName].data;
      if (!sheetData || sheetData.length === 0) return;
      
      // Get or create sheet
      var sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        sheet = spreadsheet.insertSheet(sheetName);
      }
      
      // Clear and write data
      sheet.clear();
      
      // Write headers
      var headers = Object.keys(sheetData[0]);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      // Style headers
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      
      // Write data rows
      if (sheetData.length > 0) {
        var rows = sheetData.map(function(row) {
          return headers.map(function(h) {
            var val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return val;
          });
        });
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }
      
      // Auto-resize columns
      for (var i = 1; i <= headers.length; i++) {
        sheet.autoResizeColumn(i);
      }
      
      // Freeze header row
      sheet.setFrozenRows(1);
    });
    
    // Add sync timestamp to Dashboard
    var dashboardSheet = spreadsheet.getSheetByName('Dashboard');
    if (dashboardSheet) {
      var lastRow = dashboardSheet.getLastRow();
      dashboardSheet.getRange(lastRow + 2, 1).setValue('อัปเดตล่าสุด: ' + data.syncDate);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      syncDate: data.syncDate,
      sheetsUpdated: Object.keys(sheets).length
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    Logger.log('Error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันทดสอบ - ใช้สำหรับเช็คว่าใช้งานได้
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ready',
    message: 'Film Shop Google Sheets Sync is ready!',
    sheets: ['Dashboard', 'POS_Sales', 'RubberStamp', 'Invoices', 'JobTracking', 'Customers', 'SalesReport', 'Transactions']
  })).setMimeType(ContentService.MimeType.JSON);
}`;

export function GoogleSheetsBackup({ onExportData }: GoogleSheetsBackupProps) {
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    hint?: string;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    summary?: Record<string, number>;
  } | null>(null);
  const [exportType, setExportType] = useState<'receipts' | 'invoices' | 'customers' | 'transactions' | 'rubber_stamps'>('receipts');

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('shop_settings')
          .select('google_sheets_webhook_url, google_sheets_auto_sync')
          .limit(1)
          .single();
        
        if (data) {
          if (data.google_sheets_webhook_url) {
            setWebhookUrl(data.google_sheets_webhook_url);
          }
          if (data.google_sheets_auto_sync !== null) {
            setAutoSyncEnabled(data.google_sheets_auto_sync);
          }
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleTestUrl = async () => {
    if (!webhookUrl) {
      toast({
        title: 'กรุณาใส่ Webhook URL',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-google-sheets-url', {
        body: { webhookUrl },
      });

      if (error) throw error;

      if (data.success) {
        setTestResult({
          success: true,
          message: data.message || 'เชื่อมต่อสำเร็จ!',
        });
        toast({
          title: '✅ เชื่อมต่อสำเร็จ!',
          description: 'Google Apps Script พร้อมใช้งาน',
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'ไม่สามารถเชื่อมต่อได้',
          hint: data.hint,
        });
        toast({
          title: '❌ เชื่อมต่อไม่สำเร็จ',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Test URL error:', error);
      setTestResult({
        success: false,
        message: error.message || 'เกิดข้อผิดพลาด',
      });
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from('shop_settings')
        .update({
          google_sheets_webhook_url: webhookUrl,
          google_sheets_auto_sync: autoSyncEnabled,
        })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all rows

      if (error) throw error;

      toast({
        title: 'บันทึกการตั้งค่าสำเร็จ',
        description: autoSyncEnabled 
          ? 'ระบบจะซิงค์ข้อมูลอัตโนมัติทุกวันเวลา 23:59 น.'
          : 'ปิดการซิงค์อัตโนมัติแล้ว',
      });
    } catch (error: any) {
      console.error('Save settings error:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSyncAllSheets = async () => {
    if (!webhookUrl) {
      toast({
        title: 'กรุณาใส่ Webhook URL',
        description: 'ใส่ URL ของ Google Apps Script ก่อนทำการซิงค์',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-google-sheets', {
        body: { webhookUrl },
      });

      if (error) throw error;

      setSyncResult({
        success: true,
        summary: data.summary,
      });

      toast({
        title: '✅ ซิงค์ข้อมูลสำเร็จ!',
        description: `ส่งข้อมูลไปยัง 8 ชีทใน Google Sheets แล้ว`,
      });
    } catch (error: any) {
      console.error('Sync error:', error);
      setSyncResult({ success: false });
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: error.message || 'ไม่สามารถซิงค์ข้อมูลได้',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportToSheets = async () => {
    if (!webhookUrl) {
      toast({
        title: 'กรุณาใส่ Webhook URL',
        description: 'ใส่ URL ของ Google Apps Script หรือ Zapier Webhook',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      let data: any[] = [];
      let tableName = '';

      switch (exportType) {
        case 'receipts':
          tableName = 'pos_receipts';
          const { data: receipts, error: receiptError } = await supabase
            .from('pos_receipts')
            .select('*')
            .order('created_at', { ascending: false });
          if (receiptError) throw receiptError;
          data = receipts || [];
          break;
        case 'invoices':
          tableName = 'invoices';
          const { data: invoices, error: invoiceError } = await supabase
            .from('invoices')
            .select('*')
            .order('created_at', { ascending: false });
          if (invoiceError) throw invoiceError;
          data = invoices || [];
          break;
        case 'customers':
          tableName = 'customers';
          const { data: customers, error: customerError } = await supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false });
          if (customerError) throw customerError;
          data = customers || [];
          break;
        case 'transactions':
          tableName = 'transactions';
          const { data: transactions, error: transactionError } = await supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false });
          if (transactionError) throw transactionError;
          data = transactions || [];
          break;
        case 'rubber_stamps':
          data = [];
          break;
      }

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          type: exportType,
          tableName,
          timestamp: new Date().toISOString(),
          data,
          source: 'FilmShopPOS',
        }),
      });

      toast({
        title: 'ส่งข้อมูลสำเร็จ',
        description: `ส่งข้อมูล ${data.length} รายการไปยัง Google Sheets แล้ว`,
      });
    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: error.message || 'ไม่สามารถส่งข้อมูลได้',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadCSV = async () => {
    setIsExporting(true);
    try {
      let data: any[] = [];
      let filename = '';

      switch (exportType) {
        case 'receipts':
          const { data: receipts } = await supabase.from('pos_receipts').select('*').order('created_at', { ascending: false });
          data = receipts || [];
          filename = `pos-receipts-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'invoices':
          const { data: invoices } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
          data = invoices || [];
          filename = `invoices-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'customers':
          const { data: customers } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
          data = customers || [];
          filename = `customers-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'transactions':
          const { data: transactions } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
          data = transactions || [];
          filename = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'rubber_stamps':
          data = [];
          filename = `rubber-stamps-${new Date().toISOString().split('T')[0]}.csv`;
          break;
      }

      if (data.length === 0) {
        toast({ title: 'ไม่มีข้อมูล', variant: 'destructive' });
        return;
      }

      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => 
          headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'ดาวน์โหลดสำเร็จ',
        description: `ดาวน์โหลด ${data.length} รายการเป็นไฟล์ CSV แล้ว`,
      });
    } catch (error: any) {
      console.error('CSV download error:', error);
      toast({
        title: 'เกิดข้อผิดพลาด',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    toast({
      title: 'คัดลอกแล้ว!',
      description: 'Copy Google Apps Script Code เรียบร้อย',
    });
  };

  return (
    <div className="space-y-6">
      {/* Setup Guide Card */}
      <Card className="border-2 border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            📖 คู่มือการตั้งค่า Google Sheets Sync
          </CardTitle>
          <CardDescription>
            ทำตามขั้นตอนด้านล่างเพื่อเชื่อมต่อ Google Sheets กับระบบ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="step1">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-100">1</Badge>
                  <span>📄 สร้าง Google Spreadsheet ใหม่</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pl-8">
                <p className="text-sm text-muted-foreground">
                  เปิดเว็บเบราว์เซอร์ (แนะนำ Chrome) แล้วไปที่ Google Sheets เพื่อสร้าง Spreadsheet ใหม่
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://sheets.new" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    สร้าง Spreadsheet ใหม่
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">
                  💡 ตั้งชื่อไฟล์ เช่น "Film Shop Data Sync"
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step2">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-100">2</Badge>
                  <span>⚙️ เปิด Apps Script</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pl-8">
                <p className="text-sm text-muted-foreground">
                  ใน Spreadsheet ที่สร้างไว้ ให้ไปที่เมนู:
                </p>
                <div className="bg-muted p-3 rounded-lg text-sm font-mono">
                  Extensions → Apps Script
                </div>
                <p className="text-xs text-muted-foreground">
                  หน้าต่าง Apps Script จะเปิดขึ้นมาใหม่
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step3">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-100">3</Badge>
                  <span>📝 วาง Code</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pl-8">
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>ลบ Code เดิมทั้งหมด (function myFunction() ...)</li>
                  <li>คลิกปุ่ม "คัดลอก Code" ด้านล่าง</li>
                  <li>วาง Code ที่คัดลอกมา (Ctrl+V หรือ Cmd+V)</li>
                  <li>กด Ctrl+S หรือ Cmd+S เพื่อบันทึก</li>
                </ol>
                <Button variant="outline" size="sm" onClick={copyScriptToClipboard}>
                  <Copy className="h-4 w-4 mr-2" />
                  คัดลอก Code
                </Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step4">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-100">4</Badge>
                  <span>🚀 Deploy เป็น Web App</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pl-8">
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>คลิกปุ่ม <strong>"Deploy"</strong> (สีน้ำเงิน) มุมขวาบน</li>
                  <li>เลือก <strong>"New deployment"</strong></li>
                  <li>คลิกไอคอนเฟือง ⚙️ ถัดจาก "Select type"</li>
                  <li>เลือก <strong>"Web app"</strong></li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step5">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-orange-100 text-orange-700">5</Badge>
                  <span>⚠️ ตั้งค่าการเข้าถึง (สำคัญมาก!)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pl-8">
                <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertTitle className="text-orange-700">ขั้นตอนนี้สำคัญที่สุด!</AlertTitle>
                  <AlertDescription className="text-orange-600">
                    หากตั้งค่าผิด จะไม่สามารถเชื่อมต่อได้
                  </AlertDescription>
                </Alert>
                <div className="space-y-2 text-sm">
                  <p><strong>Description:</strong> ใส่ชื่อ เช่น "Film Shop Sync v1"</p>
                  <p><strong>Execute as:</strong> เลือก <Badge className="bg-green-500">Me</Badge> (บัญชีของฉัน)</p>
                  <p><strong>Who has access:</strong> เลือก <Badge className="bg-green-500">Anyone</Badge> (ทุกคน)</p>
                  <p className="text-destructive font-medium">
                    ❌ ถ้าเลือก "Only myself" จะใช้งานไม่ได้!
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  จากนั้นคลิก <strong>"Deploy"</strong>
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step6">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-100">6</Badge>
                  <span>📋 คัดลอก URL</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pl-8">
                <p className="text-sm text-muted-foreground">
                  หลังจาก Deploy สำเร็จ จะมี URL แสดงขึ้นมา
                </p>
                <div className="bg-muted p-3 rounded-lg text-sm font-mono break-all">
                  https://script.google.com/macros/s/xxxxx.../exec
                </div>
                <p className="text-sm text-muted-foreground">
                  คลิก <strong>"Copy"</strong> เพื่อคัดลอก URL
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step7">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-100 text-green-700">7</Badge>
                  <span>✅ ใส่ URL และทดสอบ</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pl-8">
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>วาง URL ที่คัดลอกมาในช่องด้านล่าง</li>
                  <li>คลิก <strong>"ทดสอบการเชื่อมต่อ"</strong> เพื่อตรวจสอบ</li>
                  <li>ถ้าสำเร็จ ให้คลิก <strong>"ซิงค์ข้อมูลทั้งหมด"</strong></li>
                  <li>กลับไปดู Spreadsheet - จะมี 8 ชีทปรากฏขึ้น! 🎉</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Main Sync Card - 8 Sheets */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            ซิงค์ข้อมูลทั้งหมด (8 ชีท)
            <Badge className="bg-primary">แนะนำ</Badge>
          </CardTitle>
          <CardDescription>
            ส่งข้อมูลทั้งหมดไปยัง Google Sheets พร้อมกัน 8 ชีท
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sheet List */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SHEETS_INFO.map((sheet) => (
              <div 
                key={sheet.name}
                className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm"
              >
                <span>{sheet.icon}</span>
                <div>
                  <p className="font-medium">{sheet.name}</p>
                  <p className="text-xs text-muted-foreground">{sheet.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Webhook URL Input with Test Button */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Google Apps Script Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-url"
                placeholder="https://script.google.com/macros/s/..."
                value={webhookUrl}
                onChange={(e) => {
                  setWebhookUrl(e.target.value);
                  setTestResult(null);
                }}
                className="flex-1"
              />
              <Button 
                variant="outline" 
                onClick={handleTestUrl}
                disabled={isTesting || !webhookUrl}
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                <span className="hidden sm:inline ml-2">ทดสอบ</span>
              </Button>
            </div>
          </div>

          {/* Test Result */}
          {testResult && (
            <Alert className={testResult.success ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-destructive bg-red-50 dark:bg-red-950/20'}>
              {testResult.success ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-destructive" />
              )}
              <AlertTitle className={testResult.success ? 'text-green-700' : 'text-destructive'}>
                {testResult.success ? '✅ เชื่อมต่อสำเร็จ!' : '❌ เชื่อมต่อไม่สำเร็จ'}
              </AlertTitle>
              <AlertDescription className={testResult.success ? 'text-green-600' : 'text-red-600'}>
                {testResult.message}
                {testResult.hint && (
                  <p className="mt-1 text-sm opacity-80">💡 {testResult.hint}</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Auto Sync Settings */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">ซิงค์อัตโนมัติทุกวัน</p>
                <p className="text-xs text-muted-foreground">
                  ซิงค์ข้อมูลอัตโนมัติเวลา 23:59 น. ทุกวัน
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={autoSyncEnabled}
                onCheckedChange={setAutoSyncEnabled}
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
              >
                {isSavingSettings ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Settings2 className="h-4 w-4" />
                )}
                <span className="ml-1">บันทึก</span>
              </Button>
            </div>
          </div>

          {/* Sync Result */}
          {syncResult && (
            <Alert className={syncResult.success ? 'border-green-500' : 'border-destructive'}>
              <CheckCircle2 className={`h-4 w-4 ${syncResult.success ? 'text-green-500' : 'text-destructive'}`} />
              <AlertTitle>{syncResult.success ? 'ซิงค์สำเร็จ!' : 'เกิดข้อผิดพลาด'}</AlertTitle>
              {syncResult.summary && (
                <AlertDescription className="mt-2">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <span>📊 POS: {syncResult.summary.totalPOSReceipts} รายการ</span>
                    <span>🔖 ตรายาง: {syncResult.summary.totalRubberStampOrders} รายการ</span>
                    <span>📄 ใบเสร็จ: {syncResult.summary.totalInvoices} รายการ</span>
                    <span>👥 ลูกค้า: {syncResult.summary.totalCustomers} รายการ</span>
                    <span>💰 รายรับ-จ่าย: {syncResult.summary.totalTransactions} รายการ</span>
                    <span>📋 ติดตามงาน: {syncResult.summary.totalJobsTracking} รายการ</span>
                  </div>
                </AlertDescription>
              )}
            </Alert>
          )}

          {/* Sync Button */}
          <Button 
            onClick={handleSyncAllSheets} 
            disabled={isSyncing || !webhookUrl} 
            className="w-full"
            size="lg"
          >
            {isSyncing ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Play className="h-5 w-5 mr-2" />
            )}
            ซิงค์ข้อมูลทั้งหมดไปยัง 8 ชีท
          </Button>

          {/* Google Apps Script Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Google Apps Script Code</Label>
              <Button variant="outline" size="sm" onClick={copyScriptToClipboard}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                คัดลอก Code
              </Button>
            </div>
            <ScrollArea className="h-64 rounded-md border bg-muted/30">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
                {GOOGLE_APPS_SCRIPT_CODE}
              </pre>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Manual Export Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sheet className="h-5 w-5" />
            ส่งออกข้อมูลแบบเลือกประเภท
          </CardTitle>
          <CardDescription>
            เลือกประเภทข้อมูลที่ต้องการส่งออกไปยัง Google Sheets หรือดาวน์โหลดเป็นไฟล์ CSV
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>เลือกประเภทข้อมูล</Label>
            <Tabs value={exportType} onValueChange={(v) => setExportType(v as any)}>
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="receipts">POS</TabsTrigger>
                <TabsTrigger value="invoices">ใบแจ้งหนี้</TabsTrigger>
                <TabsTrigger value="rubber_stamps">ตรายาง</TabsTrigger>
                <TabsTrigger value="customers">ลูกค้า</TabsTrigger>
                <TabsTrigger value="transactions">รายรับ-จ่าย</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExportToSheets} disabled={isExporting || !webhookUrl}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              ส่งไป Google Sheets
            </Button>
            <Button variant="outline" onClick={handleDownloadCSV} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              ดาวน์โหลด CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
