import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    require?: any;
    monaco?: any;
  }
}

const MONACO_VERSION = "0.34.0";

export interface PendingFile {
  content: string;
  fqid: string | null;
  ts: number;
}

/**
 * Инициализация Monaco, загрузка контента, переход к FQID.
 * - `enabled` — когда true, начинается загрузка/создание.
 * - `pendingFile` — при изменении, обновляется содержимое редактора.
 */
export function useMonaco(enabled: boolean, pendingFile: PendingFile | null) {
  const editorRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [created, setCreated] = useState(false);
  const loadingRef = useRef(false);

  // @ts-expect-error
  useEffect(() => {
    if (!enabled) return;
    if (ready) return;
    if (window.monaco && window.monaco.editor) {
      setReady(true);
      return;
    }
    if (loadingRef.current) return;
    if (typeof window.require === "undefined") {
      const retry = setTimeout(() => {
        loadingRef.current = false;
        setReady((v) => v);
      }, 300);
      return () => clearTimeout(retry);
    }

    loadingRef.current = true;
    window.require.config({
      paths: {
        vs: `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min/vs`,
      },
    });
    window.require(
      ["vs/editor/editor.main"],
      () => {
        if (window.monaco && window.monaco.editor) setReady(true);
        else loadingRef.current = false;
      },
      (err: any) => {
        console.error("[monaco] load error:", err);
        loadingRef.current = false;
      },
    );
  }, [enabled, ready]);

  useEffect(() => {
    if (!enabled) return;
    if (!ready) return;
    if (editorRef.current) return;
    if (!window.monaco || !window.monaco.editor) return;

    const el = document.getElementById("monaco-container");
    if (!el) return;

    try {
      editorRef.current = window.monaco.editor.create(el, {
        value: "",
        language: "yaml",
        theme: "vs-dark",
        readOnly: true,
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: "JetBrains Mono, SF Mono, Monaco, monospace",
      });
      setCreated(true);
    } catch (e) {
      console.error("[monaco] create failed:", e);
    }
  }, [enabled, ready]);

  useEffect(() => {
    if (!pendingFile) return;
    if (!created) return;
    if (!editorRef.current) return;

    editorRef.current.setValue(pendingFile.content);

    if (pendingFile.fqid) {
      setTimeout(() => {
        const ed = editorRef.current;
        if (!ed) return;
        const lines = pendingFile.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].indexOf(pendingFile.fqid!) !== -1) {
            ed.revealLineInCenter(i + 1);
            ed.setSelection({
              startLineNumber: i + 1,
              startColumn: 1,
              endLineNumber: i + 1,
              endColumn: lines[i].length + 1,
            });
            break;
          }
        }
      }, 150);
    }
  }, [pendingFile, created]);

  useEffect(() => {
    if (enabled) return;
    if (editorRef.current) {
      try {
        editorRef.current.dispose();
      } catch {}
      editorRef.current = null;
      setCreated(false);
    }
  }, [enabled]);

  const setValue = useCallback((content: string) => {
    if (editorRef.current) editorRef.current.setValue(content);
  }, []);

  return { editorRef, ready, created, setValue };
}
