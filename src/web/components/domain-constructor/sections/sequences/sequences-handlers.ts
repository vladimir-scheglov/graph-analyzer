import type { YamlDocument } from "../../yaml/document";

export function addSequence(
  doc: YamlDocument,
  data: { id: string; startFrom: number; description?: string },
): void {
  const arr = doc.get(["sequences"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["sequences", idx], {
    id: data.id,
    startFrom: data.startFrom,
    ...(data.description ? { description: data.description } : {}),
  });
}

export function updateSequenceField(
  doc: YamlDocument,
  seqId: string,
  field: string,
  value: unknown,
): void {
  const arr = doc.get(["sequences"]);
  if (!Array.isArray(arr)) return;
  const idx = arr.findIndex((s: any) => s && s.id === seqId);
  if (idx < 0) return;
  doc.set(["sequences", idx, field], value);
}

export function deleteSequence(doc: YamlDocument, seqId: string): void {
  const arr = doc.get(["sequences"]);
  if (!Array.isArray(arr)) return;
  const idx = arr.findIndex((s: any) => s && s.id === seqId);
  if (idx < 0) return;
  doc.doc.deleteIn(["sequences", idx] as any);
}
