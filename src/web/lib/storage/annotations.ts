// src/web/lib/storage/annotations.ts
import { idbDelete, idbGetAll, idbPut } from "./idb";

const STORE = "annotations";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  // Копия — на случай, если внутри listener'а отпишутся
  const snapshot = Array.from(listeners);
  for (const fn of snapshot) {
    try {
      fn();
    } catch {
      /* ignore — один сломанный подписчик не должен ломать остальных */
    }
  }
}

export type AnnotationKind =
  | "domain"
  | "entity"
  | "edge"
  | "attribute"
  | "view"
  | "action"
  | "linkage"
  | "dataRule";

export type AnnotationColor = "red" | "yellow" | "green" | "blue";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  /** FQID или FQID#attrId / domain/viewId — зависит от kind. */
  target: string;
  domainId: string;
  text: string;
  color: AnnotationColor;
  author: string;
  createdAt: number;
  resolvedAt?: number;
}

function uid(): string {
  return `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Хранилище TODO-аннотаций. Живёт в IDB, а не в YAML — чтобы не засорять
 * схему и не терять при pull/publish.
 */
export const annotationsStore = {
  async list(): Promise<Annotation[]> {
    const all = await idbGetAll<Annotation>(STORE);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },

  async listForTarget(target: string): Promise<Annotation[]> {
    const all = await this.list();
    return all.filter((a) => a.target === target && !a.resolvedAt);
  },

  async byDomain(): Promise<Map<string, Annotation[]>> {
    const all = await this.list();
    const m = new Map<string, Annotation[]>();
    for (const a of all) {
      if (a.resolvedAt) continue;
      if (!m.has(a.domainId)) m.set(a.domainId, []);
      m.get(a.domainId)!.push(a);
    }
    return m;
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  async add(input: Omit<Annotation, "id" | "createdAt">): Promise<Annotation> {
    const ann: Annotation = {
      ...input,
      id: uid(),
      createdAt: Date.now(),
    };
    await idbPut(STORE, ann);
    notify();
    return ann;
  },

  async update(
    id: string,
    patch: Partial<Pick<Annotation, "text" | "color" | "resolvedAt">>,
  ): Promise<void> {
    const all = await this.list();
    const cur = all.find((a) => a.id === id);
    if (!cur) return;
    await idbPut(STORE, { ...cur, ...patch });
    notify();
  },

  async delete(id: string): Promise<void> {
    await idbDelete(STORE, id);
    notify();
  },
};
