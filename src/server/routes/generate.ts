import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { readJsonBody } from "../../core/remote/http-client";
import { buildModelIndex } from "../../core/analyzer/model-builder";
import type { DomainAnalyzer } from "../../core/analyzer/DomainAnalyzer";
import type { GeneratorProfile } from "../../core/analyzer/schema-generator/types";
import { getModelIndex } from "./model";
import {
  generateForEntity,
  generateForDomain,
  loadGeneratedManifest,
} from "../../core/analyzer/schema-generator";
import type {
  ManifestBlockView,
  ManifestEntityView,
  ManifestDomainView,
} from "../../shared/manifest-types";
import { findPayloadByBlockId } from "../../core/analyzer/schema-generator/block-resolver";
import { hashPayload } from "../../core/analyzer/schema-generator/util-hash";

interface GenerateRequestBody {
  domainId: string;
  entityId: string;
  profile?: GeneratorProfile;
  options?: Record<string, unknown>;
}

export async function handleGenerateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): Promise<void> {
  let body: GenerateRequestBody;
  try {
    body = await readJsonBody(req);
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Некорректный JSON: " + e.message }));
    return;
  }

  if (!body.domainId || !body.entityId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId и entityId обязательны" }));
    return;
  }

  try {
    const allDomains = analyzer.getRawDomainsForModelIndex();
    // Используем кэш, если он актуален, иначе — пересобираем.
    const index = getModelIndex() ?? buildModelIndex(allDomains);
    const result = generateForEntity(
      allDomains,
      index,
      {
        domainId: body.domainId,
        entityId: body.entityId,
        profile: body.profile ?? "crud",
        options: body.options as any,
      },
      analyzer.getRootDir(),
    );
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(result));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}

export async function handleGenerateBatchRequest(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): Promise<void> {
  let body: {
    domainId: string;
    profile?: GeneratorProfile;
    options?: Record<string, unknown>;
    entityIds?: string[];
  };
  try {
    body = await readJsonBody(req);
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Некорректный JSON: " + e.message }));
    return;
  }

  if (!body.domainId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId обязателен" }));
    return;
  }

  try {
    const allDomains = analyzer.getRawDomainsForModelIndex();
    const index = getModelIndex() ?? buildModelIndex(allDomains);
    const result = generateForDomain(
      allDomains,
      index,
      {
        domainId: body.domainId,
        profile: body.profile ?? "crud",
        options: body.options as any,
        entityIds: body.entityIds,
      },
      analyzer.getRootDir(),
    );
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(result));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}

export async function handleGenerateBatchStream(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): Promise<void> {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Некорректный JSON: " + e.message }));
    return;
  }

  if (!body.domainId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId обязателен" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const controller = new AbortController();
  let closed = false;
  req.on("close", () => {
    if (!res.writableEnded) {
      closed = true;
      controller.abort();
    }
  });

  const send = (obj: unknown) => {
    if (closed) return;
    try {
      res.write("data: " + JSON.stringify(obj) + "\n\n");
    } catch {
      /* ignore */
    }
  };

  try {
    const allDomains = analyzer.getRawDomainsForModelIndex();
    const index = getModelIndex() ?? buildModelIndex(allDomains);
    const result = await generateForDomain(
      allDomains,
      index,
      {
        domainId: body.domainId,
        profile: body.profile ?? "crud",
        options: body.options,
        entityIds: body.entityIds,
      },
      analyzer.getRootDir(),
      {
        signal: controller.signal,
        onProgress: (p) => send({ type: "progress", ...p }),
      },
    );
    send({ type: "done", result });
  } catch (e: any) {
    if (e?.name === "AbortError" || closed) {
      send({ type: "cancelled" });
    } else {
      send({ type: "error", message: e?.message || String(e) });
    }
  } finally {
    try {
      if (!closed) res.end();
    } catch {
      /* ignore */
    }
  }
}
export async function handleGeneratedManifest(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): Promise<void> {
  const url = new URL(req.url!, "http://localhost");
  const domainId = url.searchParams.get("domainId");
  if (!domainId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId обязателен" }));
    return;
  }

  const rootDir = analyzer.getRootDir();
  const manifest = loadGeneratedManifest(rootDir);
  const domainManifest = manifest.domains[domainId];

  const empty: ManifestDomainView = {
    domainId,
    entities: [],
    stats: { entities: 0, blocks: 0, actual: 0, modified: 0, orphaned: 0 },
  };

  if (!domainManifest) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(empty));
    return;
  }

  const allDomains = analyzer.getRawDomainsForModelIndex();
  const domain = allDomains.find((d) => d.id === domainId);
  const rawData = domain?.rawData;

  const entities: ManifestEntityView[] = [];
  let totalBlocks = 0;
  let totalActual = 0;
  let totalModified = 0;
  let totalOrphaned = 0;

  for (const [entityId, entityManifest] of Object.entries(
    domainManifest.entities,
  )) {
    const blocks: ManifestBlockView[] = [];
    let actual = 0,
      modified = 0,
      orphaned = 0;

    for (const [blockId, entry] of Object.entries(entityManifest.blocks)) {
      const currentPayload = rawData
        ? findPayloadByBlockId(rawData, blockId, entry.parentViewId)
        : null;
      let status: ManifestBlockView["status"];
      if (currentPayload == null) {
        status = "orphaned";
        orphaned++;
      } else if (hashPayload(currentPayload) === entry.hash) {
        status = "actual";
        actual++;
      } else {
        status = "modified";
        modified++;
      }
      blocks.push({
        blockId,
        title: entry.title,
        hash: entry.hash,
        generatedAt: entry.generatedAt,
        parentViewId: entry.parentViewId,
        status,
      });
    }

    blocks.sort((a, b) => a.blockId.localeCompare(b.blockId));

    entities.push({
      entityId,
      profile: entityManifest.profile,
      generatedAt: entityManifest.generatedAt,
      blocks,
      stats: { total: blocks.length, actual, modified, orphaned },
    });

    totalBlocks += blocks.length;
    totalActual += actual;
    totalModified += modified;
    totalOrphaned += orphaned;
  }

  entities.sort((a, b) => a.entityId.localeCompare(b.entityId));

  const payload: ManifestDomainView = {
    domainId,
    entities,
    stats: {
      entities: entities.length,
      blocks: totalBlocks,
      actual: totalActual,
      modified: totalModified,
      orphaned: totalOrphaned,
    },
  };

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(payload));
}

export async function handleClearGeneratedManifest(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): Promise<void> {
  const url = new URL(req.url!, "http://localhost");
  const domainId = url.searchParams.get("domainId");
  if (!domainId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId обязателен" }));
    return;
  }

  const rootDir = analyzer.getRootDir();
  const manifest = loadGeneratedManifest(rootDir);
  if (!manifest.domains[domainId]) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, cleared: 0 }));
    return;
  }

  const cleared = Object.keys(manifest.domains[domainId].entities).length;
  delete manifest.domains[domainId];

  try {
    const p = path.join(rootDir, "_generated.json");
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), "utf8");
    fs.renameSync(tmp, p);
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, cleared }));
}
