import { useCallback, useEffect, useRef, useState } from "react";
import type { OutdatedDomain } from "../../core/remote/outdated-check";

interface State {
  outdated: Map<string, OutdatedDomain>;
  checking: boolean;
  error: string | null;
  lastCheckedAt: string | null;
  available: boolean;
}

const CLIENT_TTL_MS = 5 * 60_000; // 5 минут — не чаще

export function useOutdatedDomains(remoteInfo: any) {
  const [state, setState] = useState<State>({
    outdated: new Map(),
    checking: false,
    error: null,
    lastCheckedAt: null,
    available: !!remoteInfo?.server,
  });

  // Защита от параллельных вызовов
  const inflightRef = useRef<Promise<void> | null>(null);

  const check = useCallback(
    async (force = false): Promise<void> => {
      if (!remoteInfo?.server) return;

      if (!force) {
        const last = state.lastCheckedAt;
        if (last) {
          const age = Date.now() - new Date(last).getTime();
          if (age < CLIENT_TTL_MS) return;
        }
      }

      if (inflightRef.current) {
        return inflightRef.current;
      }

      setState((s) => ({ ...s, checking: true, error: null }));

      const promise = (async () => {
        try {
          const res = await fetch(
            `/api/check-outdated${force ? "?force=1" : ""}`,
          );

          // Читаем тело один раз — .json() и .text() взаимоисключающие.
          const text = await res.text();
          let data: any = {};
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              // Не JSON — оставляем как есть, покажем `text` в ошибке
            }
          }

          if (!res.ok) {
            const msg =
              (data && typeof data.error === "string" && data.error) ||
              (text ? text.slice(0, 200) : `HTTP ${res.status}`);
            throw new Error(msg);
          }

          const map = new Map<string, OutdatedDomain>();
          for (const d of (data.domains as any[]) || []) {
            map.set(String(d.domainId).toLowerCase(), d as OutdatedDomain);
          }
          setState({
            outdated: map,
            checking: false,
            error:
              typeof data.error === "string" && data.error ? data.error : null,
            lastCheckedAt: data.checkedAt || new Date().toISOString(),
            available: true,
          });
        } catch (e: any) {
          setState((s) => ({
            ...s,
            checking: false,
            error: e?.message || String(e),
          }));
        } finally {
          inflightRef.current = null;
        }
      })();

      inflightRef.current = promise;
      return promise;
    },
    [remoteInfo?.server, state.lastCheckedAt],
  );

  // Проверка при первом монтировании (например, при открытии модалки)
  useEffect(() => {
    if (!state.available) return;
    if (state.lastCheckedAt) return;
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.available]);

  return { ...state, check };
}
