import { useCallback, useEffect, useRef } from "react";
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
 * Логика тултипов: показ с задержкой, скрытие с проверкой границ,
 * авто-репозиционирование, кэш по id узла.
 */
export function useTooltip() {
  const tooltip = useGraphStore((s) => s.tooltip);
  const setTooltip = useGraphStore((s) => s.setTooltip);
  const tooltipsEnabled = useGraphStore((s) => s.tooltipsEnabled);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cache = useRef(new Map<string, string>());

  // Глобально — трекинг позиции мыши для проверки границ при скрытии
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      window.__lastMouse = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  // Слежение за health-tooltip событиями от узлов
  useEffect(() => {
    const onShow = () => {
      if (!window.__healthTooltip) return;
      const ht = window.__healthTooltip;
      setTooltip({
        html: ht.html,
        x: ht.x + 12,
        y: ht.y + 12,
        anchorX: ht.x,
        anchorY: ht.y,
      });
    };
    const onHide = () => setTooltip(null);
    document.addEventListener("show-health-tooltip", onShow);
    document.addEventListener("hide-health-tooltip", onHide);
    return () => {
      document.removeEventListener("show-health-tooltip", onShow);
      document.removeEventListener("hide-health-tooltip", onHide);
    };
  }, [setTooltip]);

  // Скрывать тултип, если тултипы выключены
  useEffect(() => {
    if (!tooltipsEnabled) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setTooltip(null);
      window.__tooltipHovered = false;
    }
  }, [tooltipsEnabled, setTooltip]);

  // Репозиционирование: если тултип не влезает справа/снизу — перебрасываем
  useEffect(() => {
    if (!tooltip) return;
    const el = document.querySelector(".tooltip") as HTMLElement | null;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const margin = 12;
    const gap = 16;
    const ax = tooltip.anchorX != null ? tooltip.anchorX : tooltip.x;
    const ay = tooltip.anchorY != null ? tooltip.anchorY : tooltip.y;

    let x = ax + gap;
    let y = ay + gap;

    if (x + rect.width > window.innerWidth - margin) x = ax - rect.width - gap;
    if (y + rect.height > window.innerHeight - margin)
      y = ay - rect.height - gap;
    if (x < margin) x = margin;
    if (y < margin) y = margin;

    if (x === tooltip.x && y === tooltip.y) return;

    setTooltip((t) => (t ? { ...t, x, y } : null));
  }, [tooltip, setTooltip]);

  /** Показать тултип с готовым HTML */
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

  /** Запланировать скрытие (с проверкой — не рядом ли мышь) */
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
      setTooltip(null);
    }, HIDE_DELAY);
  }, [setTooltip]);

  /** Немедленно скрыть */
  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTooltip(null);
    window.__tooltipHovered = false;
  }, [setTooltip]);

  /** Показать тултип для узла с задержкой и кэшированием */
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

  return {
    tooltip,
    show,
    scheduleHide,
    hide,
    showForNode,
    clearCache,
  };
}
