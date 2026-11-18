import { useState, useCallback } from 'react';
import { openPrintWindowOrSurface } from "@/lib/printSurface";

export type PrinterType = 'airprint' | 'network' | 'usb';

export interface NetworkPrinterConfig {
  type: PrinterType;
  ipAddress: string;
  port: string;
}

const STORAGE_KEY = 'pos_network_printer_config';

const defaultConfig: NetworkPrinterConfig = {
  type: 'airprint',
  ipAddress: '192.168.1.100',
  port: '9100',
};

export function useNetworkPrinter() {
  const [config, setConfig] = useState<NetworkPrinterConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...defaultConfig, ...JSON.parse(stored) } : defaultConfig;
    } catch {
      return defaultConfig;
    }
  });

  const saveConfig = useCallback((newConfig: NetworkPrinterConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  }, []);

  /** Open system print dialog — works for AirPrint on iPad */
  const printViaDialog = useCallback((element: HTMLElement, opts?: { fontSize: number; lineSpacing: number }) => {
    const fs = opts?.fontSize ?? 100;
    const ls = opts?.lineSpacing ?? 100;

    const printWindow = openPrintWindowOrSurface();
    if (!printWindow) return;

    const styles = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700&display=swap');
        @page {
          size: 80mm auto;
          margin: 0;
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 80mm;
          font-family: 'Sarabun', sans-serif;
          font-size: ${fs}%;
          line-height: ${ls / 100 * 1.4};
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        * { box-sizing: border-box; }
      </style>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ใบเสร็จ 80mm</title>
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; img-src 'self' data:;">
          ${styles}
        </head>
        <body>${element.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();

    // Wait for fonts then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 600);
  }, []);

  return { config, saveConfig, printViaDialog };
}
