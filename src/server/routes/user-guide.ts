import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";

/** Кандидаты в порядке приоритета. */
function resolveGuidePath(): string | null {
  const candidates = [
    // <pkg>/dist/USER_GUIDE.md — copy:userguide
    path.resolve(__dirname, "..", "..", "USER_GUIDE.md"),
    // <pkg>/USER_GUIDE.md — files: ["USER_GUIDE.md"]
    path.resolve(__dirname, "..", "..", "..", "USER_GUIDE.md"),
    // dev: tsx src/index.ts, cwd = корень проекта
    path.resolve(process.cwd(), "USER_GUIDE.md"),
    // fallback: родитель cwd (npm start --prefix)
    path.resolve(process.cwd(), "..", "USER_GUIDE.md"),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function handleUserGuide(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  try {
    const guidePath = resolveGuidePath();
    if (!guidePath) {
      // 200 с markdown-объяснением — UI покажет текст, а не «Ошибка: HTTP 404»
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(
        [
          "# Справка недоступна",
          "",
          "Файл `USER_GUIDE.md` не найден ни в пакете, ни в текущей директории.",
          "",
          "**Что делать:**",
          "",
          "1. Проверьте, что пакет установлен корректно:",
          "   ```bash",
          '   ls "$(npm root -g)/domains-analyzer/dist/USER_GUIDE.md"',
          "   ```",
          "2. Если файла нет — переустановите:",
          "   ```bash",
          "   npm install -g domains-analyzer@latest",
          "   ```",
          "3. Как временное решение — запустить `domna` из директории, где лежит `USER_GUIDE.md`:",
          "   ```bash",
          '   cd "$(npm root -g)/domains-analyzer" && domna --help',
          "   ```",
          "",
          "Текущий `cwd`: `" + process.cwd() + "`",
          "Расположение пакета: `" + path.resolve(__dirname, "..", "..") + "`",
        ].join("\n"),
      );
      return;
    }

    const content = fs.readFileSync(guidePath, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch (e: any) {
    // Самая частая причина — нет прав на чтение или файл битый
    res.writeHead(500, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
    res.end(
      "# Ошибка чтения USER_GUIDE.md\n\n" +
        "```\n" +
        (e?.message || String(e)) +
        "\n```",
    );
  }
}
