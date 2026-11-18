/**
 * WebUSB Thermal Printer Utility for Aimo QF300 (80mm)
 * Uses ESC/POS raster image mode to support Thai text
 */

import html2canvas from 'html2canvas';

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

interface PrinterDevice {
  device: any;
  interfaceNumber: number;
  endpointNumber: number;
}

let connectedPrinter: PrinterDevice | null = null;

/**
 * Check if WebUSB is supported in the browser
 */
export function isWebUSBSupported(): boolean {
  return 'usb' in navigator;
}

/**
 * Connect to USB thermal printer
 */
export async function connectPrinter(): Promise<boolean> {
  if (!isWebUSBSupported()) {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับ WebUSB กรุณาใช้ Chrome หรือ Edge');
  }

  try {
    const usb = (navigator as any).usb;
    const device = await usb.requestDevice({
      filters: [
        // Common thermal printer USB vendor IDs
        { vendorId: 0x0483 }, // STMicroelectronics (Aimo/generic)
        { vendorId: 0x0416 }, // Winbond
        { vendorId: 0x04B8 }, // Epson
        { vendorId: 0x0519 }, // Star Micronics
        { vendorId: 0x0DD4 }, // Custom
        { vendorId: 0x154F }, // SNBC
        { vendorId: 0x0FE6 }, // ICS Electronics (CH340)
        { vendorId: 0x1A86 }, // QinHeng Electronics (CH340)
        { vendorId: 0x0B00 }, // RONGTA
        { vendorId: 0x0525 }, // Netchip
        { vendorId: 0x28E9 }, // GD32 (some Aimo)
      ],
    });

    await device.open();

    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    // Find the right interface and endpoint
    let interfaceNumber = 0;
    let endpointNumber = 1;

    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.direction === 'out' && ep.type === 'bulk') {
            interfaceNumber = iface.interfaceNumber;
            endpointNumber = ep.endpointNumber;
            break;
          }
        }
      }
    }

    await device.claimInterface(interfaceNumber);

    connectedPrinter = { device, interfaceNumber, endpointNumber };
    return true;
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      throw new Error('ไม่พบเครื่องพิมพ์ กรุณาเชื่อมต่อ USB แล้วลองใหม่');
    }
    throw new Error(`เชื่อมต่อเครื่องพิมพ์ไม่สำเร็จ: ${error.message}`);
  }
}

/**
 * Disconnect from printer
 */
export async function disconnectPrinter(): Promise<void> {
  if (connectedPrinter) {
    try {
      await connectedPrinter.device.releaseInterface(connectedPrinter.interfaceNumber);
      await connectedPrinter.device.close();
    } catch (e) {
      // Ignore errors on disconnect
    }
    connectedPrinter = null;
  }
}

/**
 * Check if printer is connected
 */
export function isPrinterConnected(): boolean {
  return connectedPrinter !== null && connectedPrinter.device.opened;
}

/**
 * Get connected printer name
 */
export function getPrinterName(): string | null {
  if (!connectedPrinter) return null;
  return connectedPrinter.device.productName || 'USB Printer';
}

/**
 * Send raw bytes to printer
 */
async function sendData(data: Uint8Array): Promise<void> {
  if (!connectedPrinter) {
    throw new Error('ไม่ได้เชื่อมต่อเครื่องพิมพ์');
  }

  const CHUNK_SIZE = 4096;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await connectedPrinter.device.transferOut(connectedPrinter.endpointNumber, chunk);
  }
}

/**
 * Initialize printer
 */
function getInitCommand(): Uint8Array {
  return new Uint8Array([ESC, 0x40]); // ESC @ - Initialize
}

/**
 * Feed and cut paper
 */
function getCutCommand(): Uint8Array {
  return new Uint8Array([
    LF, LF, LF, LF,
    GS, 0x56, 0x00,  // GS V 0 - Full cut
  ]);
}

/**
 * Convert canvas to ESC/POS raster bitmap data
 * 80mm printer = ~384 dots at 203 DPI
 */
function canvasToEscPosRaster(canvas: HTMLCanvasElement, printerWidth: number = 384): Uint8Array {
  const ctx = canvas.getContext('2d')!;
  
  const scale = printerWidth / canvas.width;
  const scaledHeight = Math.ceil(canvas.height * scale);
  
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = printerWidth;
  scaledCanvas.height = scaledHeight;
  const scaledCtx = scaledCanvas.getContext('2d')!;
  scaledCtx.fillStyle = '#ffffff';
  scaledCtx.fillRect(0, 0, printerWidth, scaledHeight);
  scaledCtx.drawImage(canvas, 0, 0, printerWidth, scaledHeight);
  
  const imageData = scaledCtx.getImageData(0, 0, printerWidth, scaledHeight);
  const pixels = imageData.data;
  
  const bytesPerLine = Math.ceil(printerWidth / 8);
  const commands: number[] = [];
  
  // GS v 0 - Print raster bit image
  const xL = bytesPerLine & 0xFF;
  const xH = (bytesPerLine >> 8) & 0xFF;
  const yL = scaledHeight & 0xFF;
  const yH = (scaledHeight >> 8) & 0xFF;
  
  commands.push(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH);
  
  for (let y = 0; y < scaledHeight; y++) {
    for (let byteIndex = 0; byteIndex < bytesPerLine; byteIndex++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteIndex * 8 + bit;
        if (x < printerWidth) {
          const pixelIndex = (y * printerWidth + x) * 4;
          const r = pixels[pixelIndex];
          const g = pixels[pixelIndex + 1];
          const b = pixels[pixelIndex + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          if (gray < 128) {
            byte |= (0x80 >> bit);
          }
        }
      }
      commands.push(byte);
    }
  }
  
  return new Uint8Array(commands);
}

/**
 * Print an HTML element as image via WebUSB
 */
export async function printElementViaUSB(
  element: HTMLElement,
  options: { copies?: number; cut?: boolean } = {}
): Promise<void> {
  const { copies = 1, cut = true } = options;

  if (!connectedPrinter) {
    // Try to reconnect to previously paired device
    const usb = (navigator as any).usb;
    if (!usb) throw new Error('WebUSB ไม่รองรับ');
    
    const devices = await usb.getDevices();
    if (devices.length > 0) {
      const device = devices[0];
      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      
      let interfaceNumber = 0;
      let endpointNumber = 1;
      for (const iface of device.configuration.interfaces) {
        for (const alt of iface.alternates) {
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out' && ep.type === 'bulk') {
              interfaceNumber = iface.interfaceNumber;
              endpointNumber = ep.endpointNumber;
              break;
            }
          }
        }
      }
      await device.claimInterface(interfaceNumber);
      connectedPrinter = { device, interfaceNumber, endpointNumber };
    } else {
      throw new Error('ไม่ได้เชื่อมต่อเครื่องพิมพ์ กรุณากดปุ่ม "เชื่อมต่อเครื่องพิมพ์" ก่อน');
    }
  }

  // Capture element as canvas
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: element.scrollWidth,
    height: element.scrollHeight,
  });

  for (let i = 0; i < copies; i++) {
    await sendData(getInitCommand());
    const rasterData = canvasToEscPosRaster(canvas, 384);
    await sendData(rasterData);
    if (cut) {
      await sendData(getCutCommand());
    }
    if (i < copies - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
