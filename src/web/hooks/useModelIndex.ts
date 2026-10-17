import { useEffect, useState } from "react";
import type { ModelIndex } from "../../shared/model-types";

interface ModelIndexState {
  index: ModelIndex | null;
  loading: boolean;
  error: string | null;
}

let cachedPromise: Promise<ModelIndex> | null = null;

/**
 * Загружает ModelIndex с сервера. Кэшируется на весь lifetime страницы.
 */
export function useModelIndex(): ModelIndexState {
  const [state, setState] = useState<ModelIndexState>({
    index: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!cachedPromise) {
      cachedPromise = fetch("/api/model")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .catch((err) => {
          cachedPromise = null;
          throw err;
        });
    }

    let cancelled = false;
    cachedPromise
      .then((index) => {
        if (!cancelled) setState({ index, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ index: null, loading: false, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Ручная инвалидация кэша — на случай refresh. */
export function invalidateModelIndexCache(): void {
  cachedPromise = null;
}
