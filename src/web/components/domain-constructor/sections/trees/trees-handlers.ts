import type { YamlDocument } from "../../yaml/document";

export function findTreeIndex(doc: YamlDocument, id: string): number {
  const arr = doc.get(["trees"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((t: any) => t && t.id === id);
}

export function addTree(
  doc: YamlDocument,
  data: { id: string; rootEntity: string },
): void {
  const arr = doc.get(["trees"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["trees", idx], {
    id: data.id,
    hierarchy: { entity: data.rootEntity, children: [] },
  });
}

export function updateTreeField(
  doc: YamlDocument,
  id: string,
  field: string,
  value: unknown,
): void {
  const idx = findTreeIndex(doc, id);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["trees", idx, field] as any);
  } else {
    doc.set(["trees", idx, field], value);
  }
}

export function updateHierarchyField(
  doc: YamlDocument,
  id: string,
  field: string,
  value: unknown,
): void {
  const idx = findTreeIndex(doc, id);
  if (idx < 0) return;
  doc.set(["trees", idx, "hierarchy", field], value);
}

export function addHierarchyChild(
  doc: YamlDocument,
  id: string,
  parentPath: readonly (string | number)[] | null,
): void {
  const idx = findTreeIndex(doc, id);
  if (idx < 0) return;

  const newChild = { linkage: "", entity: "" };

  if (parentPath === null) {
    const children = doc.get(["trees", idx, "hierarchy", "children"]);
    const i = Array.isArray(children) ? children.length : 0;
    doc.set(["trees", idx, "hierarchy", "children", i], newChild);
  } else {
    const children = doc.get([...parentPath, "children"]);
    const i = Array.isArray(children) ? children.length : 0;
    doc.set([...parentPath, "children", i], newChild);
  }
}

export function removeHierarchyChild(
  doc: YamlDocument,
  id: string,
  path: readonly (string | number)[],
): void {
  const idx = findTreeIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["trees", idx, "hierarchy", ...path] as any);
}

export function updateHierarchyChildField(
  doc: YamlDocument,
  id: string,
  path: readonly (string | number)[],
  field: string,
  value: unknown,
): void {
  const idx = findTreeIndex(doc, id);
  if (idx < 0) return;
  doc.set(["trees", idx, "hierarchy", ...path, field], value);
}

// Sorting
export function addTreeSorting(doc: YamlDocument, treeId: string): void {
  const idx = findTreeIndex(doc, treeId);
  if (idx < 0) return;
  const arr = doc.get(["trees", idx, "sorting"]);
  const i = Array.isArray(arr) ? arr.length : 0;
  doc.set(["trees", idx, "sorting", i], {
    id: `sort${i + 1}`,
    by: [],
  });
}

export function removeTreeSorting(
  doc: YamlDocument,
  treeId: string,
  i: number,
): void {
  const idx = findTreeIndex(doc, treeId);
  if (idx < 0) return;
  doc.doc.deleteIn(["trees", idx, "sorting", i] as any);
}

export function deleteTree(doc: YamlDocument, id: string): void {
  const idx = findTreeIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["trees", idx] as any);
}

export function validateTreeId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id))
    return "Только латинские буквы, цифры и _";
  return null;
}
