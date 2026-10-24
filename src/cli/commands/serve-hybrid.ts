import fs from "fs";
import path from "path";
import type { RemoteCredentials } from "../../shared/types";
import { DomainAnalyzer } from "../../core/analyzer/DomainAnalyzer";
import { startServer } from "../../server/http-server";
import { apiLogin } from "../../core/remote/auth";
import { error, warn } from "../../core/utils/logger";

export interface ServeHybridParams {
  localDir: string;
  server: string;
  username: string;
  password: string;
  port: number;
  secure: boolean;
}

/**
 * Гибридный режим:
 *  - файлы читаются/пишутся из локального каталога;
 *  - серверная валидация (массовая и inline в редакторе) — работает через credentials;
 *  - сохранение — только локальное (publish недоступен без кэша).
 */
export async function serveHybrid(params: ServeHybridParams): Promise<void> {
  const { localDir, server, username, password, port, secure } = params;

  const rootDir = path.resolve(localDir);
  if (!fs.existsSync(rootDir)) {
    error("Directory does not exist: " + rootDir);
    process.exit(1);
  }

  const base = server.replace(/\/+$/, "");
  const credentials: RemoteCredentials = {
    server: base,
    loginUrl: base + "/api/evo/core/bff/graphql",
    apiUrl: base + "/api/graphql",
    tenantId: "00000000-0000-0000-0000-000000000000",
    token: null,
    username,
    password,
    secure,
  };

  // Проверяем креды сразу — иначе пользователь узнает об ошибке только
  // при первом нажатии «валидировать».
  try {
    credentials.token = await apiLogin(
      credentials.loginUrl,
      username,
      password,
      secure,
    );
    console.log(`🔐 Логин: ✅ (${username})`);
  } catch (err: any) {
    error("Логин: " + err.message);
    error("Проверьте --login/--password и доступность " + credentials.loginUrl);
    process.exit(1);
  }

  console.log("🔍 Analyzing domains in: " + rootDir);
  const analyzer = new DomainAnalyzer(rootDir);
  const graphData = analyzer.analyze();
  (analyzer as any).__graphData = graphData;

  startServer({
    port,
    rootDir,
    analyzer,
    remoteInfo: {
      cacheDir: rootDir,
      fromCache: false,
      server: base,
      fetchedAt: null,
      mode: "hybrid",
    },
    credentials,
    refreshCommand: null,
    mode: "hybrid",
  });
}
