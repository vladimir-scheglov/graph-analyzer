import { useEffect, useState } from "react";

interface YamlContentState {
  content: string;
  loading: boolean;
  error: string | null;
}

const cache = new Map<string, string>();

export function useYamlContent(filePath: string | null): YamlContentState {
  const [state, setState] = useState<YamlContentState>({
    content: "",
    loading: !!filePath,
    error: null,
  });

  useEffect(() => {
    if (!filePath) {
      setState({ content: "", loading: false, error: null });
      return;
    }
    if (cache.has(filePath)) {
      setState({ content: cache.get(filePath)!, loading: false, error: null });
      return;
    }
    setState({ content: "", loading: true, error: null });
    let cancelled = false;
    fetch("/file?path=" + encodeURIComponent(filePath))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        cache.set(filePath, text);
        if (!cancelled)
          setState({ content: text, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ content: "", loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return state;
}

export function invalidateYamlCache(filePath?: string): void {
  if (filePath) cache.delete(filePath);
  else cache.clear();
}
