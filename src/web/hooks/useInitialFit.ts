import { useEffect } from "react";
import { useGraphStore } from "../state/useGraphStore";

/**
 * Один раз после первой загрузки — вписать граф в экран.
 * Не мешает пользователю: срабатывает только когда didInitialFit=false.
 */
export function useInitialFit(visibleNodesCount: number): void {
  const rfInstance = useGraphStore((s) => s.rfInstance);
  const didInitialFit = useGraphStore((s) => s.didInitialFit);
  const setDidInitialFit = useGraphStore((s) => s.setDidInitialFit);

  useEffect(() => {
    if (didInitialFit) return;
    if (visibleNodesCount === 0) return;
    if (!rfInstance) return;

    const t = setTimeout(() => {
      if (!rfInstance) return;
      try {
        rfInstance.fitView({ duration: 0, padding: 0.2 });
        setDidInitialFit(true);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [visibleNodesCount, rfInstance, didInitialFit, setDidInitialFit]);
}
