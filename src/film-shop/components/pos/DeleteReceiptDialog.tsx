import { useEffect, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  isDeleting: boolean;
  onConfirm: () => void;
}

export function DeleteReceiptDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'ลบ',
  isDeleting,
  onConfirm,
}: DeleteReceiptDialogProps) {
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      // Autofocus the destructive action so Enter confirms immediately
      const t = setTimeout(() => actionRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isDeleting) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isDeleting) {
            e.preventDefault();
            onConfirm();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction
            ref={actionRef}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'กำลังลบ...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
