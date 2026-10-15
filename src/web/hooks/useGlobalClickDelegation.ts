import { useEffect } from "react";
import { openFileInEditor } from "../lib/open-file";

/**
 * Глобальное делегирование кликов на HTML-кнопки внутри dangerouslySetInnerHTML
 * (тултипы и details__ref'ы, где React-обработчики не навешиваются):
 *
 *  - .js-open-file   → открыть файл в Monaco
 *  - .js-goto-domain → перейти к домену
 *
 * Слушатель в фазе capture, чтобы поймать клик раньше ReactFlow.
 */
export function useGlobalClickDelegation(
  goto: (domainId: string) => void,
  hideTooltip: () => void,
): void {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;

      const openBtn = target.closest(".js-open-file") as HTMLElement | null;
      if (openBtn) {
        e.stopPropagation();
        e.preventDefault();
        const file = openBtn.getAttribute("data-file");
        const fqid = openBtn.getAttribute("data-fqid");
        if (file) openFileInEditor(file, fqid);
        return;
      }

      const gotoBtn = target.closest(".js-goto-domain") as HTMLElement | null;
      if (gotoBtn) {
        e.stopPropagation();
        e.preventDefault();
        const domain = gotoBtn.getAttribute("data-domain");
        if (!domain) return;
        goto(domain);
        hideTooltip();
        return;
      }
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [goto, hideTooltip]);
}
