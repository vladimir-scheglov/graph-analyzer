// src/web/lib/storage/snapshots.ts
import { idbDelete, idbGet, idbPut } from "./idb";

const STORE = "snapshots";
const LEGACY_A = "dg-snapshot-a";
const LEGACY_B = "dg-snapshot-b";

export type SnapshotSlot = "A" | "B";

export interface SnapshotEnvelope {
  slot: SnapshotSlot;
  snapshot: any;
  savedAt: number;
}

export const snapshotsStore = {
  async get(slot: SnapshotSlot): Promise<any | null> {
    const rec = await idbGet<SnapshotEnvelope>(STORE, slot);
    if (rec) return rec.snapshot;

    // Миграция legacy
    const legacyKey = slot === "A" ? LEGACY_A : LEGACY_B;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(legacyKey);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      await idbPut<SnapshotEnvelope>(STORE, {
        slot,
        snapshot: parsed,
        savedAt:
          typeof parsed?.savedAt === "number"
            ? new Date(parsed.savedAt).getTime()
            : Date.now(),
      });
      localStorage.removeItem(legacyKey);
      return parsed;
    } catch {
      localStorage.removeItem(legacyKey);
      return null;
    }
  },

  async put(slot: SnapshotSlot, snapshot: any): Promise<void> {
    if (snapshot == null) {
      await idbDelete(STORE, slot);
      return;
    }
    await idbPut<SnapshotEnvelope>(STORE, {
      slot,
      snapshot,
      savedAt: Date.now(),
    });
  },

  async delete(slot: SnapshotSlot): Promise<void> {
    await idbDelete(STORE, slot);
    try {
      localStorage.removeItem(slot === "A" ? LEGACY_A : LEGACY_B);
    } catch {
      /* ignore */
    }
  },
};
