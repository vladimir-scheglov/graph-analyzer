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
      markedPromise = import("https://esm.sh/marked@12.0.2");
    }
    markedPromise
      .then((mod) => {
        const fn = mod.marked ? mod.marked.parse : mod.parse;
        if (typeof fn === "function") setParse(() => fn);
      })
      .catch(() => setParse(null));
  }, [parse]);

  return { parse, ready: !!parse };
}
