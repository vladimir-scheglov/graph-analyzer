import { useCallback, useEffect, useRef, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";

export interface GenerateBatchOptions {
  includeBulk?: boolean;
  includePage?: boolean;
  includeLinkageWidgets?: boolean;
  skipExisting?: boolean;
  excludeReadonlyFromCreate?: boolean;
  replaceModified?: boolean;
  treeType?: "ordinary" | "orderable" | "multiparent";
  treeVariant?: "merged" | "splitted";
  treeLinkageIds?: string[];
  treeChunkSize?: number;
  treeOrdering?: boolean;
}

export interface GenerateBatchProgress {
  phase:
    | "start"
    | "entity-start"
    | "entity-done"
    | "entity-error"
    | "preflight"
    | "done";
  entityId?: string;
  current: number;
  total: number;
  blocksCount?: number;
  error?: string;
}

export interface UseGenerateSchemaBatchParams {
  domainId: string | null;
  profile: string;
  options: GenerateBatchOptions;
  entityIds?: string[];
  enabled: boolean;
}

interface State {
  result: any | null;
  loading: boolean;
  error: string | null;
  progress: GenerateBatchProgress | null;
}

export function useGenerateSchemaBatch({
  domainId,
  profile,
  options,
  entityIds,
  enabled,
}: UseGenerateSchemaBatchParams): State & {
  reload: () => void;
  cancel: () => void;
} {
  const modelVersion = useGraphStore((s) => s.modelVersion);
  const [state, setState] = useState<State>({
    result: null,
    loading: false,
    error: null,
    progress: null,
  });
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const optionsKey = JSON.stringify(options);
  const entityIdsKey = JSON.stringify(entityIds ?? []);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
      abortRef.current = null;
    }
    setState((s) => ({ ...s, loading: false, progress: null }));
  }, []);

  useEffect(() => {
    if (!enabled || !domainId) return;
    let cancelled = false;

    const controller = new AbortController();
    abortRef.current = controller;

    setState({ result: null, loading: true, error: null, progress: null });

    const t = setTimeout(async () => {
      try {
        const response = await fetch("/api/generate-batch-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainId, profile, options, entityIds }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (evt: any) => {
          if (evt.type === "progress") {
            setState((s) => ({
              ...s,
              progress: {
                phase: evt.phase,
                entityId: evt.entityId,
                current: evt.current,
                total: evt.total,
                blocksCount: evt.blocksCount,
                error: evt.error,
              },
            }));
          } else if (evt.type === "done") {
            setState({
              result: evt.result,
              loading: false,
              error: null,
              progress: null,
            });
          } else if (evt.type === "cancelled") {
            setState((s) => ({ ...s, loading: false, progress: null }));
          } else if (evt.type === "error") {
            setState({
              result: null,
              loading: false,
              error: evt.message,
              progress: null,
            });
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            try {
              handleEvent(JSON.parse(json));
            } catch {
              /* ignore */
            }
          }
        }
      } catch (e: any) {
        if (e?.name === "AbortError" || cancelled) return;
        setState({
          result: null,
          loading: false,
          error: e?.message || String(e),
          progress: null,
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
      if (abortRef.current === controller) {
        try {
          controller.abort();
        } catch {}
        abortRef.current = null;
      }
    };
  }, [
    enabled,
    domainId,
    profile,
    optionsKey,
    entityIdsKey,
    modelVersion,
    tick,
  ]);

  return {
    ...state,
    reload: () => setTick((v) => v + 1),
    cancel,
  };
}
