import { useGraphStore } from "../state/useGraphStore";

/**
 * Открыть файл схемы в модалке YamlViewer.
 * fqid — опционально, чтобы сразу проскроллить к нужной сущности.
 */
export function openFileInEditor(
  filePath: string,
  fqid: string | null = null,
): void {
  if (!filePath) return;

  const store = useGraphStore.getState();
  store.setYamlViewerFilePath(filePath);
  store.setYamlViewerFqid(fqid);

  // Определяем domainId из индекса
  let domainId: string | null = null;
  const nodes = store.nodes;
  for (const n of nodes) {
    if (n.data?.filePath === filePath) {
      domainId = n.data.domainId || null;
      break;
    }
  }
  store.setYamlViewerDomainId(domainId);
  store.setYamlViewerOpen(true);
}
