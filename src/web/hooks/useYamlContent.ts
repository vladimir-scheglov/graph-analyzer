import { useEffect, useState } from "react";

interface YamlContentState {
  content: string;
  loading: boolean;
  error: string | null;
  /** true, если запрос был fresh (к серверу), а не из локального кэша. */
  fresh: boolean;
}

export function useYamlContent(
  filePath: string | null,
  reloadKey: number = 0,
  fresh: boolean = false,
): YamlContentState {
  const [state, setState] = useState<YamlContentState>({
    content: "",
    loading: !!filePath,
    error: null,
    fresh,
  });

  useEffect(() => {
    if (!filePath) {
      setState({ content: "", loading: false, error: null, fresh });
      return;
    }
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      fresh,
    }));
    let cancelled = false;

    const endpoint = fresh ? "/file/fresh" : "/file";
    const url = endpoint + "?path=" + encodeURIComponent(filePath);

    console.log(`[useYamlContent] fetch ${url}`);

    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          // Сервер мог вернуть JSON с деталями ошибки
          const contentType = r.headers.get("Content-Type") || "";
          if (contentType.includes("application/json")) {
            try {
              const j = await r.json();
              if (j?.error) throw new Error(j.error);
            } catch {
              /* fallthrough */
            }
          }
          throw new Error(`HTTP ${r.status}`);
        }
        return r.text();
      })
      .then((text) => {
        if (!cancelled)
          setState({ content: text, loading: false, error: null, fresh });
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            content: "",
            loading: false,
            error: err.message,
            fresh,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, reloadKey, fresh]);

  return state;
}

export function invalidateYamlCache(_filePath?: string): void {
  // No-op — кэш убран, каждый fetch идёт на сервер
}
