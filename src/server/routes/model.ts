import type { IncomingMessage, ServerResponse } from "http";
import type { ModelIndex, SemanticDiff } from "../../shared/model-types";

/**
 * Кэш ModelIndex — строится один раз при старте.
 */
let cachedIndex: ModelIndex | null = null;
let cachedDiff: SemanticDiff | null | undefined = undefined;
let cachedHasSnapshot = false;

export function setModelDiff(
  diff: SemanticDiff | null,
  hasSnapshot: boolean,
): void {
  cachedDiff = diff;
  cachedHasSnapshot = hasSnapshot;
}

export function handleModelDiff(res: ServerResponse): void {
  if (!cachedIndex) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end('{"error":"Model index not built"}');
    return;
  }
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(
    JSON.stringify({
      diff: cachedDiff,
      hasSnapshot: cachedHasSnapshot,
    }),
  );
}

export function setModelIndex(index: ModelIndex): void {
  cachedIndex = index;
}

export function handleModelRequest(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  if (!cachedIndex) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end('{"error":"Model index not built"}');
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(cachedIndex));
}

/**
 * Компактная сводка без тяжёлых полей — для быстрого отображения в UI.
 */
export function handleModelSummary(res: ServerResponse): void {
  if (!cachedIndex) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end('{"error":"Model index not built"}');
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(
    JSON.stringify({
      generatedAt: cachedIndex.generatedAt,
      stats: cachedIndex.stats,
      domainCount: new Set(cachedIndex.entities.map((e) => e.domainId)).size,
    }),
  );
}
