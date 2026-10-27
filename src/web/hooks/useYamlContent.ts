import { useEffect, useState } from "react";

export type YamlContentSource = "draft" | "published" | "local";

export interface YamlExpertiseMeta {
  publishedVersion: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface YamlContentState {
  content: string;
  loading: boolean;
  error: string | null;
  fresh: boolean;
  contentSource: YamlContentSource | null;
  meta: YamlExpertiseMeta | null;
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
    contentSource: null,
    meta: null,
  });

  useEffect(() => {
    if (!filePath) {
      setState({
        content: "",
        loading: false,
        error: null,
        fresh,
        contentSource: null,
        meta: null,
      });
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

    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
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

        const header = r.headers.get("X-Content-Source");
        const contentSource: YamlContentSource | null =
          header === "draft" || header === "published" || header === "local"
            ? header
            : null;

        const versionHeader = r.headers.get("X-Published-Version");
        const updatedAtHeader = r.headers.get("X-Updated-At");
        const updatedByHeader = r.headers.get("X-Updated-By");

        let updatedBy: string | null = null;
        if (updatedByHeader) {
          try {
            updatedBy = decodeURIComponent(updatedByHeader);
          } catch {
            updatedBy = updatedByHeader;
          }
        }

        const meta: YamlExpertiseMeta | null =
          versionHeader || updatedAtHeader || updatedBy
            ? {
                publishedVersion: versionHeader || "",
                updatedAt: updatedAtHeader || null,
                updatedBy,
              }
            : null;

        const text = await r.text();
        return { text, contentSource, meta };
      })
      .then(({ text, contentSource, meta }) => {
        if (!cancelled) {
          setState({
            content: text,
            loading: false,
            error: null,
            fresh,
            contentSource,
            meta,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            content: "",
            loading: false,
            error: err.message,
            fresh,
            contentSource: null,
            meta: null,
          });
        }
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
