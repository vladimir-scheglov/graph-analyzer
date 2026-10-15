import { useCallback, useEffect, useRef, useState } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { ValidationRecord, ValidationStats } from "../lib/types";

export interface UseValidationResult {
  open: boolean;
  setOpen: (v: boolean) => void;
  running: boolean;
  started: boolean;
  progress: { current: number; total: number };
  logs: ValidationRecord[];
  stats: ValidationStats | null;
  cancelled: boolean;
  available: boolean;
  start: (scope: "all" | "visible" | "bookmarked", domainIds: string[]) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Клиент SSE-валидации доменов.
 * - Открывает поток /api/validate-stream.
 * - Слушает события start/progress/done.
 * - Сохраняет результаты в store.
 */
export function useValidation(): UseValidationResult {
  const setValidationResults = useGraphStore((s) => s.setValidationResults);
  const available = useGraphStore((s) => s.validationAvailable);

  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<ValidationRecord[]>([]);
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Проверка доступности валидации при монтировании
  useEffect(() => {
    fetch("/api/validation-available")
      .then((r) => r.json())
      .then((d) =>
        useGraphStore.getState().setValidationAvailable(!!d.available),
      )
      .catch(() => {});
  }, []);

  // Загрузить сохранённые результаты с сервера
  useEffect(() => {
    fetch("/api/validation-results")
      .then((r) => (r.status === 204 ? null : r.json()))
      .then((data) => {
        if (!data || !data.results) return;
        const map = new Map<string, ValidationRecord>();
        data.results.forEach((r: ValidationRecord) => map.set(r.domainId, r));
        setValidationResults(map);
      })
      .catch(() => {});
  }, [setValidationResults]);

  const stop = useCallback(() => {
    fetch("/api/validate-cancel", { method: "POST" }).catch(() => {});
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
    }
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    setStarted(false);
    setRunning(false);
    setLogs([]);
    setProgress({ current: 0, total: 0 });
    setStats(null);
    setCancelled(false);
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
      abortRef.current = null;
    }
  }, []);

  const start = useCallback(
    (scope: "all" | "visible" | "bookmarked", domainIds: string[]) => {
      if (domainIds.length === 0) {
        alert("Нет доменов в выбранной области");
        return;
      }

      setRunning(true);
      setStarted(true);
      setLogs([]);
      setStats(null);
      setCancelled(false);
      setProgress({ current: 0, total: domainIds.length });

      const controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/validate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainIds }),
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("HTTP " + response.status);
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          const handleEvent = (evt: any) => {
            if (evt.type === "start") {
              setProgress({ current: 0, total: evt.total });
            } else if (evt.type === "progress") {
              setProgress({ current: evt.current, total: evt.total });
              setLogs((prev) => prev.concat([evt]));
            } else if (evt.type === "done") {
              setStats(evt.stats);
              setCancelled(evt.cancelled);
              setRunning(false);
              const map = new Map<string, ValidationRecord>();
              (evt.results || []).forEach((r: ValidationRecord) =>
                map.set(r.domainId, r),
              );
              setValidationResults(map);
            } else if (evt.type === "error") {
              setRunning(false);
              alert("Ошибка: " + evt.message);
            }
          };

          const read = (): Promise<void> =>
            reader.read().then((r) => {
              if (r.done) return;
              buffer += decoder.decode(r.value, { stream: true });
              const parts = buffer.split("\n\n");
              buffer = parts.pop() || "";
              parts.forEach((part) => {
                const line = part.trim();
                if (!line.startsWith("data:")) return;
                const json = line.slice(5).trim();
                try {
                  handleEvent(JSON.parse(json));
                } catch {}
              });
              return read();
            });

          return read();
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setRunning(false);
          alert("Ошибка: " + err.message);
        });
    },
    [setValidationResults],
  );

  return {
    open,
    setOpen,
    running,
    started,
    progress,
    logs,
    stats,
    cancelled,
    available,
    start,
    stop,
    reset,
  };
}
