import { useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { useModelIndex } from "./useModelIndex";
import { executeSearch } from "../lib/search/executor";
import type { SearchOutcome } from "../lib/search/types";

const SEARCH_DEBOUNCE_MS = 120;

export function useSearch(): SearchOutcome {
  const nodes = useGraphStore((s) => s.nodes);
  const rawQuery = useGraphStore((s) => s.searchQuery);
  const { index, loading, error } = useModelIndex();

  // Debounce: быстрые нажатия не запускают executeSearch на каждый keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState(rawQuery);
  useEffect(() => {
    if (rawQuery.trim() === "") {
      setDebouncedQuery("");
      return;
    }
    const t = setTimeout(() => setDebouncedQuery(rawQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rawQuery]);

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

    if (!debouncedQuery.trim() || !index) {
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
      return executeSearch(debouncedQuery, index, nodes, 200);
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
  }, [debouncedQuery, index, nodes, loading]);
}
