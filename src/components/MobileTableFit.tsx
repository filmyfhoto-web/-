import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Makes every data table usable on phones and tablets.
 *
 * Components built on `<Table>` already render inside a scroll container.
 * A lot of screens use raw `<table>` markup, though, which pushes the whole
 * page sideways on a 390px screen. This wraps those tables in the same
 * `[data-table-scroll]` container at runtime (see index.css for the styling)
 * and skips anything inside a print / paper preview.
 */
const PRINT_SELECTOR =
  ".doc-page, .print-container, .print-page, .doc-print-document, [data-print-root], [data-no-table-fit]";

/** Tables with at least this many body rows get a pinned header + first column. */
const STICKY_MIN_ROWS = 8;

/** Tables with at least this many columns collapse into cards on phones. */
const CARD_MIN_COLS = 3;

/** Wide tables stay in card mode up to tablet width too. */
const CARD_WIDE_COLS = 6;

/** Phone breakpoint (sm) and tablet breakpoint (lg) used to pick card mode. */
const PHONE_MAX = 639;
const TABLET_MAX = 1023;

/** How many fields stay visible on a collapsed card before “ดูเพิ่มเติม”. */
const CARD_PRIMARY_CELLS = 3;

const viewportWidth = () =>
  typeof window === "undefined" ? 1280 : window.innerWidth || document.documentElement.clientWidth;

/** Card mode is decided in JS so phones and tablets can use different column limits. */
function cardModeFor(columns: number): "" | "wide" | null {
  const w = viewportWidth();
  if (columns >= CARD_WIDE_COLS && w <= TABLET_MAX) return w <= PHONE_MAX ? "" : "wide";
  if (columns >= CARD_MIN_COLS && w <= PHONE_MAX) return "";
  return null;
}


const KEEP_SELECTOR =
  '[data-row-actions], button, a[role="button"], [role="checkbox"], input[type="checkbox"], select, [role="switch"]';

/**
 * Adds a “ดูเพิ่มเติม / ย่อ” toggle to a card so secondary fields stay hidden
 * until the user asks for them (expandable rows on phones and tablets).
 */
function ensureToggle(row: HTMLTableRowElement, firstCell: HTMLTableCellElement) {
  if (firstCell.querySelector("[data-card-toggle]")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("data-card-toggle", "");
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "ดูเพิ่มเติม";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = row.hasAttribute("data-card-open");
    if (open) row.removeAttribute("data-card-open");
    else row.setAttribute("data-card-open", "");
    btn.setAttribute("aria-expanded", String(!open));
    btn.textContent = open ? "ดูเพิ่มเติม" : "ย่อ";
  });
  firstCell.appendChild(btn);
}

const headerText = (cell: HTMLTableCellElement) =>
  (cell.getAttribute("data-label") ?? cell.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * Copies each column header onto its body cells as `data-label` and flags the
 * wrapper for card mode, so `index.css` can turn rows into readable cards on
 * phones instead of forcing a sideways scroll.
 */
function applyCards(table: HTMLTableElement, wrapper: HTMLElement) {
  if (table.hasAttribute("data-no-cards") || wrapper.hasAttribute("data-no-cards")) {
    wrapper.removeAttribute("data-mobile-cards");
    return;
  }
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  const mode = headRow ? cardModeFor(headRow.cells.length) : null;
  if (!headRow || mode === null) {
    wrapper.removeAttribute("data-mobile-cards");
    return;
  }
  const labels = Array.from(headRow.cells).map(headerText);
  const bodies = Array.from(table.tBodies);
  if (!bodies.length) return;
  bodies.forEach((body) => Array.from(body.rows).forEach((row) => {
    // Empty-state / group rows span the whole table: keep them as one plain
    // block instead of a label-value pair with a wrong header.
    const spanning = row.cells.length === 1 && Number(row.cells[0]?.getAttribute("colspan") ?? 1) > 1;
    if (spanning) {
      row.setAttribute("data-card-full", "");
      row.removeAttribute("data-card-collapsible");
      row.removeAttribute("data-card-open");
      row.cells[0].removeAttribute("data-label");
      return;
    }
    row.removeAttribute("data-card-full");
    let hideable = 0;
    Array.from(row.cells).forEach((cell, i) => {
      if (cell.hasAttribute("colspan")) return;
      const label = labels[i];
      if (label && cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
      if (cell.getAttribute("data-card-index") !== String(i)) cell.setAttribute("data-card-index", String(i));
      // Actions, checkboxes and inputs must stay reachable without expanding.
      if (cell.querySelector(KEEP_SELECTOR)) cell.setAttribute("data-card-keep", "");
      else cell.removeAttribute("data-card-keep");
      // Cells with no content add nothing to a card.
      if (!(cell.textContent ?? "").trim() && !cell.hasAttribute("data-card-keep")) cell.setAttribute("data-card-empty", "");
      else cell.removeAttribute("data-card-empty");
      if (i >= CARD_PRIMARY_CELLS && !cell.hasAttribute("data-card-keep") && !cell.hasAttribute("data-card-empty")) hideable += 1;
    });
    const firstCell = row.cells[0] as HTMLTableCellElement | undefined;
    if (hideable > 0 && firstCell) {
      row.setAttribute("data-card-collapsible", "");
      ensureToggle(row, firstCell);
    } else {
      row.removeAttribute("data-card-collapsible");
      row.removeAttribute("data-card-open");
    }
  }));
  // Footer totals become their own summary card.
  const foot = table.tFoot;
  if (foot) Array.from(foot.rows).forEach((row) => Array.from(row.cells).forEach((cell, i) => {
    const label = labels[i];
    if (label && !cell.hasAttribute("colspan") && cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
  }));

  if (wrapper.getAttribute("data-mobile-cards") !== mode) wrapper.setAttribute("data-mobile-cards", mode);
}

function applySticky(table: HTMLTableElement, wrapper: HTMLElement) {
  if (table.hasAttribute("data-no-sticky") || wrapper.hasAttribute("data-no-sticky")) {
    wrapper.removeAttribute("data-table-sticky");
    return;
  }
  const rows = table.tBodies[0]?.rows.length ?? 0;
  const hasHead = !!table.tHead?.rows.length;
  if (hasHead && rows >= STICKY_MIN_ROWS) wrapper.setAttribute("data-table-sticky", "");
  else wrapper.removeAttribute("data-table-sticky");
}

function fitTables() {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    const parent = table.parentElement;
    if (!parent) return;
    if (table.closest(PRINT_SELECTOR)) return;
    if (parent.hasAttribute("data-table-scroll")) {
      applySticky(table, parent);
      applyCards(table, parent);
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-table-scroll", "");
    wrapper.className = "relative w-full max-w-full";
    parent.insertBefore(wrapper, table);
    wrapper.appendChild(table);
    applySticky(table, wrapper);
    applyCards(table, wrapper);
  });
}

export default function MobileTableFit() {
  const { pathname } = useLocation();

  useEffect(() => {
    fitTables();
    // Wrapping mutates the DOM, so coalesce work into one frame to avoid
    // re-entering the observer on every insertion.
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        fitTables();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    // Rotating a tablet switches between card mode and table mode.
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
