import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tbl } from "./tbl";

export interface LayoutMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface DocLayout {
  id: string;
  store_id: string;
  name: string;
  doc_type: string | null;
  base_template: string;
  header_text: string | null;
  footer_text: string | null;
  margins: LayoutMargins;
  show_logo: boolean;
  show_tax_id: boolean;
  show_store_address: boolean;
  show_document_no: boolean;
  show_document_date: boolean;
  accent_color: string | null;
  is_default: boolean;
  /** Logo scale factor (0.6–1.6). 1 = base size (~24mm). */
  logo_scale: number;
  /** Horizontal placement of the logo in the header row. */
  logo_align: "left" | "center" | "right";
  /** Vertical gap between consecutive pages in preview (mm). Print always uses fresh pages. */
  page_gap_mm: number;
  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_MARGINS: LayoutMargins = { top: 14, bottom: 14, left: 12, right: 12 };
export const DEFAULT_LOGO_SCALE = 1;
export const DEFAULT_LOGO_ALIGN: "left" | "center" | "right" = "right";
export const DEFAULT_PAGE_GAP_MM = 16;
export const LOGO_SCALE_MIN = 0.6;
export const LOGO_SCALE_MAX = 1.6;
export const PAGE_GAP_MIN = 8;
export const PAGE_GAP_MAX = 40;

function clamp(v: number, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function coerceLayout(raw: any): DocLayout {
  const m = (raw?.margins ?? {}) as Partial<LayoutMargins>;
  const align = (raw?.logo_align === "left" || raw?.logo_align === "center" || raw?.logo_align === "right")
    ? raw.logo_align
    : DEFAULT_LOGO_ALIGN;
  return {
    ...raw,
    margins: {
      top: Number(m.top ?? DEFAULT_MARGINS.top),
      bottom: Number(m.bottom ?? DEFAULT_MARGINS.bottom),
      left: Number(m.left ?? DEFAULT_MARGINS.left),
      right: Number(m.right ?? DEFAULT_MARGINS.right),
    },
    logo_scale: clamp(raw?.logo_scale ?? DEFAULT_LOGO_SCALE, LOGO_SCALE_MIN, LOGO_SCALE_MAX, DEFAULT_LOGO_SCALE),
    logo_align: align,
    page_gap_mm: clamp(raw?.page_gap_mm ?? DEFAULT_PAGE_GAP_MM, PAGE_GAP_MIN, PAGE_GAP_MAX, DEFAULT_PAGE_GAP_MM),
  } as DocLayout;
}

/** Load every layout for a store. */
export function useDocLayouts(storeId: string | undefined) {
  return useQuery({
    queryKey: ["rds_document_layouts", storeId],
    enabled: !!storeId,
    queryFn: async (): Promise<DocLayout[]> => {
      const { data, error } = await supabase
        .from(tbl("document_layouts") as any)
        .select("*")
        .eq("store_id", storeId as string)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as any[]) ?? []).map(coerceLayout);
    },
  });
}

/** Pick the layout for a given doc: explicit → doc-type default → any default → null. */
export function pickLayout(
  layouts: DocLayout[] | undefined,
  layoutId: string | null | undefined,
  docType: string,
): DocLayout | null {
  if (!layouts || !layouts.length) return null;
  if (layoutId) {
    const hit = layouts.find((l) => l.id === layoutId);
    if (hit) return hit;
  }
  const typed = layouts.find((l) => l.is_default && l.doc_type === docType);
  if (typed) return typed;
  const any = layouts.find((l) => l.is_default && !l.doc_type);
  return any ?? null;
}

export function useSaveLayout(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<DocLayout> & { id?: string }) => {
      const row = { ...payload, store_id: storeId };
      if (payload.id) {
        const { error } = await supabase
          .from(tbl("document_layouts") as any)
          .update(row as any)
          .eq("id", payload.id);
        if (error) throw error;
        return payload.id;
      }
      const { data, error } = await supabase
        .from(tbl("document_layouts") as any)
        .insert(row as any)
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rds_document_layouts", storeId] }),
  });
}

export function useDeleteLayout(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(tbl("document_layouts") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rds_document_layouts", storeId] }),
  });
}

export function useSetDefaultLayout(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { id: string; docType: string | null }) => {
      // Clear existing default in the same scope, then set this one.
      let clear = supabase
        .from(tbl("document_layouts") as any)
        .update({ is_default: false } as any)
        .eq("store_id", storeId as string)
        .eq("is_default", true);
      clear = opts.docType == null ? clear.is("doc_type", null) : clear.eq("doc_type", opts.docType);
      await clear;
      const { error } = await supabase
        .from(tbl("document_layouts") as any)
        .update({ is_default: true } as any)
        .eq("id", opts.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rds_document_layouts", storeId] }),
  });
}

/** Config shape passed into DocumentPreview / PrintDocument, extended with layout overrides. */
export interface ResolvedTemplateConfig {
  header_text?: string;
  footer_text?: string;
  margins?: LayoutMargins;
  show_logo?: boolean;
  show_tax_id?: boolean;
  show_store_address?: boolean;
  show_document_no?: boolean;
  show_document_date?: boolean;
  accent_color?: string | null;
  logo_scale?: number;
  logo_align?: "left" | "center" | "right";
  page_gap_mm?: number;
  /** Optional printable frame override. Defaults remain locked to A4 210×297mm. */
  page_width_mm?: number;
  page_height_mm?: number;
  frame_width_mm?: number;
  frame_height_mm?: number;
  /** Optional page padding override. Defaults remain 10/10/17/10mm = 190×270mm content. */
  page_padding?: Partial<LayoutMargins>;
  page_layout?: {
    widthMm?: number;
    heightMm?: number;
    paddingMm?: Partial<LayoutMargins>;
  };
}

/** Merge legacy template config (from rds_document_templates) with a chosen layout. */
export function mergeConfigWithLayout(
  legacy: { header_text?: string; footer_text?: string } | null | undefined,
  layout: DocLayout | null | undefined,
): ResolvedTemplateConfig | undefined {
  if (!legacy && !layout) return undefined;
  const cfg: ResolvedTemplateConfig = {
    header_text: legacy?.header_text,
    footer_text: legacy?.footer_text,
  };
  if (layout) {
    if (layout.header_text != null) cfg.header_text = layout.header_text;
    if (layout.footer_text != null) cfg.footer_text = layout.footer_text;
    cfg.margins = layout.margins;
    cfg.show_logo = layout.show_logo;
    cfg.show_tax_id = layout.show_tax_id;
    cfg.show_store_address = layout.show_store_address;
    cfg.show_document_no = layout.show_document_no;
    cfg.show_document_date = layout.show_document_date;
    cfg.accent_color = layout.accent_color;
    cfg.logo_scale = layout.logo_scale;
    cfg.logo_align = layout.logo_align;
    cfg.page_gap_mm = layout.page_gap_mm;
  }
  return cfg;
}

/**
 * Estimate whether the header title has room for the logo.
 * Base logo width ≈ 32mm (h=24mm, typical aspect). Header row is
 * `paper_width - margins.left - margins.right - 36mm (right title padding)`.
 * Returns `true` when the estimated remaining title width drops below 40mm,
 * i.e. the store name is likely to collide with the logo.
 */
export function checkLogoCollision(opts: {
  paperWidthMm: number;
  margins?: Partial<LayoutMargins>;
  logoScale: number;
  storeNameLength?: number;
}): { risk: boolean; availableMm: number } {
  const left = Number(opts.margins?.left ?? DEFAULT_MARGINS.left);
  const right = Number(opts.margins?.right ?? DEFAULT_MARGINS.right);
  const usable = Math.max(0, opts.paperWidthMm - left - right);
  const logoWidthMm = 32 * (Number(opts.logoScale) || 1);
  const gapMm = 12;
  const available = usable - logoWidthMm - gapMm;
  const nameNeededMm = Math.max(40, ((opts.storeNameLength ?? 24) * 2.6));
  return { risk: available < nameNeededMm, availableMm: Math.round(available) };
}