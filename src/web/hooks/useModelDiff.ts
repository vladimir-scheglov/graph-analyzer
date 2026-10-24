import { useEffect, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { SemanticDiff } from "../../shared/model-types";

interface ModelDiffState {
  diff: SemanticDiff | null;
  hasSnapshot: boolean;
  loading: boolean;
  error: string | null;
}

interface ApiResponse {
  diff: SemanticDiff | null;
  hasSnapshot: boolean;
}

interface CachedEntry {
  version: number;
  promise: Promise<ApiResponse>;
}

let cache: CachedEntry | null = null;

export function invalidateModelDiffCache(): void {
  cache = null;
}

export function useModelDiff(): ModelDiffState {
  const modelVersion = useGraphStore((s) => s.modelVersion);
  const [state, setState] = useState<ModelDiffState>({
    diff: null,
    hasSnapshot: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    // Кэш по версии — несколько модалок с одинаковым modelVersion
    // используют один fetch. После bumpModelVersion — новый запрос.
    if (!cache || cache.version !== modelVersion) {
      const promise = fetch("/api/model/diff").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      });

      // Не сносим свежий кэш race'ом от предыдущего rejected-promise.
      promise.catch(() => {
        if (cache && cache.promise === promise) cache = null;
      });

      cache = { version: modelVersion, promise };
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    cache.promise
      .then((data) => {
        if (cancelled) return;
        setState({
          diff: data.diff || null,
          hasSnapshot: !!data.hasSnapshot,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          diff: null,
          hasSnapshot: false,
          loading: false,
          error: err.message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [modelVersion]);

  return state;
}
