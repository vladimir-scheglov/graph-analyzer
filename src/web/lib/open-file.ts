import { useGraphStore } from "../state/useGraphStore";
import { confirmDialog } from "./dialogs";

/**
 * Открывает файл в редакторе схем. Возвращает `true`, если файл открыт,
 * `false` — если пользователь отменил переключение (например, из-за
 * несохранённых изменений в текущем файле).
 */
export async function openFileInEditor(
  filePath: string,
  fqid?: string | null,
  domainId?: string,
): Promise<boolean> {
  if (!filePath) return false;

  const st = useGraphStore.getState();
  const currentPath = st.yamlViewerFilePath;
  const isDirty = !!st.yamlViewerDirty;
  const isOpen = !!st.yamlViewerOpen;

  // Тот же файл можно «переоткрыть» без предупреждения
  const isSameFile =
    !!currentPath &&
    currentPath.replace(/\\/g, "/") === filePath.replace(/\\/g, "/");

  if (isOpen && isDirty && !isSameFile) {
    const fileName = currentPath?.split(/[\\/]/).pop() || "текущий файл";
    const ok = await confirmDialog(
      "Есть несохранённые изменения в текущем файле",
      {
        detail:
          `Файл «${fileName}» содержит несохранённые правки.\n\n` +
          `Если переключиться на «${filePath.split(/[\\/]/).pop()}», они будут потеряны.`,
        danger: true,
        confirmLabel: "Переключиться и потерять",
        cancelLabel: "Остаться",
      },
    );
    if (!ok) return false;
  }

  // domainId: аргумент → fqid → basename файла
  let effectiveDomainId = domainId ?? null;
  if (!effectiveDomainId && fqid) {
    const slash = fqid.indexOf("/");
    if (slash > 0) effectiveDomainId = fqid.slice(0, slash);
  }
  if (!effectiveDomainId) {
    const base = filePath.split(/[\\/]/).pop()?.replace(/\.ro$/i, "");
    if (base) effectiveDomainId = base;
  }

  st.setYamlViewerFilePath(filePath);
  st.setYamlViewerFqid(fqid ?? null);
  st.setYamlViewerDomainId(effectiveDomainId);
  st.setYamlViewerOpen(true);
  return true;
}
