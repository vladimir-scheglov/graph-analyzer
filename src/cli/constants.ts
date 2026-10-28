import path from "path";

let cached: string | null = null;

/**
 * Возвращает форму вызова CLI, которой пользователь может
 * воспользоваться в терминале. Используется в help, error-подсказках
 * и refreshCommand (toast).
 *
 * Примеры возвращаемого значения:
 *   "npm start --"          — при запуске через npm_lifecycle_event
 *   "node dist/index.js"    — при прямом запуске node xxx.js
 *   "graph-analyzer"        — установленный bin
 *
 * Можно переопределить через GRAPH_ANALYZER_CMD — на случай кастомной
 * упаковки (electron-wrapper, docker-entrypoint, alias в shell и т.п.).
 */
export function getCliInvocation(): string {
  if (cached) return cached;

  const override = process.env.GRAPH_ANALYZER_CMD;
  if (override) {
    cached = override;
    return cached;
  }

  const lifecycleEvent = process.env.npm_lifecycle_event;
  if (lifecycleEvent) {
    cached = `npm run ${lifecycleEvent} --`;
    return cached;
  }

  const argv1 = process.argv[1] || "";
  const argv0 = process.argv[0] || "node";

  // Прямой запуск node <script>.js — показываем относительный путь,
  // если он в текущей директории, иначе абсолютный.
  if (/\.(c|m)?js$/i.test(argv1)) {
    const rel = path.relative(process.cwd(), argv1);
    cached = rel.startsWith("..") ? `${argv0} ${argv1}` : `${argv0} ${rel}`;
    return cached;
  }

  // Установленный bin: /usr/local/bin/graph-analyzer → graph-analyzer
  if (argv1) {
    cached = path.basename(argv1);
    return cached;
  }

  cached = "graph-analyzer";
  return cached;
}
