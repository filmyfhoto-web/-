/**
 * Decides when a newly detected build may be applied WITHOUT asking the user.
 *
 * "อัปเดตตลอดเวลา" must never destroy in-progress work: a cashier mid-sale, an
 * open dialog, or a dirty form. So auto-apply is only allowed when the screen
 * is idle and nothing is being edited — otherwise the banner stays and the
 * user applies it manually.
 */
export type AutoUpdateContext = {
  hasUpdate: boolean;
  /** ms since the last pointer/key interaction */
  idleMs: number;
  /** true when a modal/dialog/sheet is currently open */
  dialogOpen: boolean;
  /** true when a form marked data-unsaved="true" exists */
  unsavedForm: boolean;
  /** true when the tab is visible (we only reload a visible tab) */
  visible: boolean;
  online: boolean;
};

export type AutoUpdateContextWithTag = AutoUpdateContext & {
  /** the deployed tag we would be reloading into */
  targetTag?: string | null;
};

export const AUTO_UPDATE_IDLE_MS = 6_000;

/**
 * One automatic reload **per released build**. Keying the guard on the target
 * tag keeps the loop protection (the same tag can never reload twice) while
 * still letting every later deploy reach a device that stays open for days —
 * phone, tablet or desktop.
 */
const AUTO_UPDATE_FLAG = "__autoUpdateAppliedTag";

export function autoUpdateAlreadyApplied(tag?: string | null): boolean {
  try {
    const done = sessionStorage.getItem(AUTO_UPDATE_FLAG);
    if (!done) return false;
    return done === (tag ?? "1");
  } catch {
    return false;
  }
}

export function markAutoUpdateApplied(tag?: string | null): void {
  try {
    sessionStorage.setItem(AUTO_UPDATE_FLAG, tag ?? "1");
  } catch {
    /* private mode — the in-memory guard in the caller still applies */
  }
}

export function shouldAutoUpdate(ctx: AutoUpdateContextWithTag): boolean {
  if (!ctx.hasUpdate || !ctx.visible || !ctx.online) return false;
  if (ctx.dialogOpen || ctx.unsavedForm) return false;
  if (autoUpdateAlreadyApplied(ctx.targetTag)) return false;
  return ctx.idleMs >= AUTO_UPDATE_IDLE_MS;
}

/** Reads the live DOM state used by `shouldAutoUpdate`. */
export function readDomBlockers(): Pick<AutoUpdateContext, "dialogOpen" | "unsavedForm"> {
  if (typeof document === "undefined") return { dialogOpen: false, unsavedForm: false };
  return {
    dialogOpen: !!document.querySelector('[role="dialog"],[role="alertdialog"],dialog[open]'),
    unsavedForm: !!document.querySelector('[data-unsaved="true"]'),
  };
}