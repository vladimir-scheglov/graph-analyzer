import { useEffect, useState } from "react";

interface YamlContentState {
  content: string;
  loading: boolean;
  error: string | null;
}

export function useYamlContent(
  filePath: string | null,
  reloadKey: number = 0,
): YamlContentState {
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
    setState((prev) => ({ ...prev, loading: true, error: null }));
    let cancelled = false;
    fetch("/file?path=" + encodeURIComponent(filePath))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
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
  }, [filePath, reloadKey]);

  return state;
}

export function invalidateYamlCache(_filePath?: string): void {
  // No-op — кэш убран, каждый fetch идёт на сервер
}
