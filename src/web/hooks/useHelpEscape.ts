import { useEffect } from "react";

export function useHelpEscape(
  open: boolean,
  showHelp: boolean,
  setShowHelp: (v: boolean) => void,
): void {
  useEffect(() => {
    if (!open || !showHelp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setShowHelp(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, showHelp, setShowHelp]);
}
