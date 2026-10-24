import http from "http";
import fs from "fs";
import path from "path";
import type {
  DomainPublishInfo,
  RemoteCredentials,
  RemoteInfo,
} from "../shared/types";
import { DomainAnalyzer } from "../core/analyzer/DomainAnalyzer";
import { ValidationContext } from "../core/validation/validate";
import { renderHTML } from "./html-template";
import {
  handleFileRequest,
  handleFileSave,
  handleFilePrevious,
  handleFileFresh,
} from "./routes/file";
import { handleUserGuide } from "./routes/user-guide";
import {
  handleValidateStream,
  handleValidateCancel,
  handleValidationResults,
  handleValidationAvailable,
  handleValidateSingle,
} from "./routes/validation";
import { ServerState, state } from "./state";
import { buildModelIndex } from "../core/analyzer/model-builder";
import {
  setModelIndex,
  setModelDiff,
  handleModelRequest,
  handleModelSummary,
  handleModelDiff,
} from "./routes/model";
import {
  createSnapshotFromModelIndex,
  updateModelSnapshot,
} from "../core/analyzer/model-snapshot";
import { computeSemanticDiff } from "../core/analyzer/semantic-diff";
import { prepareRemoteCache } from "../core/remote/cache-manager";
import { handleGenerateRequest } from "./routes/generate";


export interface StartServerOptions {
  port: number;
  rootDir: string;
  analyzer: DomainAnalyzer;
  remoteInfo: RemoteInfo | null;
  credentials: RemoteCredentials | null;
  refreshCommand: string | null;
  mode: "local" | "hybrid" | "remote";
}

/** Блокировка параллельных обновлений кеша. */
let refreshing = false;

interface RefreshCtx {
  analyzer: DomainAnalyzer;
  credentials: RemoteCredentials | null;
  remoteInfo: RemoteInfo | null;
  mode: "local" | "hybrid" | "remote";
}

async function handleRefreshCache(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { analyzer: DomainAnalyzer },
): Promise<void> {
  if (
    state.mode !== "remote" ||
    !state.credentials ||
    !state.remoteInfo?.server
  ) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "Обновление кеша доступно только в режиме --server " +
          "(без локального каталога)",
      }),
    );
    return;
  }

  if (refreshing) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Обновление уже выполняется" }));
    return;
  }

  refreshing = true;
  const startedAt = Date.now();
  const serverUrl = state.remoteInfo.server;
  const credentials = state.credentials;

  console.log(`[refresh-cache] start: ${serverUrl}`);

  try {
    const newRemoteInfo = await prepareRemoteCache({
      serverUrl,
      username: credentials.username,
      password: credentials.password,
      baseDir: process.cwd(),
      opts: {
        refresh: true,
        resetCache: false,
        secure: credentials.secure,
      },
    });

    // Пересобрать analyzer + model index
    ctx.analyzer.reset();
    (ctx.analyzer as any).__graphData = ctx.analyzer.analyze();

    const rawDomains = ctx.analyzer.getRawDomainsForModelIndex();
    const newIndex = buildModelIndex(rawDomains);
    setModelIndex(newIndex);

    // Обновить publish-index
    state.domainIndex = loadDomainIndex(newRemoteInfo.cacheDir);

    // ============ КЛЮЧЕВОЕ: обновить state.remoteInfo ============
    // Иначе renderHTML на следующем GET / инжектит старый fetchedAt.
    state.remoteInfo = { ...newRemoteInfo, mode: "remote" };

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[refresh-cache] OK: ${newIndex.domains.length} доменов, ` +
        `${newIndex.stats.entityCount} сущностей, ${elapsedMs}мс`,
    );

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        ok: true,
        cacheDir: newRemoteInfo.cacheDir,
        fetchedAt: newRemoteInfo.fetchedAt,
        domainCount: newIndex.domains.length,
        entityCount: newIndex.stats.entityCount,
        attributeCount: newIndex.stats.attributeCount,
        elapsedMs,
      }),
    );
  } catch (err: any) {
    console.error(`[refresh-cache] failed:`, err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  } finally {
    refreshing = false;
  }
}

export function startServer(opts: StartServerOptions): http.Server {
  const {
    port,
    rootDir,
    analyzer,
    remoteInfo,
    credentials,
    refreshCommand,
    mode,
  } = opts;

  state.credentials = credentials;
  state.validation = credentials
    ? { credentials, analyzer, state: null }
    : null;
  state.remoteInfo = remoteInfo;
  state.refreshCommand = refreshCommand;
  state.mode = mode;
  state.analyzer = analyzer;

  // ============ domainIndex (только remote) ============
  // Нужен для publishExpertise: id экспертизы и folderId берём из _index.json.
  state.domainIndex = null;
  if (mode === "remote" && remoteInfo?.cacheDir) {
    const m = loadDomainIndex(remoteInfo.cacheDir);
    if (m) {
      state.domainIndex = m;
      console.log(`📂 Publish index: ${m.size} доменов`);
    }
  }

  const rawDomains = analyzer.getRawDomainsForModelIndex();
  const modelIndex = buildModelIndex(rawDomains);
  setModelIndex(modelIndex);

  console.log(
    `📊 Model index: ${modelIndex.stats.entityCount} entities, ` +
      `${modelIndex.stats.attributeCount} attributes, ${modelIndex.stats.mixinCount} mixins`,
  );

  console.log(
    `🔬 Lint: ${modelIndex.lint.lintReport.stats.total} проблем, ` +
      `Sonar: ${modelIndex.lint.sonar.overall.score}/100 (${modelIndex.lint.sonar.overall.grade})`,
  );

  const currentSnapshot = createSnapshotFromModelIndex(modelIndex);
  const snapshotResult = updateModelSnapshot(rootDir, currentSnapshot);
  setModelDiff(snapshotResult.effectiveDiff, !snapshotResult.isFirstRun);

  if (snapshotResult.isFirstRun) {
    console.log(
      "📸 Первый снапшот модели создан (изменения будут доступны после следующего запуска)",
    );
  } else if (snapshotResult.hasChanges) {
    const s = snapshotResult.freshDiff!.stats;
    const total =
      s.entitiesAdded +
      s.entitiesRemoved +
      s.entitiesChanged +
      s.mixinsAdded +
      s.mixinsRemoved +
      s.dataTypesAdded +
      s.dataTypesRemoved +
      s.domainsAdded +
      s.domainsRemoved +
      s.domainsChanged;
    console.log(`📊 Semantic diff: зафиксировано изменений — ${total}`);
  } else if (snapshotResult.effectiveDiff) {
    console.log(
      "📊 Semantic diff: показываем последнее зафиксированное изменение",
    );
  } else {
    console.log("📊 Semantic diff: снапшот есть, изменений пока не было");
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";

    // ============ Static ============
    if (url === "/") {
      const graphData = (analyzer as any).__graphData || analyzer.analyze();
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      });
      res.end(renderHTML(graphData, state.remoteInfo, state.refreshCommand));
    } else if (url === "/web.bundle.js") {
      try {
        const content = fs.readFileSync(
          path.join(__dirname, "..", "..", "dist", "web.bundle.js"),
        );
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("// Bundle not built. Run: npm run build:web");
      }
    } else if (url === "/web.bundle.css") {
      try {
        const content = fs.readFileSync(
          path.join(__dirname, "..", "..", "dist", "web.bundle.css"),
        );
        res.writeHead(200, {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("/* CSS not built */");
      }
    } else if (url === "/user-guide") {
      handleUserGuide(req, res);
    } else if (url === "/favicon.ico") {
      res.writeHead(204);
      res.end();
    }

    // ============ File routes ============
    // ВАЖНО: /file/previous ДОЛЖЕН идти ПЕРЕД /file,
    // иначе попадает в handleFileRequest и отдаёт текущий файл
    else if (url.startsWith("/file/fresh")) {
      try {
        await handleFileFresh(
          req,
          res,
          rootDir,
          mode,
          credentials,
          state.domainIndex,
        );
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {
          /* ignore */
        }
      }
    } else if (url.startsWith("/file/previous")) {
      handleFilePrevious(req, res, rootDir);
    } else if (url.startsWith("/file") && req.method === "POST") {
      try {
        await handleFileSave(
          req,
          res,
          rootDir,
          mode,
          credentials,
          state.domainIndex,
        );
        // Асинхронный ребилд модели в фоне (ответ клиенту уже отправлен)
        setImmediate(() => {
          try {
            analyzer.reset();
            (analyzer as any).__graphData = analyzer.analyze();
            const rawDomains = analyzer.getRawDomainsForModelIndex();
            const newIndex = buildModelIndex(rawDomains);
            setModelIndex(newIndex);

            // Обновляем semantic diff относительно сохранённого snapshot.
            // Без этого /api/model/diff будет возвращать lastDiff,
            // установленный один раз при старте сервера.
            try {
              const currentSnapshot = createSnapshotFromModelIndex(newIndex);
              const snapshotResult = updateModelSnapshot(
                rootDir,
                currentSnapshot,
              );
              setModelDiff(
                snapshotResult.effectiveDiff,
                !snapshotResult.isFirstRun,
              );
            } catch (e) {
              console.warn("[rebuild] snapshot/diff update failed:", e);
            }

            console.log("[rebuild] model rebuilt after file save");
          } catch (e) {
            console.error("[rebuild] failed:", e);
          }
        });
      } catch (err: any) {
        try {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        } catch {
          /* ignore */
        }
      }
    } else if (url.startsWith("/file")) {
      handleFileRequest(req, res, rootDir);
    }

    // ============ API: model ============
    else if (url === "/api/model" && req.method === "GET") {
      handleModelRequest(req, res);
    } else if (url === "/api/model/summary" && req.method === "GET") {
      handleModelSummary(res);
    } else if (url === "/api/model/diff" && req.method === "GET") {
      handleModelDiff(res);
    } else if (url === "/api/refresh-cache" && req.method === "POST") {
      try {
        await handleRefreshCache(req, res, { analyzer });
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    }

    // ============ API: validation ============
    else if (url === "/api/validate-stream" && req.method === "POST") {
      try {
        await handleValidateStream(req, res, state);
      } catch (err: any) {
        try {
          res.write(
            "data: " +
              JSON.stringify({ type: "error", message: err.message }) +
              "\n\n",
          );
          res.end();
        } catch {
          /* ignore */
        }
      }
    } else if (url === "/api/validate-cancel" && req.method === "POST") {
      handleValidateCancel(req, res, state);
    } else if (url === "/api/validation-results" && req.method === "GET") {
      handleValidationResults(req, res, rootDir);
    } else if (url === "/api/validation-available" && req.method === "GET") {
      handleValidationAvailable(req, res, state);
    } else if (url === "/api/validate-single" && req.method === "POST") {
      try {
        await handleValidateSingle(req, res, state);
      } catch (err: any) {
        try {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        } catch {
          /* ignore */
        }
      }
    } else if (url === "/api/generate" && req.method === "POST") {
      try {
        await handleGenerateRequest(req, res, analyzer);
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    }

    // ============ 404 ============
    else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`❌ Некорректный порт: ${port}. Завершаю работу.`);
    process.exit(1);
  }

  server.listen(port, () => {
    const graphData = (analyzer as any).__graphData;
    console.log(`\n🚀 Domains Analyzer: http://localhost:${port}`);
    if (graphData) {
      console.log(`   Domains: ${graphData.domainCount}`);
      console.log(`   Links: ${graphData.linkCount}`);
      console.log(`   Missing: ${graphData.missingCount}`);
      console.log(`   Broken: ${graphData.brokenCount}\n`);
    }
  });

  return server;
}

function loadDomainIndex(
  cacheDir: string,
): Map<string, DomainPublishInfo> | null {
  try {
    const idxPath = path.join(cacheDir, "_index.json");
    if (!fs.existsSync(idxPath)) return null;
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    const m = new Map<string, DomainPublishInfo>();
    for (const d of idx.domains || []) {
      if (
        typeof d?.sourceId === "string" &&
        typeof d?.id === "string" &&
        typeof d?.folderId === "string"
      ) {
        m.set(d.sourceId, {
          id: d.id,
          folderId: d.folderId,
          sourceId: d.sourceId,
          name: d.name || d.sourceId,
        });
      }
    }
    return m;
  } catch (err: any) {
    console.warn("[publish] failed to load _index.json:", err.message);
    return null;
  }
}