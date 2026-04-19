import { useEffect, useState } from "react";

const SEQUENCE = ["C", "L", "U", "C", "K"];
const TIMEOUT_MS = 2000;

export function useCluckEasterEgg() {
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function handleKeyDown(e: KeyboardEvent) {
      if (!e.shiftKey) return;

      const key = e.key.toUpperCase();
      const expected = SEQUENCE[progress.length];

      if (key !== expected) {
        setProgress(key === SEQUENCE[0] ? [key] : []);
        return;
      }

      const next = [...progress, key];

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setProgress([]), TIMEOUT_MS);

      if (next.length === SEQUENCE.length) {
        setIsOpen(true);
        setProgress([]);
        if (timer) clearTimeout(timer);
      } else {
        setProgress(next);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [progress]);

  return { isOpen, close: () => setIsOpen(false) };
}
