export type StoreSlug = "colorlab" | "printing" | "film";

export interface RdsStore {
  id: string;
  slug: StoreSlug;
  name: string;
  tax_id: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  default_vat_rate: number;
  vat_enabled: boolean;
  brand_color?: string | null;
  doc_theme?: DocThemeMap | null;
  attach_biz_reg_url?: string | null;
  attach_id_copy_url?: string | null;
  attach_bankbook_url?: string | null;
}

export type DocThemeEntry = { title?: string; header?: string };
export type DocThemeMap = Record<string, DocThemeEntry>;

export const STORE_THEME: Record<StoreSlug, { accent: string; tag: string }> = {
  colorlab: { accent: "from-[#7A5C3A] to-[#B8956A]", tag: "VAT 7%" },
  printing: { accent: "from-[#3B2F25] to-[#7A5C3A]", tag: "ไม่มี VAT" },
  film: { accent: "from-[#0f172a] to-[#3b82f6]", tag: "FILM SHOP" },
};