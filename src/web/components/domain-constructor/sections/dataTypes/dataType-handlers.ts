import type { YamlDocument } from "../../yaml/document";

// ============ DataTypes ============

export function findDataTypeIndex(doc: YamlDocument, dtId: string): number {
  const arr = doc.get(["dataTypes"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((d: any) => d && d.id === dtId);
}

export function addDataType(
  doc: YamlDocument,
  data: { id: string; kind: "Enum" | "Workflow" | "Table"; name?: string },
): void {
  const arr = doc.get(["dataTypes"]);
  const idx = Array.isArray(arr) ? arr.length : 0;

  const base: Record<string, unknown> = {
    id: data.id,
    dataType: data.kind,
    ...(data.name ? { name: data.name } : {}),
  };
  if (data.kind === "Enum") {
    base.values = [];
  } else if (data.kind === "Workflow") {
    base.statuses = [];
    base.transitions = [];
  } else if (data.kind === "Table") {
    base.attributes = [];
    base.view = { columns: [] };
  }
  doc.set(["dataTypes", idx], base);
}

export function updateDataTypeField(
  doc: YamlDocument,
  dtId: string,
  field: string,
  value: unknown,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.set(["dataTypes", idx, field], value);
}

export function deleteDataType(doc: YamlDocument, dtId: string): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataTypes", idx] as any);
}

// ============ Enum values ============

export function addEnumValue(doc: YamlDocument, dtId: string): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.appendToArray(["dataTypes", idx, "values"], (i) => ({
    id: `value${i + 1}`,
    name: "",
  }));
}

export function removeEnumValue(
  doc: YamlDocument,
  dtId: string,
  i: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataTypes", idx, "values", i] as any);
}

export function updateEnumValueField(
  doc: YamlDocument,
  dtId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.set(["dataTypes", idx, "values", i, field], value);
}

export function moveEnumValue(
  doc: YamlDocument,
  dtId: string,
  from: number,
  to: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  const values = doc.get(["dataTypes", idx, "values"]);
  if (!Array.isArray(values)) return;
  if (to < 0 || to >= values.length || from === to) return;
  const copy = [...values];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  doc.set(["dataTypes", idx, "values"], copy);
}

// Enum view (colors)
export function setEnumColor(
  doc: YamlDocument,
  dtId: string,
  valueId: string,
  color: string | undefined,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  const view = (doc.get(["dataTypes", idx, "view"]) as any[]) ?? [];
  const existing = view.findIndex((v: any) => v && v.value === valueId);
  const next = [...view];
  if (color) {
    if (existing >= 0) next[existing] = { ...next[existing], color };
    else next.push({ value: valueId, color });
  } else if (existing >= 0) {
    next.splice(existing, 1);
  }
  if (next.length === 0) {
    doc.doc.deleteIn(["dataTypes", idx, "view"] as any);
  } else {
    doc.set(["dataTypes", idx, "view"], next);
  }
}

// ============ Workflow ============

export function addStatus(doc: YamlDocument, dtId: string): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.appendToArray(["dataTypes", idx, "statuses"], (i) => ({
    id: `status${i + 1}`,
    name: "",
  }));
}

export function removeStatus(doc: YamlDocument, dtId: string, i: number): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  const statuses = doc.get(["dataTypes", idx, "statuses"]) as any[];
  const removedId = statuses?.[i]?.id;
  doc.doc.deleteIn(["dataTypes", idx, "statuses", i] as any);
  // Убираем переходы с этим статусом
  if (removedId) {
    const transitions = doc.get(["dataTypes", idx, "transitions"]) as any[];
    if (Array.isArray(transitions)) {
      const next = transitions.filter(
        (t) => t && t.from !== removedId && t.to !== removedId,
      );
      doc.set(["dataTypes", idx, "transitions"], next);
    }
  }
}

export function updateStatusField(
  doc: YamlDocument,
  dtId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.set(["dataTypes", idx, "statuses", i, field], value);
}

export function setInitialStatus(
  doc: YamlDocument,
  dtId: string,
  statusId: string,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.set(["dataTypes", idx, "initial"], statusId);
}

export function toggleTransition(
  doc: YamlDocument,
  dtId: string,
  from: string,
  to: string,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  const transitions =
    (doc.get(["dataTypes", idx, "transitions"]) as any[]) ?? [];
  const exists = transitions.findIndex(
    (t) => t && t.from === from && t.to === to,
  );
  let next: any[];
  if (exists >= 0) {
    next = transitions.filter((_, i) => i !== exists);
  } else {
    next = [...transitions, { from, to }];
  }
  doc.set(["dataTypes", idx, "transitions"], next);
}

export function setWorkflowColor(
  doc: YamlDocument,
  dtId: string,
  statusId: string,
  color: string | undefined,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  const view = (doc.get(["dataTypes", idx, "view"]) as any[]) ?? [];
  const existing = view.findIndex((v: any) => v && v.status === statusId);
  const next = [...view];
  if (color) {
    if (existing >= 0) next[existing] = { ...next[existing], color };
    else next.push({ status: statusId, color });
  } else if (existing >= 0) {
    next.splice(existing, 1);
  }
  if (next.length === 0) {
    doc.doc.deleteIn(["dataTypes", idx, "view"] as any);
  } else {
    doc.set(["dataTypes", idx, "view"], next);
  }
}

// ============ Table ============

export function addTableAttribute(doc: YamlDocument, dtId: string): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.appendToArray(["dataTypes", idx, "attributes"], (i) => ({
    id: `attribute${i + 1}`,
    dataType: "String",
  }));
}

export function removeTableAttribute(
  doc: YamlDocument,
  dtId: string,
  i: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataTypes", idx, "attributes", i] as any);
}

export function updateTableAttributeField(
  doc: YamlDocument,
  dtId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.set(["dataTypes", idx, "attributes", i, field], value);
}

export function addTableColumn(doc: YamlDocument, dtId: string): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.appendToArray(["dataTypes", idx, "view", "columns"], (i) => ({
    id: `column${i + 1}`,
    attribute: "",
  }));
}

export function removeTableColumn(
  doc: YamlDocument,
  dtId: string,
  i: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataTypes", idx, "view", "columns", i] as any);
}

export function updateTableColumnField(
  doc: YamlDocument,
  dtId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.set(["dataTypes", idx, "view", "columns", i, field], value);
}

// ============ Валидация ============

export function validateDataTypeId(
  id: string,
  kind: "Enum" | "Workflow" | "Table",
): string | null {
  if (!id) return "Идентификатор не может быть пустым";
  if (id.length > 63) return "Не более 63 символов";
  // Data ID для типов: всё с заглавной буквы (String, Uuid, MyTable), но допускаются и строчные
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) {
    return "Только латинские буквы, цифры и _; начинается с буквы";
  }
  return null;
}
