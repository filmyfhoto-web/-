/**
 * Where the PWA `start_url` (`/launch?app=...`) should send a user.
 *
 * The installed icon says which workspace the user *wanted*; their real role
 * decides what they are allowed to see. Role always wins, so an admin icon on
 * a stock-staff phone still lands on a page that actually renders.
 */
import type { PwaApp } from "./pwaManifest";
import { POS_LOGIN_PATH } from "./posLoginContext";

export type LaunchRole = {
  signedIn: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  /** owner/admin/stock_staff/photo_staff */
  isStaffAny: boolean;
  /** may open POS selling screen */
  canPos: boolean;
  /** may open stock screens */
  canStock: boolean;
  /**
   * This device previously used the admin workspace (persisted marker).
   * Used to recover legacy home-screen icons whose `start_url` still points
   * at the customer launch target.
   */
  adminDevice?: boolean;
};

export function launchTarget(app: PwaApp, r: LaunchRole): string {
  if (!r.signedIn) {
    if (app === "admin") return "/auth";
    // The register icon must keep its context through login, otherwise the
    // manifest flips to staff and the user lands on /staff/home.
    if (app === "pos") return POS_LOGIN_PATH;
    if (app === "staff") return "/staff?app=staff";
    if (app === "receipts") return "/staff?app=receipts&next=%2Freceipts";
    if (app === "film-shop") return "/staff?app=film-shop&next=%2Freceipts%2Ffilm";
    // Legacy recovery: a home-screen icon installed with the customer
    // start_url on a phone that has been used as an admin device should offer
    // the admin login instead of a LINE-only dead end.
    if (app === "customer" && r.adminDevice) return "/auth?app=admin";
    return "/shop";
  }

  // Real role wins over the installed icon. Owners/admins launching the
  // customer icon (including legacy iOS shortcuts that still carry
  // `?app=customer`) land on the admin console, never the storefront.
  if (app === "customer") {
    if (r.isOwner || r.isAdmin) return "/admin/home";
    return "/shop";
  }

  // Touch register icon: only for people who may actually sell.
  if (app === "pos") {
    if (r.isOwner || r.isAdmin || r.canPos) return "/pos/register";
    if (r.isStaffAny) return r.canStock ? "/pos/stock" : "/staff/inbox";
    return "/shop";
  }

  if (app === "receipts") {
    return r.isStaffAny ? "/receipts" : "/shop";
  }

  if (app === "film-shop") {
    return r.isStaffAny ? "/admin/home" : "/shop";
  }

  if (app === "admin" && (r.isOwner || r.isAdmin)) return "/admin/home";

  if (r.isStaffAny) {
    if (r.canPos) return "/pos";
    if (r.canStock) return "/pos/stock";
    return "/staff/inbox";
  }

  // Signed in but no staff role at all — an admin/staff icon is useless.
  return "/shop";
}