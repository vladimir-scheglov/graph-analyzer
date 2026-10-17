import { useCallback, useEffect, useMemo, useRef } from "react";
import { useGraphStore } from "../state/useGraphStore";

const HIDE_DELAY = 250;
const SHOW_DELAY = 120;

declare global {
  interface Window {
    __tooltipHovered?: boolean;
    __lastMouse?: { x: number; y: number };
    __healthTooltip?: { html: string; x: number; y: number };
  }
}

/**
 * Логика тултипов — только функции. НЕ подписывается на store.tooltip,
 * чтобы родительские компоненты (App) не ре-рендерились при каждом hover.
 *
 * Подписка на tooltip и позиционирование — в HoverTooltip.
 */
export function useTooltip() {
  const setTooltip = useGraphStore((s) => s.setTooltip);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cache = useRef(new Map<string, string>());

  // Трекинг позиции мыши для проверки границ при скрытии
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      window.__lastMouse = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  // Health tooltip события от узлов
  useEffect(() => {
    const onShow = () => {
      if (!window.__healthTooltip) return;
      const ht = window.__healthTooltip;
      useGraphStore.getState().setTooltip({
        html: ht.html,
        x: ht.x + 12,
        y: ht.y + 12,
        anchorX: ht.x,
        anchorY: ht.y,
      });
    };
    const onHide = () => useGraphStore.getState().setTooltip(null);
    document.addEventListener("show-health-tooltip", onShow);
    document.addEventListener("hide-health-tooltip", onHide);
    return () => {
      document.removeEventListener("show-health-tooltip", onShow);
      document.removeEventListener("hide-health-tooltip", onHide);
    };
  }, []);

  const show = useCallback(
    (html: string, event: { clientX: number; clientY: number }) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setTooltip({
        html,
        x: event.clientX + 16,
        y: event.clientY + 16,
        anchorX: event.clientX,
        anchorY: event.clientY,
      });
    },
    [setTooltip],
  );

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (window.__tooltipHovered) return;

      const el = document.querySelector(".tooltip") as HTMLElement | null;
      const m = window.__lastMouse;
      if (el && m) {
        const rect = el.getBoundingClientRect();
        const pad = 40;
        if (
          m.x >= rect.left - pad &&
          m.x <= rect.right + pad &&
          m.y >= rect.top - pad &&
          m.y <= rect.bottom + pad
        ) {
          // Мышь рядом — повторим проверку
          scheduleHide();
          return;
        }
      }
      useGraphStore.getState().setTooltip(null);
    }, HIDE_DELAY);
  }, []);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    useGraphStore.getState().setTooltip(null);
    window.__tooltipHovered = false;
  }, []);

  const showForNode = useCallback(
    (
      nodeId: string,
      htmlBuilder: () => string,
      event: { clientX: number; clientY: number },
    ) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        let html = cache.current.get(nodeId);
        if (!html) {
          html = htmlBuilder();
          cache.current.set(nodeId, html);
        }
        show(html, event);
      }, SHOW_DELAY);
    },
    [show],
  );

  const clearCache = useCallback(() => {
    cache.current.clear();
  }, []);

  // Возврат стабильного объекта — функции не зависят от значения tooltip
  return useMemo(
    () => ({ show, hide, scheduleHide, showForNode, clearCache }),
    [show, hide, scheduleHide, showForNode, clearCache],
  );
}
