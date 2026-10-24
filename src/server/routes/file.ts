import type { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import { readJsonBody } from "../../core/remote/http-client";
import { loadYaml } from "../../core/analyzer/yaml-loader";
import { apiLogin, withTokenRefresh } from "../../core/remote/auth";
import { apiPublishExpertise } from "../../core/remote/schemas-loader";
import type {
  DomainPublishInfo,
  PublishResult,
  RemoteCredentials,
  SaveResponse,
} from "../../shared/types";
import { apiFetchExpertiseSource } from "../../core/remote/schemas-loader";

// ============ GET /file?path=... ============

export function handleFileRequest(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const url = new URL(req.url!, "http://localhost");
  const filePath = url.searchParams.get("path");
  if (!filePath) {
    res.writeHead(400);
    res.end("Missing path");
    return;
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
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

async function tryPublish(
  content: string,
  credentials: RemoteCredentials,
  domainIndex: Map<string, DomainPublishInfo>,
): Promise<PublishResult> {
  // 1. Парсим YAML — нужен id (FQDN) для поиска в _index.json
  let sourceId: string | null = null;
  try {
    const { data } = loadYaml(content);
    if (data && typeof data === "object" && typeof data.id === "string") {
      sourceId = data.id;
    }
  } catch (e: any) {
    return { ok: false, error: "YAML parse: " + e.message };
  }

  if (!sourceId) {
    return { ok: false, error: "В схеме не задан id (FQDN домена)" };
  }

  const info = domainIndex.get(sourceId);
  if (!info) {
    return {
      ok: false,
      error: `Домен ${sourceId} не найден в _index.json кэша`,
      hint: "Публикация возможна только для доменов, скачанных через --server",
    };
  }

  // 2. Ensure token
  const formatError = (e: any): PublishResult => {
    const code = String(e?.code || "");
    let hint: string | undefined;
    if (code === "EXPERTISE.PUBLISH.LOWER_VERSION") {
      hint =
        "Увеличьте version в схеме — она должна быть больше, чем на сервере";
    }
    return {
      ok: false,
      error: e?.message || "Ошибка публикации",
      code,
      hint,
    };
  };

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
    return formatError(e);
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

  // ============ 2. Publish (только remote) ============
  let publish: PublishResult | null = null;
  if (mode === "remote" && credentials && domainIndex) {
    publish = await tryPublish(content, credentials, domainIndex);
  }

  // ============ 3. Обновить _index.json (только при успешной publish) ============
  // Иначе analyzer.reset() при следующем rebuild прочитает старую version
  // и в UI будет «устаревшая» версия. А следующий save упрётся в LOWER_VERSION.
  if (publish && publish.ok && publish.domain && mode === "remote") {
    try {
      const idxPath = path.join(rootResolved, "_index.json");
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
        let newVersion: string | null = null;
        try {
          const { data } = loadYaml(content);
          if (
            data &&
            typeof data === "object" &&
            typeof data.version === "string"
          ) {
            newVersion = data.version;
          }
        } catch {
          /* ignore — YAML уже валидирован при сохранении */
        }

        for (const d of idx.domains || []) {
          if (d.id === publish.domain!.id) {
            if (newVersion) d.version = newVersion;
            d.updatedAt = new Date().toISOString();
            break;
          }
        }
        fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2), "utf8");
      }
    } catch (e: any) {
      // Не блокируем ответ клиенту — publish уже прошёл
      console.warn("[publish] failed to update _index.json:", e.message);
    }
  }

  const response: SaveResponse = {
    ok: true,
    bytes: Buffer.byteLength(content, "utf8"),
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
    handleFileRequest(req, res);
    return;
  }

  // filePath → sourceId (basename без .ro)
  const baseName = path.basename(filePath).replace(/\.ro$/i, "");
  const info = domainIndex.get(baseName);
  if (!info) {
    console.warn(
      `[fresh] ${baseName}: не найден в _index.json — fallback на локальный кэш`,
    );
    handleFileRequest(req, res);
    return;
  }

  let sourceCode: string;
  try {
    sourceCode = await withTokenRefresh(credentials, (t) =>
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

  if (!sourceCode || typeof sourceCode !== "string") {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Пустой sourceCode от сервера" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(sourceCode);
}
