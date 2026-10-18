import { useEffect, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { ModelIndex } from "../../shared/model-types";

interface ModelIndexState {
  index: ModelIndex | null;
  loading: boolean;
  error: string | null;
}

let cachedPromise: Promise<ModelIndex> | null = null;

export function invalidateModelIndexCache(): void {
  cachedPromise = null;
}

export function useModelIndex(): ModelIndexState {
  const modelVersion = useGraphStore((s) => s.modelVersion);
  const [state, setState] = useState<ModelIndexState>({
    index: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // На каждое изменение modelVersion сбрасываем кэш
    cachedPromise = null;
    cachedPromise = fetch("/api/model")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });

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
  }, [modelVersion]);

  return state;
}
