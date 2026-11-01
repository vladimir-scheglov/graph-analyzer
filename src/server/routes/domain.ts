import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { readJsonBody } from "../../core/remote/http-client";
import { withTokenRefresh } from "../../core/remote/auth";
import {
  apiSaveDomainSchemaObject,
  apiSaveExpertiseDraft,
  apiDeleteExpertise,
} from "../../core/remote/schemas-loader";
import { sanitizeFileName } from "../../core/utils/file-utils";
import type { ServerState } from "../state";

interface CreateDomainBody {
  id: string;
  name: string;
  author?: string;
  description?: string;
  tags?: string[];
  version?: string;
  folderId?: string; // remote
  folderPath?: string; // local/hybrid
  templateYaml?: string; // готовое YAML-тело без header
}

interface DeleteDomainBody {
  domainId: string;
  expertiseId?: string; // remote only
}

const FQDN_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/i;

function yamlStr(s: string): string {
  return JSON.stringify(String(s));
}

function buildHeaderYaml(b: CreateDomainBody): string {
  const lines = [
    `id: ${yamlStr(b.id)}`,
    `type: domain`,
    `version: ${yamlStr(b.version || "0.0.1")}`,
    `name: ${yamlStr(b.name)}`,
  ];
  if (b.author) lines.push(`author: ${yamlStr(b.author)}`);
  if (b.description) lines.push(`description: ${yamlStr(b.description)}`);
  if (b.tags?.length) {
    lines.push("tags:");
    b.tags.forEach((t) => lines.push(`  - ${yamlStr(t)}`));
  }
  return lines.join("\n");
}

function resolveLocalFile(
  rootDir: string,
  folderPath: string | undefined,
  domainId: string,
): string {
  const safeFolder = (folderPath || "")
    .replace(/^[\/\\]+/, "")
    .replace(/\\+/g, "/");
  const parts = safeFolder
    .split("/")
    .filter((p) => p && p !== ".." && p !== ".");
  const resolved = path.resolve(
    path.join(rootDir, ...parts, sanitizeFileName(domainId) + ".ro"),
  );
  const rootResolved = path.resolve(rootDir);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    throw new Error("Путь выходит за пределы корневой директории");
  }
  return resolved;
}

/** Восстанавливает относительный путь папки в кэше по folderId из _index.json. */
function resolveCacheFolderPath(idx: any, folderId: string): string {
  if (!idx || !Array.isArray(idx.folders)) return "";
  const byId = new Map<string, any>(idx.folders.map((f: any) => [f.id, f]));
  const parts: string[] = [];
  let cur = byId.get(folderId);
  while (cur && cur.parentFolderId != null) {
    parts.unshift(sanitizeFileName(cur.name));
    cur = byId.get(cur.parentFolderId);
  }
  return parts.join(path.sep);
}

export async function handleCreateDomain(
  req: IncomingMessage,
  res: ServerResponse,
  state: ServerState,
): Promise<void> {
  let body: CreateDomainBody;
  try {
    body = await readJsonBody(req);
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Некорректный JSON: " + e.message }));
    return;
  }

  if (!body.id || !body.name) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "id и name обязательны" }));
    return;
  }
  if (!FQDN_RE.test(body.id)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `id должен быть FQDN (например, my.domain.tld), получено: "${body.id}"`,
      }),
    );
    return;
  }
  if (!state.analyzer) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Analyzer не инициализирован" }));
    return;
  }
  if (state.analyzer.getDomainsMap().has(body.id)) {
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Домен «${body.id}» уже существует` }));
    return;
  }

  const fullYaml =
    buildHeaderYaml(body) +
    "\n" +
    (body.templateYaml ? body.templateYaml + "\n" : "");

  // ============ local / hybrid ============
  if (state.mode === "local" || state.mode === "hybrid") {
    let filePath: string;
    try {
      filePath = resolveLocalFile(
        state.analyzer.getRootDir(),
        body.folderPath,
        body.id,
      );
    } catch (e: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, fullYaml, "utf8");
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Запись файла: " + e.message }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        filePath,
        mode: state.mode,
        expertiseId: null,
      }),
    );
    return;
  }

  // ============ remote ============
  if (!state.credentials || !state.remoteInfo?.cacheDir) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Нет кредов или кэша для remote-режима" }));
    return;
  }
  if (!body.folderId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "folderId обязателен в remote-режиме" }));
    return;
  }

  // 1) создать expertise на BFF
  let expertiseId: string;
  try {
    const created = await withTokenRefresh(state.credentials, (t) =>
      apiSaveDomainSchemaObject(
        state.credentials!.cmsBffUrl,
        t,
        state.credentials!.tenantId,
        {
          draftSchema: {
            data: {},
            metadata: {
              id: body.id,
              name: body.name,
              version: body.version || "0.0.1",
              author: body.author,
              description: body.description,
              tags: body.tags,
            },
          },
          folderId: body.folderId!,
        },
        state.credentials!.secure,
      ),
    );
    expertiseId = created.id;
  } catch (e: any) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "saveDomainSchemaObject: " + (e.message || String(e)),
        code: e.code || null,
      }),
    );
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 2) заполнить sourceCode через saveDraft
  try {
    await withTokenRefresh(state.credentials, (t) =>
      apiSaveExpertiseDraft(
        state.credentials!.apiUrl,
        t,
        state.credentials!.tenantId,
        {
          id: expertiseId,
          folderId: body.folderId!,
          sourceCode: fullYaml,
          type: "DOMAIN",
        },
        state.credentials!.secure,
      ),
    );
  } catch (e: any) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "saveExpertiseDraft: " + (e.message || String(e)),
        code: e.code || null,
      }),
    );
    return;
  }

  // 3) .ro в кэш
  const cacheDir = state.remoteInfo.cacheDir;
  const idxPath = path.join(cacheDir, "_index.json");
  let idx: any = null;
  try {
    if (fs.existsSync(idxPath))
      idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
  } catch {
    /* ignore */
  }

  const folderPathInCache = resolveCacheFolderPath(idx, body.folderId);
  const cacheFilePath = path.join(
    cacheDir,
    folderPathInCache,
    sanitizeFileName(body.id) + ".ro",
  );
  try {
    fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
    fs.writeFileSync(cacheFilePath, fullYaml, "utf8");
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "Создано на сервере, но не удалось записать .ro в кэш: " + e.message,
        expertiseId,
      }),
    );
    return;
  }

  // 4) обновить _index.json и in-memory domainIndex
  const newEntry = {
    id: expertiseId,
    sourceId: body.id,
    folderId: body.folderId,
    type: "DOMAIN",
    name: body.name,
    status: "ENABLED",
    version: body.version || "0.0.1",
    description: body.description || "",
    author: body.author || "",
    tags: body.tags || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    objectType: null,
    hasDraft: true,
    updater: null,
  };
  if (idx && Array.isArray(idx.domains)) {
    idx.domains.push(newEntry);
    try {
      const tmp = idxPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(idx, null, 2), "utf8");
      fs.renameSync(tmp, idxPath);
    } catch {
      /* ignore */
    }
  }
  if (state.domainIndex) {
    state.domainIndex.set(body.id, {
      id: expertiseId,
      folderId: body.folderId,
      sourceId: body.id,
      name: body.name,
    });
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: true,
      filePath: cacheFilePath,
      mode: "remote",
      expertiseId,
    }),
  );
}

// ============ Delete ============

export async function handleDeleteDomain(
  req: IncomingMessage,
  res: ServerResponse,
  state: ServerState,
): Promise<void> {
  let body: DeleteDomainBody;
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
  if (!state.analyzer) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Analyzer не инициализирован" }));
    return;
  }
  const domain = state.analyzer.getDomainsMap().get(body.domainId);
  if (!domain) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Домен «${body.domainId}» не найден` }));
    return;
  }

  const moveToPrevious = (rootDir: string, filePath: string): void => {
    if (!fs.existsSync(filePath)) return;
    const rel = path.relative(rootDir, filePath);
    const prev = path.join(rootDir, ".previous", rel);
    fs.mkdirSync(path.dirname(prev), { recursive: true });
    fs.copyFileSync(filePath, prev);
    fs.unlinkSync(filePath);
  };

  // ============ local / hybrid ============
  if (state.mode === "local" || state.mode === "hybrid") {
    try {
      moveToPrevious(state.analyzer.getRootDir(), domain.filePath);
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Удаление файла: " + e.message }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ ok: true, mode: state.mode, remoteDeleted: false }),
    );
    return;
  }

  // ============ remote ============
  if (!state.credentials || !state.remoteInfo?.cacheDir) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Нет кредов или кэша для remote-режима" }));
    return;
  }
  if (!body.expertiseId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "expertiseId обязателен в remote (id из _index.json, не sourceId)",
      }),
    );
    return;
  }

  // 1) удалить на сервере
  try {
    await withTokenRefresh(state.credentials, (t) =>
      apiDeleteExpertise(
        state.credentials!.apiUrl,
        t,
        state.credentials!.tenantId,
        body.expertiseId!,
        state.credentials!.secure,
      ),
    );
  } catch (e: any) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "deleteExpertise: " + (e.message || String(e)),
        code: e.code || null,
      }),
    );
    return;
  }

  // 2) .ro → .previous
  const cacheDir = state.remoteInfo.cacheDir;
  try {
    moveToPrevious(cacheDir, domain.filePath);
  } catch (e: any) {
    console.warn("[delete-domain] .previous:", e.message);
  }

  // 3) _index.json
  try {
    const idxPath = path.join(cacheDir, "_index.json");
    if (fs.existsSync(idxPath)) {
      const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      if (Array.isArray(idx.domains)) {
        idx.domains = idx.domains.filter(
          (d: any) => String(d.id) !== body.expertiseId,
        );
      }
      const tmp = idxPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(idx, null, 2), "utf8");
      fs.renameSync(tmp, idxPath);
    }
  } catch {
    /* ignore */
  }

  // 4) in-memory
  if (state.domainIndex) state.domainIndex.delete(body.domainId);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, mode: "remote", remoteDeleted: true }));
}
