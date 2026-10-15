import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";

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
