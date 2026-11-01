import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { useModelIndex } from "./useModelIndex";
import { executeSearch } from "../lib/search/executor";
import type { SearchOutcome } from "../lib/search/types";

export function useSearch(): SearchOutcome {
  const nodes = useGraphStore((s) => s.nodes);
  const query = useGraphStore((s) => s.searchQuery);
  const { index, loading, error } = useModelIndex();

  return useMemo(() => {
    if (loading) {
      return {
        results: [],
        total: 0,
        truncated: false,
        error: null,
        parsed: { plainTokens: [], filters: [] },
        ready: false,
      };
    }

    if (!query.trim() || !index) {
      return {
        results: [],
        total: 0,
        truncated: false,
        error: null,
        parsed: { plainTokens: [], filters: [] },
        ready: true,
      };
    }
    try {
      return executeSearch(query, index, nodes, 200);
    } catch (e: any) {
      return {
        results: [],
        total: 0,
        truncated: false,
        error: e?.message || String(e),
        parsed: { plainTokens: [], filters: [] },
        ready: true,
      };
    }
  }, [query, index, nodes, loading]);
}
