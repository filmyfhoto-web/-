// Pure helpers extracted from index.ts so we can unit-test them without
// mocking the whole Deno.serve handler / Drive API.
//
// * sanitizeFileSegment — used for BOTH document_no and ชื่อโรงเรียน. Strips
//   characters that Google Drive refuses (`/`, `\`) or that make file names
//   fragile across OS/browsers (`:*?"<>|` and control chars). Trims + caps
//   length so long school names never blow past Drive's 255-char limit once
//   combined with the doc-no prefix + ".pdf" suffix.
// * buildDocFileName — produces `QT-2026-0060-<school>.pdf` when a school
//   name is available, `QT-2026-0060.pdf` otherwise.
// * assertValidDocFileName — guards the final upload; if it ever fails,
//   something upstream skipped sanitization and we must NOT hand the string
//   to Drive as-is.
// * decideResync — pure decision function for the `resync_move` mode. Given
//   the file we currently point at, the destination folder / name, and any
//   file already living at the destination with that name, returns exactly
//   one action (`unchanged | adopted | moved | renamed | skipped`) plus the
//   ids the caller needs to act on.

export function sanitizeFileSegment(s: unknown): string {
  return String(s ?? "")
    // Drive rejects forward/back slash; the rest just make filenames fragile.
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    // collapse whitespace so accidental "  " doesn't leak into filenames
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function buildDocFileName(docNo: string, schoolName?: string | null): string {
  const no = sanitizeFileSegment(docNo);
  const sn = sanitizeFileSegment(schoolName ?? "");
  return sn ? `${no}-${sn}.pdf` : `${no}.pdf`;
}

// Format we accept for docs uploaded to Drive: <TYPE>-<docNo tail>[-<school>].pdf
// where TYPE is 2–4 upper-case letters (QT, DN, RC, IV, TX, PO, …), and the
// remainder contains no characters that Drive / the OS cannot handle.
const DOC_FILE_RE = /^[A-Z]{2,4}-[A-Za-z0-9\-]+(?:-[^\\/:*?"<>|\r\n\t]+)?\.pdf$/;

export function isValidDocFileName(name: string): boolean {
  if (!name || name.length > 200) return false;
  return DOC_FILE_RE.test(name);
}

export function assertValidDocFileName(name: string): void {
  if (!isValidDocFileName(name)) {
    throw new Error(`invalid drive file name: ${JSON.stringify(name)}`);
  }
}

export type DriveFileRef = { id: string; name: string; parents: string[]; webViewLink?: string };
export type DriveMatchRef = { id: string; webViewLink?: string };

export type ResyncAction = "unchanged" | "adopted" | "renamed" | "moved" | "skipped";
export type ResyncDecision =
  | { action: "unchanged"; keepFileId: string; keepUrl?: string }
  | { action: "adopted"; keepFileId: string; keepUrl?: string; trashFileId?: string }
  | { action: "renamed" | "moved"; moveFileId: string; fromParents: string[] }
  | { action: "skipped" };

export function decideResync(input: {
  current: DriveFileRef | null;
  existing: DriveMatchRef | null;
  targetFolderId: string;
  targetName: string;
}): ResyncDecision {
  const { current, existing, targetFolderId, targetName } = input;

  // No file we own AND nothing at the destination → nothing to do (skip).
  if (!current && !existing) return { action: "skipped" };

  // We lost track of our file (deleted/trashed) but the destination already
  // has a file with the right name → adopt it.
  if (!current && existing) {
    return { action: "adopted", keepFileId: existing.id, keepUrl: existing.webViewLink };
  }

  const cur = current!;
  const inRightFolder = (cur.parents ?? []).includes(targetFolderId);
  const sameName = cur.name === targetName;

  if (inRightFolder && sameName) {
    return { action: "unchanged", keepFileId: cur.id, keepUrl: cur.webViewLink };
  }

  // Destination already has a *different* file with the target name.
  // Adopt the destination and trash our stray copy to avoid duplicates.
  if (existing && existing.id !== cur.id) {
    return {
      action: "adopted",
      keepFileId: existing.id,
      keepUrl: existing.webViewLink,
      trashFileId: cur.id,
    };
  }

  // Otherwise move + rename our file into place.
  return {
    action: inRightFolder ? "renamed" : "moved",
    moveFileId: cur.id,
    fromParents: cur.parents ?? [],
  };
}