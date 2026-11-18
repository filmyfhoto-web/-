import { useEffect } from "react";

/**
 * Warn the user before they close the tab / reload when the form is dirty.
 * Pure browser event — SPA in-app navigation is not blocked (react-router v6
 * has no stable Prompt API).
 */
export function useFormGuard(dirty: boolean, message = "ข้อมูลที่กรอกยังไม่ได้บันทึก ต้องการออกหรือไม่?") {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, message]);
}

/** Confirm before discarding unsaved changes (use before closing dialogs/resetting). */
export function confirmDiscard(dirty: boolean, message = "ทิ้งข้อมูลที่ยังไม่ได้บันทึก?"): boolean {
  if (!dirty) return true;
  return typeof window !== "undefined" ? window.confirm(message) : true;
}