import { useGraphStore } from "../state/useGraphStore";

export function openFileInEditor(
  filePath: string,
  fqid: string | null = null,
  domainIdHint: string | null = null,
): void {
  if (!filePath) return;

  const store = useGraphStore.getState();
  store.setYamlViewerFilePath(filePath);
  store.setYamlViewerFqid(fqid);

  // 1. Явный hint
  let domainId: string | null = domainIdHint;

  // 2. Из fqid (первый сегмент до /)
  if (!domainId && fqid) {
    const slash = fqid.indexOf("/");
    if (slash > 0) domainId = fqid.slice(0, slash).toLowerCase();
  }

  // 3. По filePath из узлов
  if (!domainId) {
    for (const n of store.nodes) {
      if (n.data?.filePath === filePath) {
        domainId = n.data.domainId || null;
        break;
      }
    }
  }

  // 4. По имени файла (обычно <domainId>.ro)
  if (!domainId) {
    const baseName = filePath.split(/[/\\]/).pop() || "";
    const candidate = baseName.replace(/\.ro$/i, "");
    if (candidate && candidate.includes(".") && candidate.includes("/") === false) {
      domainId = candidate.toLowerCase();
    }
  }

  store.setYamlViewerDomainId(domainId);
  store.setYamlViewerOpen(true);
}