import type { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import { readJsonBody } from "../../core/remote/http-client";
import { loadYaml } from "../../core/analyzer/yaml-loader";
import { apiLogin, withTokenRefresh } from "../../core/remote/auth";
import { mergeGeneratedManifest } from "../../core/analyzer/schema-generator/manifest";
import {
  apiFetchExpertiseSource,
  apiFetchExpertisePublished,
  apiPublishExpertise,
  apiSaveExpertiseDraft,
  type ExpertiseSourceResult,
  type ExpertisePublishedResult,
} from "../../core/remote/schemas-loader";
import type {
  DraftResult,
  PublishResult,
  SaveResponse,
  RemoteCredentials,
  DomainPublishInfo,
} from "../../shared/types";


// ============ GET /file?path=... ============

export function handleFileRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
): void {
  const url = new URL(req.url!, "http://localhost");
  const filePath = url.searchParams.get("path");
  if (!filePath) {
    res.writeHead(400);
    res.end("Missing path");
    return;
  }

  const rootResolved = path.resolve(rootDir);
  const resolved = path.resolve(filePath);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Path outside root");
    return;
  }

  try {
    const content = fs.readFileSync(resolved, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Source": "local",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ============ .previous ============

const PREVIOUS_DIR = ".previous";

function resolvePreviousPath(rootDir: string, filePath: string): string {
  const rel = path.relative(rootDir, filePath);
  return path.join(rootDir, PREVIOUS_DIR, rel);
}

// ============ Publish (remote mode only) ============

function formatMutationError(
  e: any,
  action: "draft" | "publish",
): { error: string; code?: string; hint?: string } {
  const code = String(e?.code || "");
  let hint: string | undefined;
  if (action === "publish" && code === "EXPERTISE.PUBLISH.LOWER_VERSION") {
    hint = "Увеличьте version в схеме — она должна быть больше, чем на сервере";
  }
  return { error: e?.message || "Ошибка", code, hint };
}

function parseSourceId(content: string): string | null {
  try {
    const { data } = loadYaml(content);
    if (data && typeof data === "object" && typeof data.id === "string") {
      return data.id;
    }
  } catch {
    return null;
  }
  return null;
}

async function trySaveDraft(
  content: string,
  credentials: RemoteCredentials,
  domainIndex: Map<string, DomainPublishInfo>,
): Promise<DraftResult> {
  let sourceId: string | null;
  try {
    const { data } = loadYaml(content);
    if (data && typeof data === "object" && typeof data.id === "string") {
      sourceId = data.id;
    } else {
      return { ok: false, error: "В схеме не задан id (FQDN домена)" };
    }
  } catch (e: any) {
    return { ok: false, error: "YAML parse: " + e.message };
  }

  if (!sourceId)
    return { ok: false, error: "В схеме не задан id (FQDN домена)" };

  const info = domainIndex.get(sourceId);
  if (!info) {
    return {
      ok: false,
      error: `Домен ${sourceId} не найден в _index.json кэша`,
      hint: "Сохранение черновика возможно только для доменов, скачанных через --server",
    };
  }

  try {
    const r = await withTokenRefresh(credentials, (t) =>
      apiSaveExpertiseDraft(
        credentials.apiUrl,
        t,
        credentials.tenantId,
        {
          id: info.id,
          folderId: info.folderId,
          organizationId: "00000000-0000-0000-0000-000000000000",
          sourceCode: content,
          type: "DOMAIN",
        },
        credentials.secure,
      ),
    );
    return { ok: true, domain: r };
  } catch (e: any) {
    const f = formatMutationError(e, "draft");
    return { ok: false, error: f.error, code: f.code, hint: f.hint };
  }
}

async function tryPublish(
  content: string,
  credentials: RemoteCredentials,
  domainIndex: Map<string, DomainPublishInfo>,
): Promise<PublishResult> {
  let sourceId: string | null;
  try {
    const { data } = loadYaml(content);
    if (data && typeof data === "object" && typeof data.id === "string") {
      sourceId = data.id;
    } else {
      return { ok: false, error: "В схеме не задан id (FQDN домена)" };
    }
  } catch (e: any) {
    return { ok: false, error: "YAML parse: " + e.message };
  }

  if (!sourceId)
    return { ok: false, error: "В схеме не задан id (FQDN домена)" };

  const info = domainIndex.get(sourceId);
  if (!info) {
    return {
      ok: false,
      error: `Домен ${sourceId} не найден в _index.json кэша`,
      hint: "Публикация возможна только для доменов, скачанных через --server",
    };
  }

  try {
    const result = await withTokenRefresh(credentials, (t) =>
      apiPublishExpertise(
        credentials.apiUrl,
        t,
        credentials.tenantId,
        {
          id: info.id,
          folderId: info.folderId,
          organizationId: "00000000-0000-0000-0000-000000000000",
          sourceCode: content,
          type: "DOMAIN",
        },
        credentials.secure,
      ),
    );
    return { ok: true, domain: result };
  } catch (e: any) {
    const f = formatMutationError(e, "publish");
    return { ok: false, error: f.error, code: f.code, hint: f.hint };
  }
}

// ============ POST /file (сохранение) ============

export async function handleFileSave(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
  mode: "local" | "hybrid" | "remote",
  credentials: RemoteCredentials | null,
  domainIndex: Map<string, DomainPublishInfo> | null,
): Promise<void> {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Некорректный JSON: " + e.message }));
    return;
  }

  const filePath = body?.path;
  const content = body?.content;
  const generated = body?.generated;
  const actionRaw = body?.action;
  const action: "save" | "publish" =
    actionRaw === "publish" ? "publish" : "save";

  if (typeof filePath !== "string" || typeof content !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "path и content обязательны" }));
    return;
  }

  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(rootDir);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Путь вне корневой директории" }));
    return;
  }
  if (resolved.includes(path.sep + PREVIOUS_DIR + path.sep)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Сохранение файлов внутри .previous запрещено",
      }),
    );
    return;
  }
  if (!resolved.endsWith(".ro")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Разрешено сохранение только .ro файлов" }),
    );
    return;
  }

  // ============ 1. Запись на диск (всегда) ============
  try {
    if (fs.existsSync(resolved)) {
      const prevPath = resolvePreviousPath(rootResolved, resolved);
      fs.mkdirSync(path.dirname(prevPath), { recursive: true });
      fs.copyFileSync(resolved, prevPath);
    }
    fs.writeFileSync(resolved, content, "utf8");
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  // ============ 2. remote: saveDraft / publish ============
  let draft: DraftResult | null = null;
  let publish: PublishResult | null = null;

  if (mode === "remote" && credentials && domainIndex) {
    if (action === "save") {
      draft = await trySaveDraft(content, credentials, domainIndex);
    } else {
      publish = await tryPublish(content, credentials, domainIndex);
    }
  } else if (mode === "hybrid" && action === "publish") {
    publish = {
      ok: false,
      error: "Публикация недоступна в гибридном режиме",
      hint: "Сохранение в гибридном режиме — локальное. Публикация требует кэша (--server).",
    };
  }

  // ============ 3. _index.json — только при успехе ============
  const draftOk = draft?.ok === true && !!draft.domain?.id;
  const publishOk = publish?.ok === true && !!publish.domain?.id;
  if (draftOk || publishOk) {
    try {
      const idxPath = path.join(rootResolved, "_index.json");
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));

        let parsedVersion: string | null = null;
        if (publishOk) {
          try {
            const { data } = loadYaml(content);
            if (
              data &&
              typeof data === "object" &&
              typeof data.version === "string"
            ) {
              parsedVersion = data.version;
            }
          } catch {
            /* ignore */
          }
        }

        const targetId = publishOk ? publish!.domain!.id : draft!.domain!.id;

        for (const d of idx.domains || []) {
          if (d.id !== targetId) continue;
          if (publishOk) {
            if (parsedVersion) d.version = parsedVersion;
            d.updatedAt = new Date().toISOString();
            d.hasDraft = false;
          } else {
            d.hasDraft = true;
          }
          break;
        }
        fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2), "utf8");
      }
    } catch (e: any) {
      console.warn("[save] failed to update _index.json:", e.message);
    }
  }

  // ============ 4. sidecar-манифест (как раньше) ============
  if (generated && typeof generated === "object") {
    try {
      if (
        typeof generated.domainId === "string" &&
        typeof generated.profile === "string" &&
        Array.isArray(generated.entities)
      ) {
        for (const ent of generated.entities) {
          if (
            !ent ||
            typeof ent.entityId !== "string" ||
            !Array.isArray(ent.blocks)
          )
            continue;
          const blocks = ent.blocks.filter(
            (b: any) =>
              b &&
              typeof b.blockId === "string" &&
              typeof b.hash === "string" &&
              typeof b.title === "string",
          );
          const orphanedIds = Array.isArray(ent.orphanedIds)
            ? ent.orphanedIds.filter((s: any) => typeof s === "string")
            : undefined;
          mergeGeneratedManifest(rootDir, {
            domainId: generated.domainId,
            entityId: ent.entityId,
            profile: generated.profile,
            blocks,
            orphanedIds,
          });
        }
      }
    } catch (e: any) {
      console.warn("[manifest] write failed:", e.message);
    }
  }

  const response: SaveResponse = {
    ok: true,
    bytes: Buffer.byteLength(content, "utf8"),
    action,
    draft,
    publish,
  };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response));
}

// ============ GET /file/previous?path=... ============

export function handleFilePrevious(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
): void {
  const url = new URL(req.url!, "http://localhost");
  const filePath = url.searchParams.get("path");
  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing path");
    return;
  }

  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(rootDir);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Path outside root");
    return;
  }

  const prevPath = resolvePreviousPath(rootResolved, resolved);
  if (!fs.existsSync(prevPath)) {
    // 204 No Content вместо 404 — браузер не сыплет ошибками в консоль
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const content = fs.readFileSync(prevPath, "utf8");
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(content);
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(e.message);
  }
}

// ============ GET /file/fresh?path=... ============
// В remote-режиме отдаёт актуальный sourceCode экспертизы с сервера.
// Файл в кэше НЕ перезаписывает — это read-only операция.
// В local/hybrid-режиме и при любой ошибке API — fallback на локальный файл.

export async function handleFileFresh(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
  mode: "local" | "hybrid" | "remote",
  credentials: RemoteCredentials | null,
  domainIndex: Map<string, DomainPublishInfo> | null,
): Promise<void> {
  const url = new URL(req.url!, "http://localhost");
  const filePath = url.searchParams.get("path");
  if (!filePath) {
    res.writeHead(400);
    res.end("Missing path");
    return;
  }

  // Только remote и только при наличии кредов и индекса
  if (mode !== "remote" || !credentials || !domainIndex) {
    handleFileRequest(req, res, rootDir);
    return;
  }

  // filePath → sourceId (basename без .ro)
  const baseName = path.basename(filePath).replace(/\.ro$/i, "");
  const info = domainIndex.get(baseName);
  if (!info) {
    console.warn(
      `[fresh] ${baseName}: не найден в _index.json — fallback на локальный кэш`,
    );
    handleFileRequest(req, res, rootDir);
    return;
  }

  let fetched: ExpertiseSourceResult;
  try {
    fetched = await withTokenRefresh(credentials, (t) =>
      apiFetchExpertiseSource(
        credentials.apiUrl,
        t,
        credentials.tenantId,
        info.id,
        credentials.secure,
      ),
    );
  } catch (e: any) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  if (!fetched.source || typeof fetched.source !== "string") {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Пустой sourceCode от сервера" }));
    return;
  }

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Source": fetched.fromDraft ? "draft" : "published",
    };
    if (fetched.meta.publishedVersion) {
      headers["X-Published-Version"] = fetched.meta.publishedVersion;
    }
    if (fetched.meta.updatedAt) {
      headers["X-Updated-At"] = fetched.meta.updatedAt;
    }
    if (fetched.meta.updatedBy) {
      // http-заголовки требуют ASCII. Кириллица в displayName — encodeURIComponent.
      try {
        headers["X-Updated-By"] = encodeURIComponent(fetched.meta.updatedBy);
      } catch {
        /* ignore */
      }
    }
    res.writeHead(200, headers);
    res.end(fetched.source);
}

// ============ GET /file/published?path=... ============
// Возвращает ТОЛЬКО опубликованную версию (никогда не draft).
// Используется в UI для diff «draft vs published».
// В local/hybrid — fallback на локальный файл, без заголовка.

export async function handleFilePublished(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
  mode: "local" | "hybrid" | "remote",
  credentials: RemoteCredentials | null,
  domainIndex: Map<string, DomainPublishInfo> | null,
): Promise<void> {
  const url = new URL(req.url!, "http://localhost");
  const filePath = url.searchParams.get("path");
  if (!filePath) {
    res.writeHead(400);
    res.end("Missing path");
    return;
  }

  if (mode !== "remote" || !credentials || !domainIndex) {
    handleFileRequest(req, res, rootDir);
    return;
  }

  const baseName = path.basename(filePath).replace(/\.ro$/i, "");
  const info = domainIndex.get(baseName);
  if (!info) {
    handleFileRequest(req, res, rootDir);
    return;
  }

    let fetched: ExpertisePublishedResult;
    try {
      fetched = await withTokenRefresh(credentials, (t) =>
        apiFetchExpertisePublished(
          credentials.apiUrl,
          t,
          credentials.tenantId,
          info.id,
          credentials.secure,
        ),
      );
    } catch (e: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }

    if (!fetched.source || typeof fetched.source !== "string") {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Пустой sourceCode от сервера" }));
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Source": "published",
    };
    if (fetched.meta.publishedVersion) {
      headers["X-Published-Version"] = fetched.meta.publishedVersion;
    }
    res.writeHead(200, headers);
    res.end(fetched.source);
}