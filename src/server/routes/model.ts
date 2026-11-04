import type { IncomingMessage, ServerResponse } from "http";
import type { ModelIndex, SemanticDiff } from "../../shared/model-types";
import {
  buildModelIndex,
  RawDomainEntry,
} from "../../core/analyzer/model-builder";

/**
 * Кэш ModelIndex — строится один раз при старте.
 */
let cachedIndex: ModelIndex | null = null;
let cachedDiff: SemanticDiff | null | undefined = undefined;
let cachedHasSnapshot = false;
let cachedRawDomains: RawDomainEntry[] | null = null;
let lintComputed = false;

export function setModelIndexBase(
  index: ModelIndex,
  rawDomains: RawDomainEntry[],
): void {
  cachedIndex = index;
  cachedRawDomains = rawDomains;
  lintComputed = false;
}

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

  ensureFullIndex();

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
  lintComputed = true;
}

/**
 * Устанавливает index, но помечает lint как невалидный.
 * Первый /api/model вызовет ensureFullIndex() → buildModelIndex() → lint.
 * Нужно для defer-rebuild: buildModelIndex() уже построил partial,
 * а lint/sonar/martin/pii досчитаются по требованию.
 */
export function setModelIndexStale(
  index: ModelIndex,
  rawDomains?: RawDomainEntry[],
): void {
  cachedIndex = index;
  if (rawDomains) cachedRawDomains = rawDomains;
  lintComputed = false;
}

/** Геттер для skip-if-unchanged в http-server. */
export function getModelIndexCached(): ModelIndex | null {
  return cachedIndex;
}

/**
 * Гарантирует, что в cachedIndex есть lint/sonar/martin/pii.
 * Первый вызов после старта — строит их синхронно (2-5 с),
 * блокирует только этого клиента, не event loop сервера.
 */
function ensureFullIndex(): void {
  if (!cachedIndex || lintComputed || !cachedRawDomains) return;
  try {
    cachedIndex = buildModelIndex(cachedRawDomains);
    lintComputed = true;
    console.log(
      `🔬 Lint (lazy): ${cachedIndex.lint.lintReport.stats.total} проблем, ` +
        `Sonar: ${cachedIndex.lint.sonar.overall.score}/100`,
    );
  } catch (e) {
    console.warn("[model] lazy lint failed:", e);
  }
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

  ensureFullIndex();

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

  ensureFullIndex();

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
export function getModelIndex(): ModelIndex | null {
  return cachedIndex;
}
