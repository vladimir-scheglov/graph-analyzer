import fs from "fs";
import path from "path";

const TEMPLATE_PATH = path.join(__dirname, "..", "web", "index.html");

let cachedTemplate: string | null = null;

function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = fs.readFileSync(TEMPLATE_PATH, "utf8");
  return cachedTemplate;
}

export function renderHTML(
  graphData: any,
  remoteInfo: any | null,
  refreshCommand: string | null,
): string {
  const safeGraphData = JSON.stringify(graphData).replace(
    /<\/script>/g,
    "<\\/script>",
  );
  const safeRemoteInfo = JSON.stringify(remoteInfo).replace(
    /<\/script>/g,
    "<\\/script>",
  );
  const safeRefresh = JSON.stringify(refreshCommand).replace(
    /<\/script>/g,
    "<\\/script>",
  );

  return loadTemplate()
    .replace("__GRAPH_DATA__", () => safeGraphData)
    .replace("__REMOTE_INFO__", () => safeRemoteInfo)
    .replace("__REFRESH_COMMAND__", () => safeRefresh);
}
