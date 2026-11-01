import type { IncomingMessage, ServerResponse } from "http";
import { checkOutdatedDomains } from "../../core/remote/outdated-check";
import type { OutdatedCheckResult } from "../../core/remote/outdated-check";
import { ServerState } from "../../server/state";

const CACHE_TTL_MS = 60_000;

let lastCheck: { at: number; result: OutdatedCheckResult } | null = null;

export function invalidateOutdatedCache(): void {
  lastCheck = null;
}

export async function handleCheckOutdated(
  req: IncomingMessage,
  res: ServerResponse,
  state: ServerState,
): Promise<void> {
  if (
    state.mode !== "remote" ||
    !state.credentials ||
    !state.remoteInfo?.server ||
    !state.remoteInfo.cacheDir
  ) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "Проверка обновлений доступна только в режиме --server " +
          "(нужны креды)",
      }),
    );
    return;
  }

  const url = new URL(req.url!, "http://localhost");
  const force = url.searchParams.get("force") === "1";

  // 60-секундный кэш — UI может дёргать «Проверить» несколько раз,
  // не спамя сервер.
  if (!force && lastCheck && Date.now() - lastCheck.at < CACHE_TTL_MS) {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(JSON.stringify(lastCheck.result));
    return;
  }

  try {
    const result = await checkOutdatedDomains(
      state.remoteInfo.cacheDir,
      state.credentials,
    );
    lastCheck = { at: Date.now(), result };

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(JSON.stringify(result));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e?.message || String(e) }));
  }
}
