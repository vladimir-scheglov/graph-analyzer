import { useCallback, useEffect, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { LintBaselineFile } from "../../shared/lint-baseline-types";

interface State {
  baselines: Record<string, LintBaselineFile>;
  loading: boolean;
  error: string | null;
}

interface CacheEntry {
  modelVersion: number;
  promise: Promise<Record<string, LintBaselineFile>>;
}

let cache: CacheEntry | null = null;

/** Вызывать после take/clear baseline, чтобы следующий useLintBaselines сделал свежий fetch. */
export function invalidateLintBaselinesCache(): void {
  cache = null;
}

export function useLintBaselines() {
  const modelVersion = useGraphStore((s) => s.modelVersion);
  const [state, setState] = useState<State>({
    baselines: {},
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!cache || cache.modelVersion !== modelVersion) {
      const promise = fetch("/api/lint-baseline")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{
            baselines: Record<string, LintBaselineFile>;
          }>;
        })
        .then((d) => d.baselines || {});

      promise.catch(() => {
        if (cache && cache.promise === promise) cache = null;
      });

      cache = { modelVersion, promise };
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    cache.promise
      .then((baselines) => {
        if (!cancelled) setState({ baselines, loading: false, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setState({ baselines: {}, loading: false, error: e.message });
      });

    return () => {
      cancelled = true;
    };
  }, [modelVersion]);

  const takeBaseline = useCallback(async (domainId: string) => {
    const res = await fetch(
      `/api/lint-baseline?domainId=${encodeURIComponent(domainId)}`,
      { method: "POST" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.baseline) throw new Error("Некорректный ответ сервера");

    setState((s) => ({
      ...s,
      baselines: { ...s.baselines, [data.baseline.domainId]: data.baseline },
    }));
    invalidateLintBaselinesCache();
    return data.baseline as LintBaselineFile;
  }, []);

  const takeBaselinesBatch = useCallback(async (domainIds: string[]) => {
    const updates: Record<string, LintBaselineFile> = {};
    for (const domainId of domainIds) {
      try {
        const res = await fetch(
          `/api/lint-baseline?domainId=${encodeURIComponent(domainId)}`,
          { method: "POST" },
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.baseline?.domainId) {
          updates[data.baseline.domainId] = data.baseline;
        }
      } catch {
        /* skip single failure */
      }
    }
    setState((s) => ({
      ...s,
      baselines: { ...s.baselines, ...updates },
    }));
    invalidateLintBaselinesCache();
    return updates;
  }, []);

  const clearBaseline = useCallback(async (domainId: string) => {
    const res = await fetch(
      `/api/lint-baseline?domainId=${encodeURIComponent(domainId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    setState((s) => {
      const next = { ...s.baselines };
      delete next[domainId];
      return { ...s, baselines: next };
    });
    invalidateLintBaselinesCache();
  }, []);

  return {
    ...state,
    takeBaseline,
    takeBaselinesBatch,
    clearBaseline,
  };
}
