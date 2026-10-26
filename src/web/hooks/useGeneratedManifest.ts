// src/web/hooks/useGeneratedManifest.ts
import { useEffect, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { ManifestDomainView } from "../../shared/manifest-types";

export interface UseGeneratedManifestResult {
  data: ManifestDomainView | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useGeneratedManifest(
  domainId: string | null,
  open: boolean,
): UseGeneratedManifestResult {
  const modelVersion = useGraphStore((s) => s.modelVersion);
  const [state, setState] = useState<{
    data: ManifestDomainView | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: false, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open || !domainId) return;
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    fetch(`/api/generated-manifest?domainId=${encodeURIComponent(domainId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ManifestDomainView) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((e: any) => {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: e?.message || String(e),
          });
      });

    return () => {
      cancelled = true;
    };
  }, [open, domainId, modelVersion, tick]);

  return { ...state, reload: () => setTick((v) => v + 1) };
}
