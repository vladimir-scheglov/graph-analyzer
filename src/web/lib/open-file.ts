import { useGraphStore } from "../state/useGraphStore";

/**
 * Открывает файл схемы в YAML-редакторе.
 *
 * Если редактор уже открыт на другом файле и есть несохранённые изменения —
 * спрашивает подтверждение. При отмене возвращает false, не меняя состояние.
 *
 * @returns true — файл открыт (или уже был открыт этот же);
 *          false — отменено пользователем либо filePath пуст.
 */
export function openFileInEditor(
  filePath: string,
  fqid: string | null = null,
  domainIdHint: string | null = null,
): boolean {
  if (!filePath) return false;

  const store = useGraphStore.getState();

  // ============ Dirty-check при переключении ============
  // Срабатывает только если редактор уже открыт на ДРУГОМ файле.
  // Открытие того же файла (из линтера повторно) — без confirm.
  if (
    store.yamlViewerOpen &&
    store.yamlViewerFilePath &&
    store.yamlViewerFilePath !== filePath &&
    store.yamlViewerDirty
  ) {
    const ok = window.confirm(
      "Есть несохранённые изменения в текущем файле.\n\n" +
        "Переключиться на другой файл без сохранения?",
    );
    if (!ok) return false;
  }

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
    if (
      candidate &&
      candidate.includes(".") &&
      candidate.includes("/") === false
    ) {
      domainId = candidate.toLowerCase();
    }
  }

  store.setYamlViewerDomainId(domainId);
  store.setYamlViewerOpen(true);
  return true;
}
