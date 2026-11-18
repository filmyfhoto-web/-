import jsPDF from 'jspdf';

// Thai-compatible font configuration for jsPDF
// Using Sarabun font embedded via Google Fonts CDN approach

export const addThaiFont = async (doc: jsPDF): Promise<void> => {
  try {
    // Load Sarabun font from Google Fonts
    const fontResponse = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf');
    
    if (!fontResponse.ok) {
      console.warn('Could not load Thai font, falling back to default');
      return;
    }
    
    const fontBuffer = await fontResponse.arrayBuffer();
    const fontBase64 = arrayBufferToBase64(fontBuffer);
    
    // Add font to jsPDF
    doc.addFileToVFS('Sarabun-Regular.ttf', fontBase64);
    doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
    doc.setFont('Sarabun');
  } catch (error) {
    console.warn('Failed to load Thai font:', error);
    // Continue with default font
  }
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Format Thai Baht currency
export const formatThaiCurrency = (amount: number): string => {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(amount);
};

// Format date in Thai
export const formatThaiDate = (date: Date): string => {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Thai month names
export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
