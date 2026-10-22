import { useEffect, useState } from "react";

let markedPromise: Promise<any> | null = null;

/**
 * Ленивая загрузка marked@12 из esm.sh.
 * Возвращает функцию parse(markdown) → html.
 */
export function useMarked(): {
  parse: ((md: string) => string) | null;
  ready: boolean;
} {
  const [parse, setParse] = useState<((md: string) => string) | null>(null);

  useEffect(() => {
    if (parse) return;
    if (!markedPromise) {
      markedPromise = import("https://cdn.jsdelivr.net/npm/marked@12.0.2/+esm");
    }
    markedPromise
      .then((mod) => {
        // marked v12 экспортирует и `marked.parse`, и `parse`.
        const fn = (mod as any).marked?.parse ?? (mod as any).parse;
        if (typeof fn === "function") setParse(() => fn);
      })
      .catch(() => setParse(null));
  }, [parse]);

  return { parse, ready: !!parse };
}
