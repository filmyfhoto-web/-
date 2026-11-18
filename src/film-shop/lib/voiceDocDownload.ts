/**
 * ดาวน์โหลดเอกสารที่ออกจากหน้า “ออกเอกสารด้วยเสียง”
 * รองรับ 3 รูปแบบ: PDF (A4), ไฟล์เอกสาร (.html เปิด/แก้ใน Word ได้) และรูปภาพ (.png)
 */
const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '-');

async function snapshot(el: HTMLElement) {
  const html2canvas = (await import('html2canvas')).default;
  return html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadDocImage(el: HTMLElement, docNo: string) {
  const canvas = await snapshot(el);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('สร้างรูปภาพไม่สำเร็จ');
  saveBlob(blob, `${safe(docNo)}.png`);
}

export async function downloadDocPdf(el: HTMLElement, docNo: string) {
  const [{ default: jsPDF }, canvas] = await Promise.all([import('jspdf'), snapshot(el)]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height / canvas.width) * imgW;
  const img = canvas.toDataURL('image/png');
  if (imgH <= pageH - margin * 2) {
    pdf.addImage(img, 'PNG', margin, margin, imgW, imgH);
  } else {
    // เอกสารยาวกว่า 1 หน้า -> ตัดเป็นหลายหน้าโดยคงสเกลเดิม
    let offset = 0;
    while (offset < imgH) {
      pdf.addImage(img, 'PNG', margin, margin - offset, imgW, imgH);
      offset += pageH - margin * 2;
      if (offset < imgH) pdf.addPage();
    }
  }
  pdf.save(`${safe(docNo)}.pdf`);
}

export function downloadDocFile(el: HTMLElement, docNo: string) {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${docNo}</title>
<style>body{font-family:'Sarabun','TH Sarabun New',sans-serif;padding:24px;color:#111}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:4px;text-align:left}
td:not(:first-child),th:not(:first-child){text-align:right}</style></head>
<body>${el.innerHTML}</body></html>`;
  saveBlob(new Blob([html], { type: 'application/msword;charset=utf-8' }), `${safe(docNo)}.doc`);
}
