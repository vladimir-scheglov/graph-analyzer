import { useEffect, useState } from "react";

const MONACO_VERSION = "0.52.2";

let loadPromise: Promise<void> | null = null;
let isLoaded = false;

/** Предзагрузка (можно вызвать в entry.tsx). */
export function preloadMonaco(): Promise<void> {
  if (isLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const w = window as any;

    if (w.monaco && w.monaco.editor) {
      isLoaded = true;
      resolve();
      return;
    }

    const start = (attempt: number) => {
      if (typeof w.require === "undefined") {
        if (attempt > 100)
          return reject(new Error("monaco loader не загрузился"));
        setTimeout(() => start(attempt + 1), 100);
        return;
      }

      try {
        w.require.config({
          paths: {
            vs: `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min/vs`,
          },
        });
      } catch {
        // уже сконфигурирован
      }

      w.require(
        ["vs/editor/editor.main"],
        () => {
          if (w.monaco && w.monaco.editor) {
            isLoaded = true;
            resolve();
          } else {
            reject(new Error("monaco загрузился, но объект недоступен"));
          }
        },
        (err: any) =>
          reject(err instanceof Error ? err : new Error(String(err))),
      );
    };

    start(0);
  });

  return loadPromise;
}

export function useMonacoLoader(): { ready: boolean; error: string | null } {
  const [ready, setReady] = useState(isLoaded);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    preloadMonaco()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "ошибка загрузки Monaco");
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return { ready, error };
}
