import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { RemoteInfo } from "../../shared/types";
import { sanitizeFileName } from "../utils/file-utils";
import { writeProgress, endProgress, makeProgressBar } from "../utils/logger";
import { apiLogin, withTokenRefresh } from "./auth";
import {
  apiFetchFolders,
  apiFetchExpertises,
  apiFetchExpertiseSource,
} from "./schemas-loader";
import type { RemoteFolder } from "../../shared/types";

export interface RemoteCacheOptions {
  refresh?: boolean;
  resetCache?: boolean;
  secure?: boolean;
}

export function getCachePath(baseDir: string, serverUrl: string): string {
  const u = new URL(serverUrl);
  const hash = crypto
    .createHash("sha1")
    .update(serverUrl)
    .digest("hex")
    .slice(0, 8);
  return path.join(baseDir, ".cache", "domains", `${u.hostname}__${hash}`);
}

export function checkRemoteCacheExists(serverUrl: string): string | null {
  // БЫЛО: path.join(__dirname, "..", "..", "..") — dist/ или src/, зависит от сборки
  const cacheDir = getCachePath(process.cwd(), serverUrl);
  const completeFlag = path.join(cacheDir, ".complete");
  return fs.existsSync(completeFlag) ? cacheDir : null;
}

function buildFolderPaths(folders: RemoteFolder[]): Map<string, string[]> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const cache = new Map<string, string[]>();

  function getPath(id: string): string[] {
    if (cache.has(id)) return cache.get(id)!;
    const folder = byId.get(id);
    if (!folder) {
      cache.set(id, []);
      return [];
    }
    if (folder.parentFolderId == null) {
      cache.set(id, []);
      return [];
    }
    const parentPath = getPath(folder.parentFolderId);
    const result = parentPath.concat([sanitizeFileName(folder.name)]);
    cache.set(id, result);
    return result;
  }

  for (const f of folders) getPath(f.id);
  return cache;
}

export interface PrepareRemoteCacheParams {
  serverUrl: string;
  username: string;
  password: string;
  baseDir: string;
  opts?: RemoteCacheOptions;
}

export async function prepareRemoteCache(
  params: PrepareRemoteCacheParams,
): Promise<RemoteInfo> {
  const { serverUrl, username, password, baseDir } = params;
  const opts = params.opts || {};
  const cacheDir = getCachePath(baseDir, serverUrl);
  const completeFlag = path.join(cacheDir, ".complete");
  const currentIndexPath = path.join(cacheDir, "_index.json");
  const previousIndexPath = path.join(cacheDir, "_index_previous.json");

  if (fs.existsSync(currentIndexPath)) {
    try {
      fs.copyFileSync(currentIndexPath, previousIndexPath);
      console.log("📸 Сохранён предыдущий снимок перед refresh");
    } catch {
      /* ignore */
    }
  }

  if (opts.resetCache && fs.existsSync(cacheDir)) {
    console.log("🗑  Удаление кэша: " + cacheDir);
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }

  const cacheValid = fs.existsSync(completeFlag);
  if (cacheValid && !opts.refresh) {
    console.log("📦 Используется кэш: " + cacheDir);
    console.log("   (обновить: --refresh, сбросить: --reset-cache)");
    let fetchedAt: string | null = null;
    try {
      const idx = JSON.parse(fs.readFileSync(currentIndexPath, "utf8"));
      fetchedAt = idx.fetchedAt || null;
    } catch {
      /* ignore */
    }
    return { cacheDir, fromCache: true, server: serverUrl, fetchedAt };
  }

  const base = serverUrl.replace(/\/+$/, "");
  const loginUrl = base + "/api/evo/core/bff/graphql";
  const apiUrl = base + "/api/graphql";
  const tenantId = "00000000-0000-0000-0000-000000000000";
  // --secure → проверять сертификат (rejectUnauthorized=true)
  // без --secure (default) → не проверять (rejectUnauthorized=false)
  const rejectUnauthorized = !!opts.secure;

  writeProgress(`🔐 Логин ${username}...`);
  let token: string;
  try {
    token = await apiLogin(loginUrl, username, password, rejectUnauthorized);
  } catch (err: any) {
    endProgress();
    throw new Error("Логин: " + err.message);
  }
  endProgress();
  console.log(`🔐 Логин: ✅ (${username})`);

  const refreshCreds = {
    token: token as string | null,
    loginUrl,
    username,
    password,
    secure: rejectUnauthorized,
  };

  writeProgress("📁 Загрузка структуры папок...");
  let folders: RemoteFolder[];
  try {
    folders = await withTokenRefresh(refreshCreds, (t) =>
      apiFetchFolders(apiUrl, t, tenantId, rejectUnauthorized),
    );
  } catch (err: any) {
    endProgress();
    throw new Error("Папки: " + err.message);
  }
  endProgress();
  console.log(`📁 Структура папок: ✅ (${folders.length})`);

  const rootFolder = folders.find((f) => f.parentFolderId == null);
  if (!rootFolder) throw new Error("Корневая папка не найдена");

  writeProgress("📄 Загрузка списка доменов...");
  let domains;
  try {
    domains = await withTokenRefresh(refreshCreds, (t) =>
      apiFetchExpertises(
        apiUrl,
        t,
        tenantId,
        rootFolder.id,
        rejectUnauthorized,
      ),
    );
  } catch (err: any) {
    endProgress();
    throw new Error("Домены: " + err.message);
  }
  endProgress();

  // Синхронизируем локальный token — он мог обновиться при перелогине
  token = refreshCreds.token as string;

  const enabledDomains = domains.filter(
    (d) => d.status === "ENABLED" && d.type === "DOMAIN",
  );
  console.log(
    `📄 Домены: ✅ всего ${domains.length}, ENABLED ${enabledDomains.length}`,
  );

  if (fs.existsSync(cacheDir))
    fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  fs.writeFileSync(
    currentIndexPath,
    JSON.stringify(
      {
        server: serverUrl,
        fetchedAt: new Date().toISOString(),
        rootFolderId: rootFolder.id,
        folders,
        domains: domains.map((d) => ({
          id: d.id,
          sourceId: d.sourceId,
          folderId: d.folderId,
          type: d.type,
          name: d.name,
          status: d.status,
          version: d.version,
          description: d.description,
          author: d.author,
          tags: d.tags || [],
          createdAt: d.createdAt || null,
          updatedAt: d.updatedAt || null,
          objectType: d.objectType || null,
          updater: d.updater
            ? { displayName: d.updater.displayName, id: d.updater.id }
            : null,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  const folderPaths = buildFolderPaths(folders);
  const errors: Array<{ id: string; sourceId: string; error: string }> = [];
  let saved = 0;
  const total = enabledDomains.length;

  for (let i = 0; i < total; i++) {
    const d = enabledDomains[i];
    const shortName = (d.sourceId || d.id).slice(0, 40);
    writeProgress(
      `💾 Скачивание схем ${makeProgressBar(i + 1, total)} — ${shortName}`,
    );
    try {
      const sourceCode = await withTokenRefresh(refreshCreds, (t) =>
        apiFetchExpertiseSource(apiUrl, t, tenantId, d.id, rejectUnauthorized),
      );
      if (!sourceCode || typeof sourceCode !== "string") {
        errors.push({
          id: d.id,
          sourceId: d.sourceId,
          error: "Пустой sourceCode",
        });
        continue;
      }
      const folderPath = folderPaths.get(d.folderId) || [];
      const fullDir = path.join(cacheDir, ...folderPath);
      fs.mkdirSync(fullDir, { recursive: true });
      const fileName = sanitizeFileName(d.sourceId) + ".ro";
      fs.writeFileSync(path.join(fullDir, fileName), sourceCode, "utf8");
      saved++;
    } catch (err: any) {
      errors.push({ id: d.id, sourceId: d.sourceId, error: err.message });
    }
  }
  endProgress();
  token = refreshCreds.token as string;

  if (errors.length > 0) {
    fs.writeFileSync(
      path.join(cacheDir, "_errors.json"),
      JSON.stringify(errors, null, 2),
      "utf8",
    );
  }

  fs.writeFileSync(completeFlag, new Date().toISOString(), "utf8");

  console.log(`💾 Сохранено: ${saved}/${total}`);
  if (errors.length > 0)
    console.log(
      `⚠️  Ошибок: ${errors.length} → ${path.join(cacheDir, "_errors.json")}`,
    );
  console.log("📂 Кэш: " + cacheDir);

  return {
    cacheDir,
    fromCache: false,
    server: serverUrl,
    fetchedAt: new Date().toISOString(),
  };
}
