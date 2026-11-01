import type { IncomingMessage, ServerResponse } from "http";
import type { DomainAnalyzer } from "../../core/analyzer/DomainAnalyzer";
import { getModelIndex } from "./model";
import {
  loadAllLintBaselines,
  loadLintBaseline,
  saveLintBaseline,
  clearLintBaseline,
} from "../../core/analyzer/lint-baseline-storage";
import { buildBaselineForDomain } from "../../core/analyzer/lint-baseline";

function readDomainId(req: IncomingMessage): string | null {
  const url = new URL(req.url!, "http://localhost");
  return url.searchParams.get("domainId");
}

export function handleListLintBaselines(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): void {
  const baselines = loadAllLintBaselines(analyzer.getRootDir());
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify({ baselines }));
}

export function handleGetLintBaseline(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): void {
  const domainId = readDomainId(req);
  if (!domainId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId обязателен" }));
    return;
  }
  const baseline = loadLintBaseline(analyzer.getRootDir(), domainId);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify({ baseline }));
}

export function handleTakeLintBaseline(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): void {
  const domainId = readDomainId(req);
  if (!domainId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId обязателен" }));
    return;
  }

  const index = getModelIndex();
  if (!index) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Model index not built" }));
    return;
  }

  try {
    const baseline = buildBaselineForDomain(
      index.lint.lintReport.issues,
      domainId,
    );
    saveLintBaseline(analyzer.getRootDir(), baseline);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ baseline }));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}

export function handleClearLintBaseline(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): void {
  const domainId = readDomainId(req);
  if (!domainId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId обязателен" }));
    return;
  }
  const cleared = clearLintBaseline(analyzer.getRootDir(), domainId);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, cleared }));
}
