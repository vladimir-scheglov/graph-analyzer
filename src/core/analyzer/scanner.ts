import fs from "fs";
import path from "path";

export function scanDirectory(dir: string): string[] {
  const result: string[] = [];

  // Игнорируемые папки
  const IGNORED_DIRS = new Set([
    ".previous",
    ".git",
    "node_modules",
    ".cache",
    "dist",
    "build",
  ]);

  function walk(current: string): void {
    try {
      const files = fs.readdirSync(current);
      for (const file of files) {
        // Пропускаем системные папки
        if (IGNORED_DIRS.has(file)) continue;

        const fullPath = path.join(current, file);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (file.endsWith(".ro")) {
          result.push(fullPath);
        }
      }
    } catch (error: any) {
      console.error(`Error reading directory ${current}: ${error.message}`);
    }
  }

  walk(dir);
  return result;
}
