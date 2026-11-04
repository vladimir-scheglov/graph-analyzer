import { useCallback, useEffect, useRef, useState } from "react";
import type { YamlSearchHit } from "../../server/routes/yaml-search";

export interface FulltextSearchState {
  hits: YamlSearchHit[];
  loading: boolean;
  error: string | null;
  total: number;
  truncated: boolean;
  elapsedMs: number;
}

const EMPTY: FulltextSearchState = {
  hits: [],
  loading: false,
  error: null,
  total: 0,
  truncated: false,
  elapsedMs: 0,
};

export interface FulltextSearchOptions {
  regex: boolean;
  caseSensitive: boolean;
  includeComments: boolean;
  domain: string;
}

export function useYamlFulltextSearch() {
  const [state, setState] = useState<FulltextSearchState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (query: string, opts: FulltextSearchOptions) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!query.trim()) {
        setState(EMPTY);
        return;
      }

      setState((s) => ({ ...s, loading: true, error: null }));

      const params = new URLSearchParams({ q: query });
      if (opts.regex) params.set("regex", "1");
      if (opts.caseSensitive) params.set("case", "1");
      if (opts.includeComments) params.set("comments", "1");
      if (opts.domain) params.set("domain", opts.domain);

      try {
        const r = await fetch(`/api/yaml-search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${r.status}`);
        }
        const data = await r.json();
        setState({
          hits: data.hits || [],
          loading: false,
          error: data.error || null,
          total: data.totalHits || 0,
          truncated: !!data.truncated,
          elapsedMs: data.elapsedMs || 0,
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setState({
          hits: [],
          loading: false,
          error: e?.message || String(e),
          total: 0,
          truncated: false,
          elapsedMs: 0,
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  return { ...state, search };
}
