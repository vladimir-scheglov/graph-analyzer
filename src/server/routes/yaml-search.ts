import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { scanDirectory } from "../../core/analyzer/scanner";
import { loadYaml } from "../../core/analyzer/yaml-loader";

export interface YamlSearchHit {
  filePath: string;
  domainId: string | null;
  line: number;
  column: number;
  length: number;
  lineText: string;
  contextBefore: string;
  contextAfter: string;
  /** true — строка в комментарии (начинается с #). */
  inComment: boolean;
}

export interface YamlSearchResponse {
  query: string;
  hits: YamlSearchHit[];
  totalHits: number;
  truncated: boolean;
  truncatedByFile: boolean;
  error: string | null;
  elapsedMs: number;
}

const MAX_PER_FILE = 100;
const MAX_TOTAL = 1000;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

function getDomainIdOfFile(filePath: string): string | null {
  try {
    const head = fs.readFileSync(filePath, "utf8");
    const m = head.match(/^id\s*:\s*["']?([^\s"'#]+)["']?/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function handleYamlSearch(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
): void {
  const startedAt = Date.now();
  const url = new URL(req.url!, "http://localhost");
  const query = (url.searchParams.get("q") || "").trim();
  const useRegex = url.searchParams.get("regex") === "1";
  const caseSensitive = url.searchParams.get("case") === "1";
  const includeComments = url.searchParams.get("comments") === "1";
  const domainFilter = url.searchParams.get("domain") || "";

  const sendError = (msg: string) => {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: msg }));
  };

  if (!query) return sendError("query обязателен");

  if (query.length < 2 && !useRegex) {
    return sendError("Минимум 2 символа для поиска");
  }

  let regex: RegExp | null = null;
  if (useRegex) {
    try {
      regex = new RegExp(query, caseSensitive ? "g" : "gi");
    } catch (e: any) {
      return sendError("Невалидный regex: " + e.message);
    }
  }

  const files = scanDirectory(rootDir);
  const hits: YamlSearchHit[] = [];
  let totalHits = 0;
  let truncatedByFile = false;
  const domainFilterLower = domainFilter.toLowerCase();

  for (const filePath of files) {
    if (hits.length >= MAX_TOTAL) {
      truncatedByFile = true;
      break;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_SIZE) continue;

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    // Проверка «это домен?»
    if (!/^type\s*:\s*domain\s*$/m.test(content)) continue;

    const domainId = getDomainIdOfFile(filePath);
    if (
      domainFilterLower &&
      domainId &&
      domainId.toLowerCase() !== domainFilterLower
    )
      continue;

    const lines = content.split("\n");
    const fileHits: YamlSearchHit[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (fileHits.length >= MAX_PER_FILE) {
        truncatedByFile = true;
        break;
      }
      const line = lines[i];
      if (!line) continue;

      const inComment = line.trimStart().startsWith("#");
      if (inComment && !includeComments) continue;

      if (regex) {
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(line)) !== null) {
          if (m[0].length === 0) {
            regex.lastIndex++;
            continue;
          }
          fileHits.push({
            filePath,
            domainId,
            line: i + 1,
            column: m.index + 1,
            length: m[0].length,
            lineText: line,
            contextBefore: line.slice(Math.max(0, m.index - 40), m.index),
            contextAfter: line.slice(
              m.index + m[0].length,
              m.index + m[0].length + 60,
            ),
            inComment,
          });
          totalHits++;
          if (fileHits.length >= MAX_PER_FILE) break;
        }
      } else {
        const needle = caseSensitive ? query : query.toLowerCase();
        const hay = caseSensitive ? line : line.toLowerCase();
        let from = 0;
        while (fileHits.length < MAX_PER_FILE) {
          const idx = hay.indexOf(needle, from);
          if (idx < 0) break;
          fileHits.push({
            filePath,
            domainId,
            line: i + 1,
            column: idx + 1,
            length: query.length,
            lineText: line,
            contextBefore: line.slice(Math.max(0, idx - 40), idx),
            contextAfter: line.slice(
              idx + query.length,
              idx + query.length + 60,
            ),
            inComment,
          });
          totalHits++;
          from = idx + Math.max(1, needle.length);
        }
      }
    }

    hits.push(...fileHits);
  }

  const response: YamlSearchResponse = {
    query,
    hits: hits.slice(0, MAX_TOTAL),
    totalHits,
    truncated: totalHits > MAX_TOTAL,
    truncatedByFile,
    error: null,
    elapsedMs: Date.now() - startedAt,
  };

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(response));
}
