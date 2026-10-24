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

export interface ServeRemoteParams {
  server: string;
  username?: string;
  password?: string;
  port: number;
  refresh: boolean;
  resetCache: boolean;
  secure: boolean;
  login?: string;
}

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

  const cachedDir =
    !refresh && !resetCache ? checkRemoteCacheExists(server) : null;

  if (cachedDir) {
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

    console.log("📦 Используется кэш: " + cachedDir);
    console.log(
      "   (обновить: --refresh --login <user> --password <pass>, сбросить: --reset-cache)",
    );
    if (!username || !password) {
      console.log(
        "💡 Логин/пароль не указаны — валидация доменов будет недоступна",
      );
    }
  } else {
    if (!username || !password) {
      error("Для сервера " + server + " нет закэшированной версии.");
      console.error("");
      console.error("   Укажите креды, чтобы скачать схемы:");
      console.error(
        `     node graph-analyzer.js --server ${server} --login <user> --password <pass>`,
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
        opts: { refresh, resetCache, secure },
      });
      rootDir = remoteInfo.cacheDir;
      remoteInfo = { ...remoteInfo, mode: "remote" };
    } catch (err: any) {
      error("Ошибка загрузки: " + err.message);
      process.exit(1);
    }
  }

  // Если кэш есть и есть креды — создаём credentials для валидации
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

  // Формируем команду для refresh
  let refreshCommand: string | null = null;
  if (server) {
    const args = ["node graph-analyzer.js", "--server " + server];
    if (login) args.push("--login " + login);
    args.push('--password "***"');
    args.push("--refresh");
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
