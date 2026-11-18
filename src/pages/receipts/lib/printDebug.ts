/**
 * Print debug-mode flag. When enabled, openPrintWindow injects a yellow
 * diagnostic banner into the popup and stores the latest diagnostics on
 * `window.__lovablePrintDiagnostics`.
 *
 * Toggle via:
 *   - URL: ?printDebug=1
 *   - localStorage: localStorage.setItem("lovable_print_debug", "1")
 */

const LS_KEY = "lovable_print_debug";

export function isPrintDebugEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    if (url.searchParams.get("printDebug") === "1") return true;
    return window.localStorage?.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPrintDebug(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(LS_KEY, "1");
    else window.localStorage.removeItem(LS_KEY);
  } catch { /* noop */ }
}

export type PrintDiagnostics = {
  startedAt: number;
  paperSize: string;
  orient: string;
  sourceElProvided: boolean;
  bodyHtmlBytes: number;
  copiedLinkCount: number;
  copiedStyleCount: number;
  stylesheetsReady: boolean;
  stylesheetsLoaded: number;
  stylesheetsTotal: number;
  stylesheetWaitMs: number;
  timedOut: boolean;
  fallbackReason:
    | "none"
    | "stylesheets_timeout"
    | "no_source_el"
    | "sheet_access_error"
    | "empty_body";
  errors: string[];
};

declare global {
  interface Window {
    __lovablePrintDiagnostics?: PrintDiagnostics;
    __rdsPrintTrace?: Array<{ stage: string; at: number; payload?: unknown }>;
  }
}

export function recordPrintDiagnostics(diag: PrintDiagnostics): void {
  try {
    window.__lovablePrintDiagnostics = diag;
    // Always log for postmortem in DevTools; cheap and useful.
    // eslint-disable-next-line no-console
    console.info("[print] diagnostics", diag);
  } catch { /* noop */ }
}

/**
 * Append a trace entry to a 50-slot ring buffer on `window.__rdsPrintTrace`.
 * Cheap no-op in production unless debug is on. E2E reads this buffer to
 * verify cfg + companionDocNo reach the print pipeline before snapshot.
 */
const TRACE_LIMIT = 50;
export function logPrintStage(stage: string, payload?: unknown): void {
  try {
    if (typeof window === "undefined") return;
    const buf = (window.__rdsPrintTrace ??= []);
    buf.push({ stage, at: Date.now(), payload });
    if (buf.length > TRACE_LIMIT) buf.splice(0, buf.length - TRACE_LIMIT);
    if (isPrintDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.debug("[print:trace]", stage, payload ?? "");
    }
  } catch { /* noop */ }
}

export function readPrintTrace(): Array<{ stage: string; at: number; payload?: unknown }> {
  try { return (window.__rdsPrintTrace ?? []).slice(); } catch { return []; }
}

export function clearPrintTrace(): void {
  try { window.__rdsPrintTrace = []; } catch { /* noop */ }
}