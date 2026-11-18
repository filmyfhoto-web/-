import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addThaiFont } from './thaiFontPDF';

interface ProductSalesData {
  name: string;
  count: number;
  sqm: number;
  total: number;
  percentage: string;
}

interface ReportData {
  title: string;
  period: string;
  shopName: string;
  products: ProductSalesData[];
  totalSales: number;
  totalCount: number;
  totalSqm: number;
  generatedAt: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
  }).format(amount);
};

export const exportSalesReportToPDF = async (data: ReportData) => {
  const doc = new jsPDF();

  // Load Thai font (Sarabun) for correct Thai character rendering
  await addThaiFont(doc);

  // Header
  doc.setFontSize(18);
  doc.text(data.title, 105, 20, { align: 'center' });

  doc.setFontSize(12);
  doc.text(data.shopName, 105, 30, { align: 'center' });

  doc.setFontSize(10);
  doc.text(`ช่วงเวลา: ${data.period}`, 105, 38, { align: 'center' });
  doc.text(`สร้างเมื่อ: ${data.generatedAt}`, 105, 44, { align: 'center' });

  // Summary box
  doc.setDrawColor(200);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(14, 52, 182, 25, 3, 3, 'FD');

  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text('ยอดขายรวม', 35, 62, { align: 'center' });
  doc.text('จำนวนรวม', 85, 62, { align: 'center' });
  doc.text('พื้นที่รวม (ตร.ม.)', 145, 62, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(formatCurrency(data.totalSales), 35, 72, { align: 'center' });
  doc.text(data.totalCount.toString(), 85, 72, { align: 'center' });
  doc.text(data.totalSqm.toFixed(2), 145, 72, { align: 'center' });

  // Product table
  const tableData = data.products.map(product => [
    product.name,
    product.count.toString(),
    product.sqm > 0 ? product.sqm.toFixed(2) : '-',
    formatCurrency(product.total),
    product.percentage + '%',
  ]);

  // Add total row
  tableData.push([
    'รวมทั้งหมด',
    data.totalCount.toString(),
    data.totalSqm.toFixed(2),
    formatCurrency(data.totalSales),
    '100%',
  ]);

  autoTable(doc, {
    startY: 85,
    head: [['ประเภทสินค้า', 'จำนวน', 'พื้นที่ (ตร.ม.)', 'ยอดขาย', 'สัดส่วน']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: 255,
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [229, 231, 235],
      textColor: 0,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 45, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
    didParseCell: (data) => {
      // Style the last row as footer
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fillColor = [229, 231, 235];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY || 150;
  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text('รายงานนี้สร้างอัตโนมัติจากระบบจัดการร้านค้า', 105, finalY + 15, { align: 'center' });

  // Save the PDF
  const fileName = `รายงานยอดขาย-${data.period.replace(/\s/g, '-')}.pdf`;
  doc.save(fileName);

  return fileName;
};
