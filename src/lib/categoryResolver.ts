/**
 * Shared helper for normalizing & resolving category names during imports.
 * Used by Google-Sheet import (Prices) and Excel/CSV template import.
 */

export type ExistingCategory = { id: string; name: string };

export type ResolveResult = {
  /** Map: rawName (as it appears in the row) -> category id. Empty when toCreate not yet inserted. */
  map: Map<string, string>;
  /** Distinct *display* names that need to be inserted (normalized-unique). */
  toCreate: string[];
  /** Soft warnings about near-duplicates that did NOT collapse. */
  warnings: string[];
};

/** Lower-cased, trimmed, internal whitespace collapsed. */
export function normalizeCategoryName(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Group raw names by their normalized form and split into "already exists" vs "must create".
 * The returned `map` keys are the *raw* names from the rows (post-trim) so callers can look up
 * each row directly without re-normalizing.
 */
export function resolveCategories(
  rawNames: ReadonlyArray<unknown>,
  existing: ReadonlyArray<ExistingCategory>,
): ResolveResult {
  const map = new Map<string, string>();
  const warnings: string[] = [];

  // Index existing by normalized key.
  const existingByKey = new Map<string, ExistingCategory>();
  for (const c of existing) {
    const key = normalizeCategoryName(c.name);
    if (!key) continue;
    if (!existingByKey.has(key)) existingByKey.set(key, c);
  }

  // Bucket incoming raw names by normalized key.
  const buckets = new Map<string, string[]>();
  for (const raw of rawNames) {
    if (raw == null) continue;
    const display = String(raw).trim();
    if (!display) continue;
    const key = normalizeCategoryName(display);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    if (!list.includes(display)) list.push(display);
    buckets.set(key, list);
  }

  const toCreate: string[] = [];
  for (const [key, displays] of buckets) {
    if (displays.length > 1) {
      warnings.push(`ชื่อหมวด "${displays.join('", "')}" ถูกรวมเป็นหมวดเดียวกัน`);
    }
    const found = existingByKey.get(key);
    if (found) {
      for (const d of displays) map.set(d, found.id);
    } else {
      // Pick canonical display (first occurrence) for the new category row.
      toCreate.push(displays[0]);
    }
  }

  return { map, toCreate, warnings };
}

/**
 * After inserting `toCreate` rows, merge their ids back into the resolver map.
 */
export function mergeCreated(
  result: ResolveResult,
  rawNames: ReadonlyArray<unknown>,
  created: ReadonlyArray<ExistingCategory>,
): void {
  const byKey = new Map<string, string>();
  for (const c of created) byKey.set(normalizeCategoryName(c.name), c.id);
  for (const raw of rawNames) {
    if (raw == null) continue;
    const display = String(raw).trim();
    if (!display) continue;
    if (result.map.has(display)) continue;
    const id = byKey.get(normalizeCategoryName(display));
    if (id) result.map.set(display, id);
  }
}