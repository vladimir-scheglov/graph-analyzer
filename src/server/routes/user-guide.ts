import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";

export function handleUserGuide(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  try {
    const guidePath = path.join(process.cwd(), "USER_GUIDE.md");
    const content = fs.readFileSync(guidePath, "utf8");
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("# Справка недоступна\n\nФайл `USER_GUIDE.md` не найден.");
  }
}
