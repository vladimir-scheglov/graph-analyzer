import path from "path";
import fs from "fs";
import { DomainAnalyzer } from "../../core/analyzer/DomainAnalyzer";
import { startServer } from "../../server/http-server";
import { error } from "../../core/utils/logger";

export function serveLocal(dirPath: string, port: number): void {
  const rootDir = path.resolve(dirPath);
  if (!fs.existsSync(rootDir)) {
    error("Directory does not exist: " + rootDir);
    process.exit(1);
  }

  console.log("🔍 Analyzing domains in: " + rootDir);
  const analyzer = new DomainAnalyzer(rootDir);
  const graphData = analyzer.analyze();
  (analyzer as any).__graphData = graphData;

  // Готовим refresh-команду (недоступна для local режима)
  startServer({
    port,
    rootDir,
    analyzer,
    remoteInfo: null,
    credentials: null,
    refreshCommand: null,
    mode: "local",
  });
}
