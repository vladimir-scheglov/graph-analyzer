import { useEffect, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { ModelIndex } from "../../shared/model-types";

interface ModelIndexState {
  index: ModelIndex | null;
  loading: boolean;
  error: string | null;
}

interface CachedEntry {
  version: number;
  promise: Promise<ModelIndex>;
}

let cache: CachedEntry | null = null;

export function invalidateModelIndexCache(): void {
  cache = null;
}

export function useModelIndex(): ModelIndexState {
  const modelVersion = useGraphStore((s) => s.modelVersion);
  const [state, setState] = useState<ModelIndexState>({
    index: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    // Кэш по версии: несколько компонентов с одинаковым modelVersion
    // используют ОДИН promise вместо N fetch'ей.
    if (!cache || cache.version !== modelVersion) {
      const promise = fetch("/api/model").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ModelIndex>;
      });

      // При ошибке — обнулить кэш, но только если он всё ещё указывает
      // на этот promise. Иначе можно снести свежий запрос (race с bumpModelVersion).
      promise.catch(() => {
        if (cache && cache.promise === promise) cache = null;
      });

      cache = { version: modelVersion, promise };
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    cache.promise
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
  }, [modelVersion]);

  return state;
}
