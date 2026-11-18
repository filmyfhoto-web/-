/**
 * Locked A4 paper constants for the entire receipt/document printing
 * pipeline. All measurements in millimetres.
 *
 * The frame is deliberately hard-coded — user preferences (paper size,
 * orientation, custom paper) MUST NOT change the primary preview or the
 * printed page dimensions. Callers that need to expose overrides can pass
 * an explicit `pageLayout` prop; the defaults resolve to these values.
 */

export const A4_PAGE = Object.freeze({
  widthMm: 210,
  heightMm: 297,
});

/** Printable content frame INSIDE the page padding (190 × 270 mm). */
export const CONTENT_FRAME = Object.freeze({
  widthMm: 190,
  heightMm: 270,
});

/**
 * Locked padding: 10mm on top/left/right and 17mm at the bottom
 * (17 = 297 − 270 − 10) so the content frame ends up 190×270mm.
 */
export const LOCKED_PADDING = Object.freeze({
  top: 10,
  right: 10,
  bottom: 17,
  left: 10,
});

export type LockedPageLayout = {
  widthMm: number;
  heightMm: number;
  paddingMm: { top: number; right: number; bottom: number; left: number };
  contentWidthMm: number;
  contentHeightMm: number;
  paddingCss: string;
};

export function getLockedPageLayout(): LockedPageLayout {
  return {
    widthMm: A4_PAGE.widthMm,
    heightMm: A4_PAGE.heightMm,
    paddingMm: { ...LOCKED_PADDING },
    contentWidthMm: CONTENT_FRAME.widthMm,
    contentHeightMm: CONTENT_FRAME.heightMm,
    paddingCss: `${LOCKED_PADDING.top}mm ${LOCKED_PADDING.right}mm ${LOCKED_PADDING.bottom}mm ${LOCKED_PADDING.left}mm`,
  };
}
