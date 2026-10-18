import type { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import { readJsonBody } from "../../core/remote/http-client";

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
const PREVIOUS_DIR = ".previous";

function resolvePreviousPath(rootDir: string, filePath: string): string {
  const rel = path.relative(rootDir, filePath);
  return path.join(rootDir, PREVIOUS_DIR, rel);
}

export async function handleFileSave(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
  isRemoteMode: boolean,
): Promise<void> {
  if (isRemoteMode) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Сохранение недоступно в режиме --server." }),
    );
    return;
  }

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
  // Запрещаем сохранять файлы внутри .previous
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

  try {
    // Бэкап текущего содержимого перед записью
    if (fs.existsSync(resolved)) {
      const prevPath = resolvePreviousPath(rootResolved, resolved);
      fs.mkdirSync(path.dirname(prevPath), { recursive: true });
      fs.copyFileSync(resolved, prevPath);
    }
    fs.writeFileSync(resolved, content, "utf8");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ ok: true, bytes: Buffer.byteLength(content, "utf8") }),
    );
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}

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
    // Отдаём 204 No Content вместо 404, чтобы браузер не сыпал ошибками в консоль
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
