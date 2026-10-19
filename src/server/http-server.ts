import http from "http";
import fs from "fs";
import path from "path";
import type { RemoteCredentials, RemoteInfo } from "../shared/types";
import { DomainAnalyzer } from "../core/analyzer/DomainAnalyzer";
import { ValidationContext } from "../core/validation/validate";
import { renderHTML } from "./html-template";
import {
  handleFileRequest,
  handleFileSave,
  handleFilePrevious,
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

export interface StartServerOptions {
  port: number;
  rootDir: string;
  analyzer: DomainAnalyzer;
  remoteInfo: RemoteInfo | null;
  credentials: RemoteCredentials | null;
  refreshCommand: string | null;
}

export function startServer(opts: StartServerOptions): http.Server {
  const { port, rootDir, analyzer, remoteInfo, credentials, refreshCommand } =
    opts;

  state.credentials = credentials;
  state.validation = credentials
    ? { credentials, analyzer, state: null }
    : null;

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
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderHTML(graphData, remoteInfo, refreshCommand));
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
    else if (url.startsWith("/file/previous")) {
      handleFilePrevious(req, res, rootDir);
    } else if (url.startsWith("/file") && req.method === "POST") {
      try {
        await handleFileSave(req, res, rootDir, !!remoteInfo?.server);
        // Асинхронный ребилд модели в фоне (ответ клиенту уже отправлен)
        setImmediate(() => {
          try {
            analyzer.reset();
            (analyzer as any).__graphData = analyzer.analyze();
            const rawDomains = analyzer.getRawDomainsForModelIndex();
            const newIndex = buildModelIndex(rawDomains);
            setModelIndex(newIndex);
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
      handleFileRequest(req, res);
    }

    // ============ API: model ============
    else if (url === "/api/model" && req.method === "GET") {
      handleModelRequest(req, res);
    } else if (url === "/api/model/summary" && req.method === "GET") {
      handleModelSummary(res);
    } else if (url === "/api/model/diff" && req.method === "GET") {
      handleModelDiff(res);
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
    }

    // ============ 404 ============
    else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

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
