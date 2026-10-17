import { useEffect } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { useGraphFilters } from "./useGraphFilters";

/**
 * Глобальные горячие клавиши приложения.
 * Регистрируется на document в фазе capture, чтобы срабатывать раньше инпутов.
 */
export function useHotkeys() {
  const pushNav = useGraphStore((s) => s.pushNav);
  const navBack = useGraphStore((s) => s.navBack);
  const navForward = useGraphStore((s) => s.navForward);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const toggleBookmark = useGraphStore((s) => s.toggleBookmark);
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const searchOpen = useGraphStore((s) => s.searchOpen);
  const setHelpOpen = useGraphStore((s) => s.setHelpOpen);
  const setHotkeysOpen = useGraphStore((s) => s.setHotkeysOpen);
  const setRulesOpen = useGraphStore((s) => s.setRulesOpen);
  const setIsolatedOnly = useGraphStore((s) => s.setIsolatedOnly);
  const setNsMode = useGraphStore((s) => s.setNsMode);
  const setFilters = useGraphStore((s) => s.setFilters);
  const setTooltipsEnabled = useGraphStore((s) => s.setTooltipsEnabled);
  const setSidePanelEnabled = useGraphStore((s) => s.setSidePanelEnabled);
  const rfInstance = useGraphStore((s) => s.rfInstance);
  const setFocusNode = useGraphStore((s) => s.setFocusNode);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setSelectedEdgeId = useGraphStore((s) => s.setSelectedEdgeId);
  const setCycleHighlight = useGraphStore((s) => s.setCycleHighlight);
  const setPathResult = useGraphStore((s) => s.setPathResult);
  const setPathSel = useGraphStore((s) => s.setPathSel);
  const setPathMode = useGraphStore((s) => s.setPathMode);
  const setContextMenu = useGraphStore((s) => s.setContextMenu);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName || "";
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
          if (target.isContentEditable) return;
        }

        const ctrl = e.ctrlKey || e.metaKey;
        const alt = e.altKey;
        const shift = e.shiftKey;
        const code = e.code;
        const k = e.key;

        // Command palette
        if (ctrl && !shift && !alt && code === "KeyK") {
          e.preventDefault();
          setSearchOpen(true);
          return;
        }
        if (shift && k === "Tab") {
          e.preventDefault();
          setSearchOpen(!searchOpen);
          return;
        }

        // Навигация
        if (alt && k === "ArrowLeft") {
          e.preventDefault();
          navBack();
          return;
        }
        if (alt && k === "ArrowRight") {
          e.preventDefault();
          navForward();
          return;
        }

        if (ctrl && shift && !alt) {
          if (code === "KeyE") {
            e.preventDefault();
            useGraphStore.getState().setEntityCatalogInitialFqid(null);
            useGraphStore.getState().setEntityCatalogOpen(true);
            return;
          }
          if (code === "KeyA") {
            e.preventDefault();
            useGraphStore.getState().setAttributeFinderOpen(true);
            return;
          }
          if (code === "KeyM") {
            e.preventDefault();
            useGraphStore.getState().setEntityMatrixOpen(true);
            return;
          }

          if (code === "KeyK") {
            e.preventDefault();
            useGraphStore.getState().setEntityGraphOpen(true);
            return;
          }

          if (code === "KeyV") {
            e.preventDefault();
            useGraphStore.getState().setModelValidationOpen(true);
            return;
          }

          if (code === "KeyG") {
            e.preventDefault();
            useGraphStore.getState().setGlossaryOpen(true);
            return;
          }

          if (code === "KeyL") {
            e.preventDefault();
            useGraphStore.getState().setLintOpen(true);
            return;
          }

          if (code === "KeyB") {
            e.preventDefault();
            useGraphStore.getState().setAttributeMatrixOpen(true);
            return;
          }
          if (code === "KeyY") {
            e.preventDefault();
            useGraphStore.getState().setMartinOpen(true);
            return;
          }
          if (code === "KeyP") {
            e.preventDefault();
            useGraphStore.getState().setPiiOpen(true);
            return;
          }
        }
        if (ctrl || alt) return;

        // Fit view
        if (code === "KeyF") {
          e.preventDefault();
          if (rfInstance) {
            try {
              rfInstance.fitView({ duration: 500 });
            } catch {}
          }
          return;
        }

        // Изолированные
        if (code === "KeyI") {
          e.preventDefault();
          setIsolatedOnly((v) => !v);
          return;
        }

        // Агрегация по семействам
        if (code === "KeyS") {
          e.preventDefault();
          setNsMode((v) => !v);
          return;
        }

        // Тултипы
        if (code === "KeyT") {
          e.preventDefault();
          setTooltipsEnabled((v) => !v);
          return;
        }

        // Правая панель
        if (code === "KeyD") {
          e.preventDefault();
          setSidePanelEnabled((v) => !v);
          return;
        }

        // Скрыть/показать все связи
        if (code === "KeyE") {
          e.preventDefault();
          setFilters((f) => {
            const bothOn = f.linkage && f.fqid;
            if (bothOn) return { ...f, linkage: false, fqid: false };
            return { ...f, linkage: true, fqid: true };
          });
          return;
        }

        // Правила
        if (code === "KeyR") {
          e.preventDefault();
          setRulesOpen(true);
          return;
        }

        // Закладки
        if (code === "KeyB" && selectedNodeId) {
          e.preventDefault();
          toggleBookmark(selectedNodeId);
          return;
        }

        // Esc — снять всё
        if (k === "Escape") {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          setFocusNode(null);
          setPathResult(null);
          setPathSel([]);
          setCycleHighlight(null);
          setContextMenu(null);
          setPathMode(null);
          return;
        }

        // Zoom
        if (k === "+" || k === "=") {
          e.preventDefault();
          if (rfInstance) {
            try {
              rfInstance.zoomTo(rfInstance.getZoom() * 1.3, { duration: 200 });
            } catch {}
          }
          return;
        }
        if (k === "-" || k === "_") {
          e.preventDefault();
          if (rfInstance) {
            try {
              rfInstance.zoomTo(rfInstance.getZoom() / 1.3, { duration: 200 });
            } catch {}
          }
          return;
        }
        if (code === "Digit0" && !ctrl && !alt) {
          e.preventDefault();
          if (rfInstance) {
            try {
              rfInstance.fitView({ duration: 300, padding: 0.15 });
            } catch {}
          }
          return;
        }

        // Справка
        if (k === "F1") {
          e.preventDefault();
          setHelpOpen(true);
          return;
        }
        if (k === "?") {
          e.preventDefault();
          setHotkeysOpen(true);
          return;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[hotkey error]", err);
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [
    searchOpen,
    setSearchOpen,
    navBack,
    navForward,
    selectedNodeId,
    toggleBookmark,
    rfInstance,
    setHelpOpen,
    setHotkeysOpen,
    setRulesOpen,
    setIsolatedOnly,
    setNsMode,
    setFilters,
    setTooltipsEnabled,
    setSidePanelEnabled,
    setFocusNode,
    setSelectedNodeId,
    setSelectedEdgeId,
    setCycleHighlight,
    setPathResult,
    setPathSel,
    setPathMode,
    setContextMenu,
  ]);
}
