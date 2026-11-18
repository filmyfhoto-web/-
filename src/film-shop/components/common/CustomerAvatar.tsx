import { UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface Props {
  name?: string | null;
  pictureUrl?: string | null;
  className?: string;
  /** จำนวนข้อความที่ยังไม่อ่าน — แสดงเป็นวงกลมสีแดงมุมขวาบน */
  unread?: number;
  /** จุดสถานะออนไลน์/เชื่อมต่อช่องทางแล้ว (สีเขียว) มุมขวาล่าง */
  online?: boolean;
  /** กรอบเน้นเมื่อการ์ดถูกเลือก */
  ring?: boolean;
}

/**
 * รูปโปรไฟล์จริงของลูกค้า (LINE OA / ช่องทางอื่น)
 * ไม่มีรูป → แสดงอวตารมาตรฐาน พร้อม badge ยังไม่อ่าน และจุดออนไลน์
 */
export function CustomerAvatar({ name, pictureUrl, className, unread = 0, online, ring }: Props) {
  const label = (name ?? '').trim() || 'ลูกค้า LINE';
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar
        className={cn(
          'h-9 w-9 shrink-0 border border-border bg-muted shadow-sm',
          ring && 'ring-2 ring-primary/60 ring-offset-1 ring-offset-card',
          className,
        )}
      >
        {pictureUrl ? <AvatarImage src={pictureUrl} alt={`รูปโปรไฟล์ของ ${label}`} loading="lazy" className="object-cover" /> : null}
        <AvatarFallback className="bg-muted text-muted-foreground">
          <UserRound className="h-1/2 w-1/2" aria-hidden />
          <span className="sr-only">{label}</span>
        </AvatarFallback>
      </Avatar>
      {online && (
        <span
          aria-label="เชื่อมต่อช่องทางแล้ว"
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-success"
        />
      )}
      {unread > 0 && (
        <span
          data-testid="avatar-unread-badge"
          className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground tabular-nums"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </span>
  );
}

export default CustomerAvatar;
