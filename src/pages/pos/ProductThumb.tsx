import { useEffect, useState } from "react";
import { Package } from "lucide-react";

/**
 * Square product thumbnail used across the POS scan card, cart rows and
 * variant picker.
 *
 * - fixed 1:1 box + object-cover so no image is ever stretched
 * - accepts any existing URL shape (legacy absolute URLs, Supabase Storage
 *   public URLs, data URLs) — we never rewrite the src
 * - when there is no image, or the URL fails to load, we render a tidy
 *   placeholder with the product's initial(s) instead of a broken image
 */
export function productInitials(name: string | null | undefined): string {
  const n = (name || "").trim();
  if (!n) return "";
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

type Props = {
  src?: string | null;
  name?: string | null;
  /** tailwind size classes for the square box */
  className?: string;
  testId?: string;
};

export default function ProductThumb({ src, name, className = "h-12 w-12", testId }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const url = src && src.trim() ? src.trim() : null;
  const showImage = url && !failed;
  const initials = productInitials(name);

  return (
    <div
      className={`${className} relative shrink-0 aspect-square overflow-hidden rounded-md border bg-muted`}
      data-testid={testId}
      data-placeholder={showImage ? "0" : "1"}
    >
      {showImage ? (
        <img
          src={url}
          alt={name ? `รูปสินค้า ${name}` : "รูปสินค้า"}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
          data-testid={testId ? `${testId}-img` : undefined}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground"
          aria-label={name ? `ไม่มีรูปสินค้า ${name}` : "ไม่มีรูปสินค้า"}
          role="img"
        >
          {initials ? (
            <span className="select-none text-[11px] font-bold leading-none tracking-tight">
              {initials}
            </span>
          ) : (
            <Package className="h-1/2 w-1/2 opacity-60" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}
