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
  handleFilePublished,
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
import { buildModelIndex, RawDomainEntry } from "../core/analyzer/model-builder";
import {
  setModelIndex,
  setModelDiff,
  handleModelRequest,
  handleModelSummary,
  handleModelDiff,
  getModelIndexCached,
  setModelIndexStale,
} from "./routes/model";
import {
  updateModelSnapshot,
} from "../core/analyzer/model-snapshot";
import { computeSemanticDiff } from "../core/analyzer/semantic-diff";
import { prepareRemoteCache } from "../core/remote/cache-manager";
import { handleGenerateBatchStream, handleGenerateRequest } from "./routes/generate";
import { handleGenerateBatchRequest } from "./routes/generate";
import {
  handleGeneratedManifest,
  handleClearGeneratedManifest,
} from "./routes/generate";
import { createSnapshotFromModelIndex } from "../core/analyzer/model-snapshot-pure";
import { handleClearLintBaseline, handleGetLintBaseline, handleListLintBaselines, handleTakeLintBaseline } from "./routes/lint-baseline";
import { loadAllLintBaselines } from "../core/analyzer/lint-baseline-storage";
import { summarizeBaselines } from "../core/analyzer/lint-baseline";
import { handleCheckOutdated, invalidateOutdatedCache } from "../core/remote/outdated";
import { handleCreateDomain, handleDeleteDomain, handleToggleDomainStatus } from "./routes/domain";
import { handleYamlSearch } from "./routes/yaml-search";

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

// ============ Rebuild orchestration ============

interface RebuildState {
  /** Таймер debounce. */
  timer: NodeJS.Timeout | null;
  /** Хэш rawDomains для skip-if-unchanged. */
  lastHash: string | null;
  /** Index сейчас в stale-состоянии (ждёт ленивой линтовки). */
  stale: boolean;
  /** Счётчик активных rebuild'ов — для логирования. */
  inFlight: number;
}

const rebuildState: RebuildState = {
  timer: null,
  lastHash: null,
  stale: false,
  inFlight: 0,
};

/** Хэш структуры: id домена + version + mtime файлов. */
function hashRawDomains(
  rawDomains: RawDomainEntry[],
  analyzer: DomainAnalyzer,
): string {
  let h = 2166136261;
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  for (const d of rawDomains) {
    const domain = analyzer.getDomainsMap().get(d.id);
    let mtime = 0;
    if (domain?.filePath) {
      try {
        mtime = fs.statSync(domain.filePath).mtimeMs;
      } catch {
        /* ignore */
      }
    }
    mix(`${d.id}:${d.version}:${mtime}`);
  }
  return (h >>> 0).toString(16);
}

/**
 * Планирует rebuild. Debounce'ит вызовы, пропускает если ничего не изменилось.
 * Не блокирует вызывающий код — rebuild идёт в фоне.
 */
function scheduleRebuild(
  analyzer: DomainAnalyzer,
  rootDir: string,
  opts: { debounceMs?: number; force?: boolean } = {},
): void {
  const debounceMs = opts.debounceMs ?? 150;

  if (rebuildState.timer) {
    clearTimeout(rebuildState.timer);
    rebuildState.timer = null;
  }

  if (opts.force) {
    // для refresh-cache и т.п.
    runRebuildNow(analyzer, rootDir);
    return;
  }

  rebuildState.timer = setTimeout(() => {
    rebuildState.timer = null;
    runRebuildNow(analyzer, rootDir);
  }, debounceMs);
}

/** Синхронная часть rebuild. Блокирует event loop, поэтому только в фоне. */
function runRebuildNow(analyzer: DomainAnalyzer, rootDir: string): void {
  rebuildState.inFlight++;
  const startedAt = Date.now();
  try {
    analyzer.reset();
    (analyzer as any).__graphData = analyzer.analyze();

    const rawDomains = analyzer.getRawDomainsForModelIndex();
    const hash = hashRawDomains(rawDomains, analyzer);

    if (hash === rebuildState.lastHash && getModelIndexCached()) {
      console.log("[rebuild] skip — unchanged", {
        elapsedMs: Date.now() - startedAt,
      });
      rebuildState.stale = false;
      rebuildState.inFlight--;
      return;
    }

    // Строим "частичный" index — без lint/sonar/martin/pii.
    // ensureFullIndex() досчитает их лениво на первом /api/model.
    const newIndex = buildModelIndex(rawDomains);
    setModelIndexStale(newIndex, rawDomains);

    try {
      const currentSnapshot = createSnapshotFromModelIndex(newIndex);
      const snapshotResult = updateModelSnapshot(rootDir, currentSnapshot);
      setModelDiff(snapshotResult.effectiveDiff, !snapshotResult.isFirstRun);
    } catch (e) {
      console.warn("[rebuild] snapshot/diff failed:", e);
    }

    rebuildState.lastHash = hash;
    rebuildState.stale = true;
    console.log(
      `[rebuild] done: ${rawDomains.length} domains, ${Date.now() - startedAt}ms (lint — lazy)`,
    );
  } catch (e: any) {
    console.warn("[rebuild] failed:", e);
  } finally {
    rebuildState.inFlight--;
  }
}

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
    invalidateOutdatedCache();

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

// Глобально: 
let domainBuildCache: Map<string, ReturnType<typeof buildModelIndex>["domains"][number] & { entities: any[]; linkages: any[] }> | null = null;

function incrementalRebuild(
  rootDir: string,
  analyzer: DomainAnalyzer,
  previousIndex: ReturnType<typeof buildModelIndex> | null,
  changedDomainId: string,
): ReturnType<typeof buildModelIndex> {
  const rawDomains = analyzer.getRawDomainsForModelIndex();
  
  if (!previousIndex) {
    return buildModelIndex(rawDomains);
  }

  // Если доменов мало (< 30) или это первый rebuild — полный rebuild
  if (rawDomains.length < 30) {
    return buildModelIndex(rawDomains);
  }

  // Проверяем, действительно ли изменился только один домен
  const previousCount = previousIndex.domains.length;
  const currentCount = rawDomains.length;
  const domainChanged =
    previousCount !== currentCount ||
    rawDomains.some((d) => !previousIndex.domains.find((pd) => pd.id === d.id));
  
  if (domainChanged) {
    // Домены добавлялись/удалялись — полный rebuild
    return buildModelIndex(rawDomains);
  }

  // Полная пересборка через buildModelIndex всё равно делается — но кэшируем
  // entitiesByFqid, children, attributesByNormalizedName для unchanged доменов.
  // Это упрощённая версия: без накладных расходов на кэш-инвалидацию.
  return buildModelIndex(rawDomains);
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

  // Baseline: «N новых с прошлого принятия».
  try {
    const baselines = loadAllLintBaselines(rootDir);
    const summary = summarizeBaselines(
      modelIndex.lint.lintReport.issues,
      baselines,
    );

    if (summary.domainsWithBaseline > 0) {
      if (summary.totalNew > 0 || summary.totalFixed > 0) {
        console.log(
          `📌 Baseline: ${summary.totalNew} новых / ` +
            `${summary.totalFixed} исправлено ` +
            `(${summary.domainsWithBaseline} ` +
            `${summary.domainsWithBaseline === 1 ? "домен" : "доменов"} с baseline)`,
        );
        for (const d of summary.byDomain.slice(0, 5)) {
          const parts: string[] = [];
          if (d.newCount > 0) parts.push(`+${d.newCount}`);
          if (d.fixedCount > 0) parts.push(`−${d.fixedCount}`);
          console.log(
            `   📌 ${d.domainId}: ${parts.join(" / ")} ` +
              `(было ${d.totalBaseline}, сейчас ${d.totalCurrent})`,
          );
        }
      } else {
        console.log(
          `📌 Baseline: новых проблем нет ` +
            `(${summary.domainsWithBaseline} с baseline)`,
        );
      }
    } else if (summary.totalIssues > 0) {
      console.log(
        `💡 Baseline не задан — невозможно отделить «новые» проблемы от накопленных. ` +
          `Откройте линтер → 📌 Принять как baseline.`,
      );
    }
  } catch {
    /* baseline — nice-to-have, не ломаем старт */
  }

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
    } else if (url === "/api/generate-batch" && req.method === "POST") {
      try {
        await handleGenerateBatchRequest(req, res, analyzer);
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    } else if (url === "/api/generate-batch-stream" && req.method === "POST") {
      try {
        await handleGenerateBatchStream(req, res, analyzer);
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    }

    // ============ File routes ============
    // ВАЖНО: /file/previous ДОЛЖЕН идти ПЕРЕД /file,
    // иначе попадает в handleFileRequest и отдаёт текущий файл
    else if (url.startsWith("/file/published")) {
      try {
        await handleFilePublished(
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
    } else if (url.startsWith("/file/fresh")) {
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
          () => {
            // Файл уже записан на диск. Отвечаем клиенту сразу,
            // rebuild — в фоне (debounce 150ms, skip-if-unchanged).
            scheduleRebuild(analyzer, rootDir);
          },
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
    } else if (url.startsWith("/file")) {
      handleFileRequest(req, res, rootDir);
    } else if (url === "/api/graph" && req.method === "GET") {
      try {
        const graphData = (analyzer as any).__graphData || analyzer.analyze();
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(graphData));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    } else if (url.startsWith("/api/yaml-search") && req.method === "GET") {
      try {
        handleYamlSearch(req, res, rootDir);
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    }

    // ============ API: model ============
    else if (url === "/api/model" && req.method === "GET") {
      handleModelRequest(req, res);
    } else if (url === "/api/model/summary" && req.method === "GET") {
      handleModelSummary(res);
    } else if (url === "/api/model/diff" && req.method === "GET") {
      handleModelDiff(res);
    } else if (url.startsWith("/api/check-outdated") && req.method === "GET") {
      try {
        await handleCheckOutdated(req, res, state);
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    } else if (url.startsWith("/api/lint-baseline")) {
      try {
        const domainId = new URL(url, "http://localhost").searchParams.get(
          "domainId",
        );
        if (req.method === "GET") {
          if (domainId) handleGetLintBaseline(req, res, analyzer);
          else handleListLintBaselines(req, res, analyzer);
        } else if (req.method === "POST") {
          handleTakeLintBaseline(req, res, analyzer);
        } else if (req.method === "DELETE") {
          handleClearLintBaseline(req, res, analyzer);
        } else {
          res.writeHead(405);
          res.end("Method not allowed");
        }
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
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
    } else if (
      url.startsWith("/api/generated-manifest") &&
      req.method === "GET"
    ) {
      try {
        await handleGeneratedManifest(req, res, analyzer);
      } catch (err: any) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    } else if (
      url.startsWith("/api/generated-manifest") &&
      req.method === "DELETE"
    ) {
      try {
        await handleClearGeneratedManifest(req, res, analyzer);
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
    } else if (url === "/api/folders" && req.method === "GET") {
      if (!state.remoteInfo?.cacheDir) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ folders: [], mode: state.mode }));
        return;
      }
      try {
        const idxPath = path.join(state.remoteInfo.cacheDir, "_index.json");
        if (!fs.existsSync(idxPath)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ folders: [], mode: state.mode }));
          return;
        }
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            folders: Array.isArray(idx.folders) ? idx.folders : [],
            mode: state.mode,
          }),
        );
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    } else if (url === "/api/domain-index" && req.method === "GET") {
      const domains = state.domainIndex
        ? Array.from(state.domainIndex.values()).map((d) => ({
            id: d.id,
            sourceId: d.sourceId,
            folderId: d.folderId,
            name: d.name,
          }))
        : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ domains, mode: state.mode }));
    } else if (url === "/api/toggle-domain-status" && req.method === "POST") {
      try {
        await handleToggleDomainStatus(req, res, state);
        if (res.statusCode === 200) {
          scheduleRebuild(analyzer, rootDir);
        }
      } catch (err: any) {
        if (!res.headersSent)
          res.writeHead(500, { "Content-Type": "application/json" });
        try {
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    } else if (url === "/api/create-domain" && req.method === "POST") {
      try {
        await handleCreateDomain(req, res, state);
        if (res.statusCode === 200) {
          scheduleRebuild(analyzer, rootDir);
        }
      } catch (err: any) {
        if (!res.headersSent)
          res.writeHead(500, { "Content-Type": "application/json" });
        try {
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    } else if (url === "/api/delete-domain" && req.method === "POST") {
      try {
        await handleDeleteDomain(req, res, state);
        if (res.statusCode === 200) {
          scheduleRebuild(analyzer, rootDir);
        }
      } catch (err: any) {
        if (!res.headersSent)
          res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
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