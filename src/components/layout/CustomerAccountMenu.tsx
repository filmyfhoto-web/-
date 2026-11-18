import { useNavigate } from "react-router-dom";
import { LogOut, User, ClipboardList, UserCircle2, FolderOpen, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLineCustomer } from "@/contexts/LineCustomerContext";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";
import { logoutCustomer } from "@/lib/customerLogout";


/** Compact avatar+dropdown for LINE-authenticated customers. */
export function CustomerAccountMenu() {
  const nav = useNavigate();
  const { profile } = useLineCustomer();
  if (!profile) return null;

  const name = profile.display_name || profile.customer_name || "บัญชี";
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 md:h-9 md:w-auto md:px-2 rounded-full md:rounded-xl p-0 md:gap-2"
          aria-label={`บัญชีของ ${name}`}
          title={name}
        >
          {profile.picture_url ? (
            <img
              src={profile.picture_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover border border-border"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-medium">
              {initial}
            </span>
          )}
          <span className="hidden md:inline text-sm max-w-[120px] truncate">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm truncate">{name}</span>
          {profile.phone && (
            <span className="text-[11px] text-muted-foreground truncate">{profile.phone}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => nav("/my-account")}>
          <UserCircle2 className="w-4 h-4 mr-2" /> บัญชีของฉัน
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => nav("/my-orders")}>
          <ClipboardList className="w-4 h-4 mr-2" /> ประวัติคำสั่งซื้อ
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => nav(ACCOUNT_ROUTES.allHistory)}>
          <History className="w-4 h-4 mr-2" /> ประวัติรวมทุกช่องทาง
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => nav(ACCOUNT_ROUTES.excel)}>
          <FolderOpen className="w-4 h-4 mr-2" /> ส่งไฟล์ Excel ให้ร้าน
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logoutCustomer()}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="w-4 h-4 mr-2" /> ออกจากระบบ / เปลี่ยนผู้ใช้
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}