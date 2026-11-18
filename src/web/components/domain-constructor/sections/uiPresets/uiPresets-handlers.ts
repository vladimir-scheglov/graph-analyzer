import type { YamlDocument } from "../../yaml/document";

export function findUiPresetIndex(doc: YamlDocument, id: string): number {
  const arr = doc.get(["uiPresets"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((p: any) => p && p.id === id);
}

export function addUiPreset(
  doc: YamlDocument,
  data: { id: string; name?: string },
): void {
  const arr = doc.get(["uiPresets"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["uiPresets", idx], {
    id: data.id,
    ...(data.name ? { name: data.name } : {}),
    props: {},
  });
}

export function updateUiPresetTop(
  doc: YamlDocument,
  id: string,
  field: "name" | "description",
  value: unknown,
): void {
  const idx = findUiPresetIndex(doc, id);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["uiPresets", idx, field] as any);
  } else {
    doc.set(["uiPresets", idx, field], value);
  }
}

export function addPresetProp(
  doc: YamlDocument,
  id: string,
  key: string,
  value: string,
): void {
  const idx = findUiPresetIndex(doc, id);
  if (idx < 0) return;
  doc.set(["uiPresets", idx, "props", key], value);
}

export function removePresetProp(
  doc: YamlDocument,
  id: string,
  key: string,
): void {
  const idx = findUiPresetIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["uiPresets", idx, "props", key] as any);
}

export function updatePresetProp(
  doc: YamlDocument,
  id: string,
  oldKey: string,
  newKey: string,
  value: string,
): void {
  const idx = findUiPresetIndex(doc, id);
  if (idx < 0) return;
  if (oldKey !== newKey) {
    doc.doc.deleteIn(["uiPresets", idx, "props", oldKey] as any);
  }
  doc.set(["uiPresets", idx, "props", newKey], value);
}

export function deleteUiPreset(doc: YamlDocument, id: string): void {
  const idx = findUiPresetIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["uiPresets", idx] as any);
}

export function validateUiPresetId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id))
    return "Только латинские буквы, цифры и _";
  return null;
}
