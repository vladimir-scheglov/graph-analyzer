import { useCallback } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { createSnapshot, computeDiff, Snapshot } from "../lib/diff";

export interface UseSnapshotsResult {
  save: (slot: "A" | "B") => void;
  load: (slot: "A" | "B") => void;
  clear: (slot: "A" | "B") => void;
  upload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Работа со снимками (save/load/clear/upload).
 * - save — создаёт Snapshot из текущего графа и сохраняет в localStorage через store.
 * - load — считает diff против текущего графа, включает diffMode.
 * - upload — принимает JSON-файл и делает то же, что load.
 */
export function useSnapshots(serverName: string | null): UseSnapshotsResult {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const snapshotA = useGraphStore((s) => s.snapshotA);
  const snapshotB = useGraphStore((s) => s.snapshotB);
  const setSnapshotA = useGraphStore((s) => s.setSnapshotA);
  const setSnapshotB = useGraphStore((s) => s.setSnapshotB);
  const setDiffMode = useGraphStore((s) => s.setDiffMode);
  const showSnackbar = useGraphStore((s) => s.showSnackbar);

  const applyDiff = useCallback(
    (snap: Snapshot) => {
      const diff = computeDiff(nodes, edges, snap);
      if (!diff) {
        alert("Снимок некорректен");
        return;
      }
      setDiffMode({ ...diff, snapshot: snap });
    },
    [nodes, edges, setDiffMode],
  );

  const save = useCallback(
    (slot: "A" | "B") => {
      const snap = createSnapshot(nodes, edges, serverName);
      if (slot === "A") setSnapshotA(snap);
      else setSnapshotB(snap);
      showSnackbar(
        `Снимок сохранён в ${slot} (${snap.stats.nodes} узлов, ${snap.stats.edges} связей)`,
      );
    },
    [nodes, edges, serverName, setSnapshotA, setSnapshotB, showSnackbar],
  );

  const load = useCallback(
    (slot: "A" | "B") => {
      const snap = slot === "A" ? snapshotA : snapshotB;
      if (!snap) return;
      applyDiff(snap);
      showSnackbar(
        `Сравнение со снимком ${slot} от ` +
          new Date(snap.savedAt).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
    },
    [snapshotA, snapshotB, applyDiff, showSnackbar],
  );

  const clear = useCallback(
    (slot: "A" | "B") => {
      if (!confirm("Удалить снимок " + slot + "?")) return;
      if (slot === "A") setSnapshotA(null);
      else setSnapshotB(null);
    },
    [setSnapshotA, setSnapshotB],
  );

  const upload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const snap = JSON.parse(ev.target?.result as string);
          applyDiff(snap);
          showSnackbar("Сравнение с загруженным файлом");
        } catch (err: any) {
          alert("Ошибка чтения снимка: " + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [applyDiff, showSnackbar],
  );

  return { save, load, clear, upload };
}
