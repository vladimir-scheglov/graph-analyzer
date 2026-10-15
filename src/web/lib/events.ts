/**
 * Кастомные события между компонентами.
 * Используются там, где действие требует глобальной логики (findCycles, openFile),
 * чтобы не тащить её через props drilling.
 */
export const EVT_FIND_CYCLES = "dg:find-cycles";
export const EVT_OPEN_FILE = "dg:open-file";

export function dispatchFindCycles(): void {
  document.dispatchEvent(new CustomEvent(EVT_FIND_CYCLES));
}

export function dispatchOpenFile(
  filePath: string,
  fqid: string | null = null,
): void {
  document.dispatchEvent(
    new CustomEvent(EVT_OPEN_FILE, { detail: { filePath, fqid } }),
  );
}
