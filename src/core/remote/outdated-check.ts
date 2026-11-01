import fs from "fs";
import path from "path";
import { withTokenRefresh } from "./auth";
import { apiFetchExpertises } from "./schemas-loader";
import type { RemoteCredentials } from "../../shared/types";

export interface OutdatedDomain {
  domainId: string;
  cachedUpdatedAt: string | null;
  serverUpdatedAt: string | null;
  cachedVersion: string | null;
  serverVersion: string | null;
}

export interface OutdatedCheckResult {
  checkedAt: string;
  domains: OutdatedDomain[];
  error?: string;
}

/**
 * Сравнивает актуальные метаданные доменов на сервере с тем, что
 * сохранено в `_index.json` кэша. Возвращает ТОЛЬКО те домены, у которых:
 *   - server.updatedAt > cached.updatedAt, ИЛИ
 *   - server.version !== cached.version
 *
 * Тянет только метаданные (`apiFetchExpertises`), без sourceCode —
 * запрос быстрый даже на сотнях доменов.
 */
export async function checkOutdatedDomains(
  cacheDir: string,
  credentials: RemoteCredentials,
): Promise<OutdatedCheckResult> {
  const idxPath = path.join(cacheDir, "_index.json");
  if (!fs.existsSync(idxPath)) {
    return {
      checkedAt: new Date().toISOString(),
      domains: [],
      error: "_index.json не найден",
    };
  }

  let idx: any;
  try {
    idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
  } catch (e: any) {
    return {
      checkedAt: new Date().toISOString(),
      domains: [],
      error: "Не удалось прочитать _index.json: " + e.message,
    };
  }

  const rootFolderId = idx.rootFolderId;
  if (!rootFolderId) {
    return {
      checkedAt: new Date().toISOString(),
      domains: [],
      error: "rootFolderId не найден в _index.json",
    };
  }

  const cached = new Map<
    string,
    { updatedAt: string | null; version: string | null }
  >();
  for (const d of idx.domains || []) {
    if (!d.sourceId) continue;
    cached.set(String(d.sourceId).toLowerCase(), {
      updatedAt: d.updatedAt || null,
      version: d.version || null,
    });
  }

  let remote;
  try {
    remote = await withTokenRefresh(credentials, (t) =>
      apiFetchExpertises(
        credentials.apiUrl,
        t,
        credentials.tenantId,
        rootFolderId,
        credentials.secure,
      ),
    );
  } catch (e: any) {
    return {
      checkedAt: new Date().toISOString(),
      domains: [],
      error: e?.message || String(e),
    };
  }

  const outdated: OutdatedDomain[] = [];
  for (const d of remote) {
    if (d.status !== "ENABLED" || d.type !== "DOMAIN") continue;
    const c = cached.get(String(d.sourceId).toLowerCase());
    if (!c) continue;

    const cachedTs = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
    const serverTs = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;

    const tsNewer = serverTs > cachedTs;
    const versionDiffers =
      !!d.version && !!c.version && d.version !== c.version;

    if (tsNewer || versionDiffers) {
      outdated.push({
        domainId: d.sourceId,
        cachedUpdatedAt: c.updatedAt,
        serverUpdatedAt: d.updatedAt,
        cachedVersion: c.version,
        serverVersion: d.version,
      });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    domains: outdated,
  };
}
