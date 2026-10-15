import { useGraphStore } from "../state/useGraphStore";

/**
 * Единая точка открытия файла в Monaco.
 * Доступна из любого места — читает стор напрямую через getState().
 */
export function openFileInEditor(
  filePath: string,
  fqid: string | null = null,
): void {
  if (!filePath) return;
  const store = useGraphStore.getState();
  store.setEditorFilePath(filePath);
  store.setPanelTab("file");
  store.setPanelOpen(true);

  fetch("/file?path=" + encodeURIComponent(filePath))
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then((content) => {
      useGraphStore.getState().setPendingFile({
        content,
        fqid: fqid || null,
        ts: Date.now(),
      });
    })
    .catch((err) => {
      useGraphStore.getState().setPendingFile({
        content: "// Не удалось загрузить файл: " + err.message,
        fqid: null,
        ts: Date.now(),
      });
    });
}
