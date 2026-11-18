import type { YamlDocument } from "../../yaml/document";

// ============ Поиск ============

export function findTransitiveIndex(doc: YamlDocument, id: string): number {
  const arr = doc.get(["transitiveLinkages"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((t: any) => t && t.id === id);
}

/** Путь к узлу join по его id. Возвращает полный путь. */
export function findJoinPath(
  doc: YamlDocument,
  transitiveId: string,
  joinId: string,
): readonly (string | number)[] | null {
  const tIdx = findTransitiveIndex(doc, transitiveId);
  if (tIdx < 0) return null;
  const joins = doc.get(["transitiveLinkages", tIdx, "joins"]);
  if (!Array.isArray(joins)) return null;

  const walk = (
    arr: any[],
    basePath: (string | number)[],
  ): readonly (string | number)[] | null => {
    for (let i = 0; i < arr.length; i++) {
      const j = arr[i];
      if (!j) continue;
      const path = [...basePath, i];
      if (j.id === joinId) return path;
      if (Array.isArray(j.joins)) {
        const found = walk(j.joins, [...path, "joins"]);
        if (found) return found;
      }
    }
    return null;
  };

  return walk(joins, ["transitiveLinkages", tIdx, "joins"]);
}

// ============ CRUD ============

export function addTransitive(
  doc: YamlDocument,
  data: { id: string; entity: string; description?: string },
): void {
  const arr = doc.get(["transitiveLinkages"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["transitiveLinkages", idx], {
    id: data.id,
    entity: data.entity,
    ...(data.description ? { description: data.description } : {}),
    joins: [],
  });
}

export function updateTransitiveField(
  doc: YamlDocument,
  id: string,
  field: string,
  value: unknown,
): void {
  const idx = findTransitiveIndex(doc, id);
  if (idx < 0) return;
  doc.set(["transitiveLinkages", idx, field], value);
}

export function deleteTransitive(doc: YamlDocument, id: string): void {
  const idx = findTransitiveIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["transitiveLinkages", idx] as any);
}

// ============ Joins ============

export function addJoin(
  doc: YamlDocument,
  transitiveId: string,
  parentJoinId: string | null,
): void {
  const tIdx = findTransitiveIndex(doc, transitiveId);
  if (tIdx < 0) return;

  const newJoin = {
    id: `join_${Date.now().toString(36).slice(-6)}`,
    linkage: "",
  };

  if (parentJoinId === null) {
    const joins = doc.get(["transitiveLinkages", tIdx, "joins"]);
    const i = Array.isArray(joins) ? joins.length : 0;
    doc.set(["transitiveLinkages", tIdx, "joins", i], newJoin);
    return;
  }

  const parentPath = findJoinPath(doc, transitiveId, parentJoinId);
  if (!parentPath) return;
  const siblings = doc.get([...parentPath, "joins"]);
  const i = Array.isArray(siblings) ? siblings.length : 0;
  doc.set([...parentPath, "joins", i], newJoin);
}

export function removeJoin(
  doc: YamlDocument,
  transitiveId: string,
  joinId: string,
): void {
  const path = findJoinPath(doc, transitiveId, joinId);
  if (!path) return;
  doc.doc.deleteIn(path as any);
}

export function updateJoinField(
  doc: YamlDocument,
  transitiveId: string,
  joinId: string,
  field: string,
  value: unknown,
): void {
  const path = findJoinPath(doc, transitiveId, joinId);
  if (!path) return;
  doc.set([...path, field], value);
}

export function updateJoinSearch(
  doc: YamlDocument,
  transitiveId: string,
  joinId: string,
  enabled: boolean,
  mode?: "entity" | "linkage" | "both",
): void {
  const path = findJoinPath(doc, transitiveId, joinId);
  if (!path) return;
  if (!enabled) {
    doc.doc.deleteIn([...path, "search"] as any);
    return;
  }
  doc.set([...path, "search"], {
    enabled: true,
    ...(mode ? { mode } : {}),
  });
}
