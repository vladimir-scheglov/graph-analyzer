import { useCallback, useEffect, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";

export interface GenerateOptions {
  includeBulk?: boolean;
  includePage?: boolean;
  includeLinkageWidgets?: boolean;
  skipExisting?: boolean;
  excludeReadonlyFromCreate?: boolean;
  menuRootId?: string;
  skipManuallyModified?: boolean;
  replaceModified?: boolean;
  restoreOrphanedIds?: string[];
  treeType?: "ordinary" | "orderable" | "multiparent";
  treeVariant?: "merged" | "splitted";
  treeLinkageIds?: string[];
  treeChunkSize?: number;
  treeOrdering?: boolean;
}

export interface UseGenerateSchemaParams {
  domainId: string | null;
  entityId: string | null;
  profile: string;
  options: GenerateOptions;
  enabled: boolean;
}

interface State {
  result: any | null;
  loading: boolean;
  error: string | null;
}

export function useGenerateSchema({
  domainId,
  entityId,
  profile,
  options,
  enabled,
}: UseGenerateSchemaParams): State & { reload: () => void } {
  const modelVersion = useGraphStore((s) => s.modelVersion);
  const [state, setState] = useState<State>({
    result: null,
    loading: false,
    error: null,
  });
  const [tick, setTick] = useState(0);

  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    if (!enabled || !domainId || !entityId) return;
    let cancelled = false;
    setState({ result: null, loading: true, error: null });

    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId, entityId, profile, options }),
    })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok)
          setState({
            result: null,
            loading: false,
            error: data?.error || `HTTP ${ok}`,
          });
        else setState({ result: data, loading: false, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setState({ result: null, loading: false, error: e.message });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, domainId, entityId, profile, optionsKey, modelVersion, tick]);

  const reload = useCallback(() => setTick((v) => v + 1), []);
  return { ...state, reload };
}
