/**
 * Deterministic role -> home resolution for the single landing router.
 * Exactly one destination per state so a signed-in user can never bounce
 * between two pages.
 */
export type RoleHomeInput = {
  signedIn: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  isStaffAny?: boolean;
  /** Customer identity (LINE-bound shopper or plain authenticated buyer). */
  isCustomer?: boolean;
};

export const WELCOME_PATH = "/welcome";
export const NO_ACCESS_PATH = "/no-access";
/** Owner/admin land on the current NATTA GROUP “วันนี้” dashboard. */
export const ADMIN_HOME = "/admin/home";
/** พนักงานเข้าหน้า “วันนี้” เป็นหน้าแรก ไม่เด้งไปแดชบอร์ดโมดูลเดิม */
export const STAFF_HOME = "/admin/home";
export const CUSTOMER_HOME = "/account";

export function resolveRoleHome(input: RoleHomeInput): string {
  if (!input.signedIn) return WELCOME_PATH;
  if (input.isOwner || input.isAdmin) return ADMIN_HOME;
  if (input.isStaffAny) return STAFF_HOME;
  if (input.isCustomer) return CUSTOMER_HOME;
  return NO_ACCESS_PATH;
}

/** Paths that must never redirect into each other (loop protection). */
const TERMINAL = new Set<string>([WELCOME_PATH, NO_ACCESS_PATH, "/customer/login", "/staff/login"]);

export function shouldRedirect(currentPath: string, target: string): boolean {
  if (currentPath === target) return false;
  if (TERMINAL.has(currentPath) && TERMINAL.has(target)) return false;
  return true;
}