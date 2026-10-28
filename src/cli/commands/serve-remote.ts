import fs from "fs";
import path from "path";
import type { CliFlags, RemoteCredentials } from "../../shared/types";
import { DomainAnalyzer } from "../../core/analyzer/DomainAnalyzer";
import { startServer } from "../../server/http-server";
import {
  checkRemoteCacheExists,
  prepareRemoteCache,
} from "../../core/remote/cache-manager";
import { error } from "../../core/utils/logger";
import { getCliInvocation } from "../constants";

export interface ServeRemoteParams {
  server: string;
  username?: string;
  password?: string;
  port: number;
  /**
   * true             — обновить всегда;
   * "1d"|"10h"|"30m" — обновить, только если кеш старше TTL;
   * undefined        — использовать кеш, если он есть.
   */
  refresh: boolean | string | undefined;
  resetCache: boolean;
  secure: boolean;
  login?: string;
}

// ============ TTL helpers ============

const DURATION_RE = /^(\d+)([smhd])$/i;

/** "1d" → 86_400_000; "abc" → null. */
function parseDuration(raw: string): number | null {
  const m = raw.match(DURATION_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 0) return null;
  const mult: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * mult[m[2].toLowerCase()];
}

function formatAge(ms: number): string {
  if (ms < 60_000) return "только что";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч назад`;
  const d = Math.floor(h / 24);
  return `${d}д назад`;
}

/** Возвращает true, если кеш нужно обновить. */
function shouldRefresh(
  refreshFlag: boolean | string | undefined,
  cachedDir: string | null,
): boolean {
  // Кеша нет — prepareRemoteCache всё равно скачает.
  if (!cachedDir) return false;

  // --refresh=true / --refresh=false (через =) — трактуем как boolean
  if (refreshFlag === "true") return true;
  if (refreshFlag === "false") return false;

  // --refresh (без значения) — всегда
  if (refreshFlag === true) return true;

  // undefined / false — использовать кеш как есть
  if (typeof refreshFlag !== "string") return false;

  const ttlMs = parseDuration(refreshFlag);
  if (ttlMs === null) {
    error(
      `Некорректный формат --refresh «${refreshFlag}». ` +
        `Ожидается <число><s|m|h|d>, например: 1d, 10h, 30m, 5s.`,
    );
    process.exit(1);
  }

  // _index.json не читается — обновить, чтобы не залипнуть на битом кеше
  let fetchedAt: string | null = null;
  try {
    const idx = JSON.parse(
      fs.readFileSync(path.join(cachedDir, "_index.json"), "utf8"),
    );
    fetchedAt = idx.fetchedAt || null;
  } catch {
    return true;
  }
  if (!fetchedAt) return true;

  const age = Date.now() - new Date(fetchedAt).getTime();
  if (!Number.isFinite(age) || age < 0) return true;

  return age >= ttlMs;
}

// ============ Основная функция ============

export async function serveRemote(params: ServeRemoteParams): Promise<void> {
  const {
    server,
    username,
    password,
    port,
    refresh,
    resetCache,
    secure,
    login,
  } = params;

  let rootDir: string;
  let remoteInfo;
  let credentials: RemoteCredentials | null = null;

  // 1. Найти кеш (если не --reset-cache)
  const cachedDir = !resetCache ? checkRemoteCacheExists(server) : null;

  // 2. Решить, надо ли обновлять
  const needRefresh = shouldRefresh(refresh, cachedDir);

  if (cachedDir && !needRefresh) {
    // ============ Ветка «используем кеш» ============
    let fetchedAt: string | null = null;
    try {
      const idx = JSON.parse(
        fs.readFileSync(path.join(cachedDir, "_index.json"), "utf8"),
      );
      fetchedAt = idx.fetchedAt || null;
    } catch {
      /* ignore */
    }

    rootDir = cachedDir;
    remoteInfo = {
      cacheDir: cachedDir,
      fromCache: true,
      server,
      fetchedAt,
      mode: "remote",
    };

    const currentIndex = path.join(cachedDir, "_index.json");
    const previousIndex = path.join(cachedDir, "_index_previous.json");
    if (fs.existsSync(currentIndex) && !fs.existsSync(previousIndex)) {
      try {
        fs.copyFileSync(currentIndex, previousIndex);
        console.log("📸 Создан предыдущий снимок для diff");
      } catch {
        /* ignore */
      }
    }

    const ageText = fetchedAt
      ? formatAge(Date.now() - new Date(fetchedAt).getTime())
      : "?";
    console.log(`📦 Используется кеш: ${cachedDir} (${ageText})`);
    if (typeof refresh === "string") {
      console.log(`   (TTL ${refresh} не истёк — обновление не требуется)`);
    }
    console.log(
      "   (обновить: --refresh или --refresh <1d|10h|…>, сбросить: --reset-cache)",
    );
    if (!username || !password) {
      console.log(
        "💡 Логин/пароль не указаны — валидация доменов будет недоступна",
      );
    }
  } else {
    // ============ Ветка «скачиваем» ============
    if (!username || !password) {
      error("Для сервера " + server + " нет закэшированной версии.");
      console.error("");
      console.error("   Укажите креды, чтобы скачать схемы:");
      console.error(
        `     ${getCliInvocation()} --server ${server} --login <user> --password <pass>`,
      );
      process.exit(1);
    }

    const base = server.replace(/\/+$/, "");
    credentials = {
      server: base,
      loginUrl: base + "/api/evo/core/bff/graphql",
      apiUrl: base + "/api/graphql",
      tenantId: "00000000-0000-0000-0000-000000000000",
      token: null,
      username,
      password,
      secure,
    };

    try {
      remoteInfo = await prepareRemoteCache({
        serverUrl: server,
        username,
        password,
        baseDir: process.cwd(),
        // Сюда попадаем только когда уже решили обновляться —
        // поэтому opts.refresh=true.
        opts: { refresh: true, resetCache, secure },
      });
      rootDir = remoteInfo.cacheDir;
      remoteInfo = { ...remoteInfo, mode: "remote" };
    } catch (err: any) {
      error("Ошибка загрузки: " + err.message);
      process.exit(1);
    }
  }

  // Если кеш есть и есть креды — создаём credentials для валидации
  if (!credentials && username && password) {
    const base = server.replace(/\/+$/, "");
    credentials = {
      server: base,
      loginUrl: base + "/api/evo/core/bff/graphql",
      apiUrl: base + "/api/graphql",
      tenantId: "00000000-0000-0000-0000-000000000000",
      token: null,
      username,
      password,
      secure,
    };
  }

  // Команда refresh для toast — сохраняем тот же режим, что использовал пользователь
  let refreshCommand: string | null = null;
  if (server) {
    const args = [getCliInvocation(), "--server " + server];
    if (login) args.push("--login " + login);
    args.push('--password "***"');
    if (typeof refresh === "string") args.push("--refresh " + refresh);
    else if (refresh === true) args.push("--refresh");
    refreshCommand = args.join(" ");
  }

  console.log("🔍 Analyzing domains in: " + rootDir);
  const analyzer = new DomainAnalyzer(rootDir);
  const graphData = analyzer.analyze();
  (analyzer as any).__graphData = graphData;

  startServer({
    port,
    rootDir,
    analyzer,
    remoteInfo,
    credentials,
    refreshCommand,
    mode: "remote",
  });
}
