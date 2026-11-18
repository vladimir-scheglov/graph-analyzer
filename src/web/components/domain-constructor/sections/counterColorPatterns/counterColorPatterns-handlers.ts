import type { YamlDocument } from "../../yaml/document";

const KEY = "counterColorPattern";

export function addPattern(doc: YamlDocument, data: { id: string }): void {
  const arr = doc.get([KEY]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set([KEY, idx], { id: data.id, red: "80%", yellow: "50%" });
}

export function updatePatternField(
  doc: YamlDocument,
  patternId: string,
  field: "red" | "yellow",
  value: string,
): void {
  const arr = doc.get([KEY]);
  if (!Array.isArray(arr)) return;
  const idx = arr.findIndex((p: any) => p && p.id === patternId);
  if (idx < 0) return;
  doc.set([KEY, idx, field], value);
}

export function deletePattern(doc: YamlDocument, patternId: string): void {
  const arr = doc.get([KEY]);
  if (!Array.isArray(arr)) return;
  const idx = arr.findIndex((p: any) => p && p.id === patternId);
  if (idx < 0) return;
  doc.doc.deleteIn([KEY, idx] as any);
}
