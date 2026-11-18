import { BrowserMultiFormatReader } from "@zxing/browser";

export type StopScan = () => void;

export async function startBarcodeScan(
  video: HTMLVideoElement,
  onResult: (text: string) => void,
  onError?: (err: any) => void
): Promise<StopScan> {
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromVideoDevice(
    undefined,
    video,
    (result, err) => {
      if (result) onResult(result.getText());
      // ignore NotFound errors (no barcode in frame)
      else if (err && err.name !== "NotFoundException" && onError) onError(err);
    }
  );
  return () => controls.stop();
}