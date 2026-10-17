import { useEffect, useState } from "react";
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

let cachedPromise: Promise<ApiResponse> | null = null;

export function useModelDiff(): ModelDiffState {
  const [state, setState] = useState<ModelDiffState>({
    diff: null,
    hasSnapshot: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!cachedPromise) {
      cachedPromise = fetch("/api/model/diff")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<ApiResponse>;
        })
        .catch((err) => {
          cachedPromise = null;
          throw err;
        });
    }
    let cancelled = false;
    cachedPromise
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
  }, []);

  return state;
}

export function invalidateModelDiffCache(): void {
  cachedPromise = null;
}
