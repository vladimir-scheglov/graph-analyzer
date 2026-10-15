import http from "http";
import fs from "fs";
import path from "path";
import type { RemoteCredentials, RemoteInfo } from "../shared/types";
import { DomainAnalyzer } from "../core/analyzer/DomainAnalyzer";
import { ValidationContext } from "../core/validation/validate";
import { renderHTML } from "./html-template";
import { handleFileRequest } from "./routes/file";
import { handleUserGuide } from "./routes/user-guide";
import {
  handleValidateStream,
  handleValidateCancel,
  handleValidationResults,
  handleValidationAvailable,
} from "./routes/validation";
import { ServerState, state } from "./state";

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

  // Обновляем глобальный state
  state.credentials = credentials;
  state.validation = credentials
    ? { credentials, analyzer, state: null }
    : null;

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";

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
    } else if (url.startsWith("/file")) {
      handleFileRequest(req, res);
    } else if (url === "/api/validate-stream" && req.method === "POST") {
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
    } else if (url === "/favicon.ico") {
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    const graphData = (analyzer as any).__graphData;
    console.log(`\n🚀 Graph server: http://localhost:${port}`);
    if (graphData) {
      console.log(`   Domains: ${graphData.domainCount}`);
      console.log(`   Links: ${graphData.linkCount}`);
      console.log(`   Missing: ${graphData.missingCount}`);
      console.log(`   Broken: ${graphData.brokenCount}\n`);
    }
  });

  return server;
}
