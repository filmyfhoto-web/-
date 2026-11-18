/** รูปโปรไฟล์ลูกค้า (LINE) — ถ้าไม่มีรูปหรือโหลดไม่ได้ ใช้ตัวอักษรแรกของชื่อแทน */
import { useEffect, useState } from "react";
import { profileInitial, safePictureUrl } from "@/lib/lineProfile";

export default function CustomerAvatar({
  name,
  pictureUrl,
  size = 40,
  className = "",
}: {
  name: string;
  pictureUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [pictureUrl]);
  const src = broken ? null : safePictureUrl(pictureUrl);

  return (
    <span
      data-testid="customer-avatar"
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: "hsl(var(--ng-purple-tint))",
        color: "hsl(var(--ng-purple-deep))",
      }}
    >
      {src ? (
        <img
          src={src}
          alt={`รูปโปรไฟล์ของ ${name}`}
          loading="lazy"
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden>{profileInitial(name)}</span>
      )}
    </span>
  );
}
