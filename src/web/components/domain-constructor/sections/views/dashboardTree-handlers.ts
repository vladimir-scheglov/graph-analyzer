import type { YamlDocument } from "../../yaml/document";
import { findViewIndex } from "./views-handlers";

export function addTreeItem(
  doc: YamlDocument,
  viewId: string,
  parentPath: readonly (string | number)[] | null,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;

  const newItem = { view: "", label: "" };

  if (parentPath === null) {
    const tree = doc.get(["views", vIdx, "tree"]);
    const i = Array.isArray(tree) ? tree.length : 0;
    doc.set(["views", vIdx, "tree", i], newItem);
  } else {
    const children = doc.get([...parentPath, "children"]);
    const i = Array.isArray(children) ? children.length : 0;
    doc.set([...parentPath, "children", i], newItem);
  }
}

export function removeTreeItem(
  doc: YamlDocument,
  viewId: string,
  path: readonly (string | number)[],
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn(["views", vIdx, ...path] as any);
}

export function updateTreeItemField(
  doc: YamlDocument,
  viewId: string,
  path: readonly (string | number)[],
  field: string,
  value: unknown,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(["views", vIdx, ...path, field], value);
}
