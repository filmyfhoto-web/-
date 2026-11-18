import { useRef, useState, ReactNode, useEffect, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Camera, ScanLine, FilePlus2 } from 'lucide-react';
import { DocumentScanner } from './DocumentScanner';
import { cn } from '@/lib/utils';

interface Props {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  scanOutputAs?: 'pdf' | 'images';
  scanFileBaseName?: string;
  /** Show as compact icon row (default false) */
  compact?: boolean;
  /** Hide the drop-zone area */
  hideDropZone?: boolean;
  /** Listen for clipboard paste events anywhere in the document */
  pasteFromAnywhere?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Universal attachment input with four sources:
 * - File picker (any file)
 * - Camera capture (single photo)
 * - Document scanner (multi-page → PDF/images)
 * - Drag & drop (desktop) + paste from clipboard
 */
export function AttachmentInput({
  onFiles,
  accept = 'image/*,.pdf',
  multiple = true,
  scanOutputAs = 'pdf',
  scanFileBaseName = 'scan',
  compact = false,
  hideDropZone = false,
  pasteFromAnywhere = false,
  className,
  children,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const emit = (list: File[] | FileList | null) => {
    if (!list) return;
    const arr = Array.from(list as FileList);
    if (arr.length === 0) return;
    // Filter by accept (best-effort) — only mime portion
    const accepts = accept.split(',').map(s => s.trim()).filter(Boolean);
    const filtered = accepts.length === 0 ? arr : arr.filter(f => {
      return accepts.some(a => {
        if (a.startsWith('.')) return f.name.toLowerCase().endsWith(a.toLowerCase());
        if (a.endsWith('/*')) return f.type.startsWith(a.slice(0, -1));
        return f.type === a;
      });
    });
    if (filtered.length > 0) onFiles(filtered);
  };

  // Paste support
  useEffect(() => {
    if (!pasteFromAnywhere) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (items && items.length > 0) {
        e.preventDefault();
        emit(items);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pasteFromAnywhere]);

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    emit(e.dataTransfer?.files || null);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {!hideDropZone && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onPaste={(e) => emit(e.clipboardData?.files || null)}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 sm:p-6 cursor-pointer transition-colors',
            'min-h-[120px] sm:min-h-[140px]',
            dragOver
              ? 'border-primary bg-primary/10'
              : 'border-border bg-muted/30 hover:bg-muted/50'
          )}
        >
          <FilePlus2 className={cn('h-7 w-7', dragOver ? 'text-primary' : 'text-muted-foreground')} />
          <div className="text-center">
            <p className="text-sm font-medium">
              <span className="sm:hidden">แตะเพื่อแนบไฟล์</span>
              <span className="hidden sm:inline">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              รองรับการวางจาก clipboard (Ctrl+V) — รูปภาพ, PDF
            </p>
          </div>
        </div>
      )}

      <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-3 gap-2'}>
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="justify-center min-h-11">
          <Upload className="w-4 h-4 mr-1.5" /> แนบไฟล์
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => camRef.current?.click()} className="justify-center min-h-11">
          <Camera className="w-4 h-4 mr-1.5" /> ถ่ายรูป
        </Button>
        <Button type="button" size="sm" variant="default" onClick={() => setScannerOpen(true)} className="justify-center min-h-11">
          <ScanLine className="w-4 h-4 mr-1.5" /> สแกน
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => { emit(e.target.files); e.currentTarget.value = ''; }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { emit(e.target.files); e.currentTarget.value = ''; }}
      />

      {children}

      <DocumentScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        outputAs={scanOutputAs}
        fileBaseName={scanFileBaseName}
        onComplete={(files) => onFiles(files)}
      />
    </div>
  );
}
