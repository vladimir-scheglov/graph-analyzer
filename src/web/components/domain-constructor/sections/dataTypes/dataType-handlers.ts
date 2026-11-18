import type { YamlDocument } from "../../yaml/document";

// ============ DataTypes ============

export function findDataTypeIndex(doc: YamlDocument, dtId: string): number {
  const arr = doc.get(["dataTypes"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((d: any) => d && d.id === dtId);
}

import { isSeq } from "yaml";

export function addDataType(
  doc: YamlDocument,
  data: {
    id: string;
    kind: "Enum" | "Workflow" | "Table";
    name?: string;
    extra?: Record<string, unknown>;
  },
): number {
  const base: Record<string, unknown> = {
    id: data.id,
    dataType: data.kind,
    ...(data.name ? { name: data.name } : {}),
  };
  if (data.kind === "Enum") base.values = [];
  else if (data.kind === "Workflow") {
    base.statuses = [];
    base.transitions = [];
  } else if (data.kind === "Table") {
    base.attributes = [];
    base.view = { columns: [] };
  }
  if (data.extra) {
    for (const [k, v] of Object.entries(data.extra)) {
      if (v !== undefined) base[k] = v;
    }
  }
  return doc.appendToArray(["dataTypes"], base);
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

// ============ Duplicate ============

export function duplicateDataType(
  doc: YamlDocument,
  sourceId: string,
  newId: string,
): void {
  const source = findDataTypeIndex(doc, sourceId);
  if (source < 0) return;
  const src = doc.get(["dataTypes", source]) as Record<string, unknown>;
  if (!src) return;

  const arr = doc.get(["dataTypes"]);
  const idx = Array.isArray(arr) ? arr.length : 0;

  const clone = structuredClone(src);
  clone.id = newId;
  doc.set(["dataTypes", idx], clone);
}

export function generateCopyId(doc: YamlDocument, sourceId: string): string {
  const existing = (doc.get(["dataTypes"]) as any[]) ?? [];
  let newId = `${sourceId}_copy`;
  let n = 1;
  while (existing.some((d) => d?.id === newId))
    newId = `${sourceId}_copy_${n++}`;
  return newId;
}

// ============ Bulk ============

export interface BulkEnumItem {
  id?: string;
  name?: string;
  color?: string;
  hidden?: boolean;
}

export function bulkAddEnumValues(
  doc: YamlDocument,
  dtId: string,
  items: BulkEnumItem[],
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  const existing = (doc.get(["dataTypes", idx, "values"]) as any[]) ?? [];
  const arr = [...existing];
  const usedIds = new Set(arr.map((v: any) => v?.id));

  for (const item of items) {
    const rawName = (item.name ?? "").trim();
    const rawId = (item.id ?? "").trim();
    let id = rawId || slugify(rawName) || `value${arr.length + 1}`;
    const base = id;
    let n = 1;
    while (usedIds.has(id)) id = `${base}_${n++}`;
    usedIds.add(id);

    arr.push({
      id,
      ...(rawName ? { name: rawName } : {}),
      ...(item.hidden ? { hidden: true } : {}),
    });

    if (item.color) {
      setEnumColor(doc, dtId, id, item.color);
    }
  }
  doc.set(["dataTypes", idx, "values"], arr);
}

export function bulkAddStatuses(
  doc: YamlDocument,
  dtId: string,
  names: string[],
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  const existing = (doc.get(["dataTypes", idx, "statuses"]) as any[]) ?? [];
  const arr = [...existing];
  const usedIds = new Set(arr.map((s: any) => s?.id));

  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    let id = slugify(trimmed) || `status${arr.length + 1}`;
    const base = id;
    let n = 1;
    while (usedIds.has(id)) id = `${base}_${n++}`;
    usedIds.add(id);
    arr.push({ id, name: trimmed });
  }
  doc.set(["dataTypes", idx, "statuses"], arr);
}

export function copyWorkflowMatrix(
  doc: YamlDocument,
  targetId: string,
  sourceId: string,
): number {
  const sIdx = findDataTypeIndex(doc, sourceId);
  const tIdx = findDataTypeIndex(doc, targetId);
  if (sIdx < 0 || tIdx < 0) return 0;

  const srcTransitions =
    (doc.get(["dataTypes", sIdx, "transitions"]) as any[]) ?? [];
  const tgtStatuses = new Set(
    ((doc.get(["dataTypes", tIdx, "statuses"]) as any[]) ?? []).map(
      (s) => s?.id,
    ),
  );

  const copied = srcTransitions.filter(
    (t: any) => tgtStatuses.has(t?.from) && tgtStatuses.has(t?.to),
  );
  doc.set(["dataTypes", tIdx, "transitions"], copied);
  return copied.length;
}

// ============ Sync columns ============

export function syncColumnsFromAttributes(
  doc: YamlDocument,
  dtId: string,
): number {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return 0;
  const attrs = (doc.get(["dataTypes", idx, "attributes"]) as any[]) ?? [];
  const existing =
    (doc.get(["dataTypes", idx, "view", "columns"]) as any[]) ?? [];
  const usedAttrs = new Set(existing.map((c: any) => c?.attribute));
  const usedIds = new Set(existing.map((c: any) => c?.id));

  const toAdd: any[] = [];
  for (const a of attrs) {
    if (!a?.id || usedAttrs.has(a.id)) continue;
    let colId = a.id;
    const base = colId;
    let n = 1;
    while (usedIds.has(colId)) colId = `${base}_${n++}`;
    usedIds.add(colId);
    toAdd.push({
      id: colId,
      attribute: a.id,
      ...(a.name ? { label: a.name } : {}),
    });
  }
  if (toAdd.length === 0) return 0;
  doc.set(["dataTypes", idx, "view", "columns"], [...existing, ...toAdd]);
  return toAdd.length;
}

// ============ Export / import ============

export function exportDataTypeAsJson(doc: YamlDocument, dtId: string): string {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return "";
  const dt = doc.get(["dataTypes", idx]);
  return JSON.stringify(dt, null, 2);
}

export function importDataTypeFromJson(
  doc: YamlDocument,
  json: string,
): { id: string } | { error: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { error: "Невалидный JSON" };
  }
  if (!parsed || typeof parsed !== "object")
    return { error: "Ожидался объект" };
  if (typeof parsed.id !== "string" || !parsed.id)
    return { error: "Нет поля id" };
  if (!["Enum", "Workflow", "Table"].includes(parsed.dataType)) {
    return { error: "dataType должен быть Enum / Workflow / Table" };
  }
  const existing = (doc.get(["dataTypes"]) as any[]) ?? [];
  if (existing.some((d) => d?.id === parsed.id)) {
    return { error: `Тип с id «${parsed.id}» уже существует` };
  }
  const arr = doc.get(["dataTypes"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["dataTypes", idx], parsed);
  return { id: parsed.id };
}

// ============ Утилиты ============

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 63);
}

// ============ Валидация типа ============

export interface DataTypeValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateDataType(
  doc: YamlDocument,
  dtId: string,
): DataTypeValidationResult {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return { errors: ["Тип не найден"], warnings: [] };

  const dt = doc.get(["dataTypes", idx]) as any;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!dt?.id) errors.push("Не задан id");
  if (!dt?.dataType) errors.push("Не задан dataType");

  if (dt?.dataType === "Enum") {
    const values = (dt.values ?? []) as any[];
    if (values.length === 0) warnings.push("Перечисление без значений");
    const used = new Set<string>();
    for (const v of values) {
      if (!v?.id) {
        errors.push("Значение без id");
        continue;
      }
      if (used.has(v.id)) errors.push(`Дубликат id значения «${v.id}»`);
      used.add(v.id);
    }
  }

  if (dt?.dataType === "Workflow") {
    const statuses = (dt.statuses ?? []) as any[];
    if (statuses.length < 2) warnings.push("Workflow: нужно ≥ 2 статуса");
    if (!dt.initial) errors.push("Workflow: не задан initial");
    else if (!statuses.some((s) => s?.id === dt.initial)) {
      errors.push(`Workflow: initial «${dt.initial}» не среди статусов`);
    }
    const used = new Set<string>();
    for (const s of statuses) {
      if (!s?.id) {
        errors.push("Статус без id");
        continue;
      }
      if (used.has(s.id)) errors.push(`Дубликат id статуса «${s.id}»`);
      used.add(s.id);
    }
    for (const t of (dt.transitions ?? []) as any[]) {
      if (t?.from !== "*" && !used.has(t?.from)) {
        errors.push(`Переход: from «${t?.from}» не среди статусов`);
      }
      if (t?.to !== "*" && !used.has(t?.to)) {
        errors.push(`Переход: to «${t?.to}» не среди статусов`);
      }
    }
  }

  if (dt?.dataType === "Table") {
    const attrs = (dt.attributes ?? []) as any[];
    if (attrs.length === 0) warnings.push("Таблица без колонок");
    const used = new Set<string>();
    for (const a of attrs) {
      if (!a?.id) {
        errors.push("Колонка без id");
        continue;
      }
      if (used.has(a.id)) errors.push(`Дубликат id колонки «${a.id}»`);
      used.add(a.id);
    }
    const cols = (dt.view?.columns ?? []) as any[];
    for (const c of cols) {
      if (c?.attribute && !used.has(c.attribute)) {
        warnings.push(
          `Колонка «${c.id}»: attribute «${c.attribute}» не существует`,
        );
      }
    }
  }

  return { errors, warnings };
}

// ============ Constraints колонок таблицы ============

export function addTableAttributeConstraint(
  doc: YamlDocument,
  dtId: string,
  attrIdx: number,
  kind: string,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.appendToArray(["dataTypes", idx, "attributes", attrIdx, "constraints"], {
    kind,
  });
}

export function removeTableAttributeConstraint(
  doc: YamlDocument,
  dtId: string,
  attrIdx: number,
  constraintIdx: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.doc.deleteIn([
    "dataTypes",
    idx,
    "attributes",
    attrIdx,
    "constraints",
    constraintIdx,
  ] as any);
}

export function updateTableAttributeConstraintField(
  doc: YamlDocument,
  dtId: string,
  attrIdx: number,
  constraintIdx: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  const path = [
    "dataTypes",
    idx,
    "attributes",
    attrIdx,
    "constraints",
    constraintIdx,
    field,
  ];
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(path as any);
  } else {
    doc.set(path, value);
  }
}
// ============ Sorting для Table ============

export function addTableSorting(doc: YamlDocument, dtId: string): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.appendToArray(["dataTypes", idx, "sorting"], (i) => ({
    id: `sort${i + 1}`,
    by: [],
  }));
}

export function removeTableSorting(
  doc: YamlDocument,
  dtId: string,
  i: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataTypes", idx, "sorting", i] as any);
}

export function updateTableSortingField(
  doc: YamlDocument,
  dtId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["dataTypes", idx, "sorting", i, field] as any);
  } else {
    doc.set(["dataTypes", idx, "sorting", i, field], value);
  }
}

export function addTableSortingBy(
  doc: YamlDocument,
  dtId: string,
  sortIdx: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.appendToArray(["dataTypes", idx, "sorting", sortIdx, "by"], {
    attribute: "",
    direction: "asc",
  });
}

export function removeTableSortingBy(
  doc: YamlDocument,
  dtId: string,
  sortIdx: number,
  i: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataTypes", idx, "sorting", sortIdx, "by", i] as any);
}

export function updateTableSortingByField(
  doc: YamlDocument,
  dtId: string,
  sortIdx: number,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.set(["dataTypes", idx, "sorting", sortIdx, "by", i, field], value);
}

// ============ view.sortingBy ============

export function addSortingByColumn(doc: YamlDocument, dtId: string): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.appendToArray(["dataTypes", idx, "view", "sortingBy", "columns"], {
    column: "",
    sorting: "",
  });
}

export function removeSortingByColumn(
  doc: YamlDocument,
  dtId: string,
  i: number,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.doc.deleteIn([
    "dataTypes",
    idx,
    "view",
    "sortingBy",
    "columns",
    i,
  ] as any);
}

export function updateSortingByColumn(
  doc: YamlDocument,
  dtId: string,
  i: number,
  field: "column" | "sorting",
  value: string,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  doc.set(["dataTypes", idx, "view", "sortingBy", "columns", i, field], value);
}

export function updateSortingByDefault(
  doc: YamlDocument,
  dtId: string,
  column: string | undefined,
  direction: "asc" | "desc" | undefined,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  if (!column) {
    doc.doc.deleteIn(["dataTypes", idx, "view", "sortingBy", "default"] as any);
  } else {
    doc.set(["dataTypes", idx, "view", "sortingBy", "default"], {
      column,
      direction: direction ?? "asc",
    });
  }
}

// ============ view.paging ============

export function updatePaging(
  doc: YamlDocument,
  dtId: string,
  sizes: number[] | undefined,
  defaultSize: number | undefined,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  if ((!sizes || sizes.length === 0) && defaultSize === undefined) {
    doc.doc.deleteIn(["dataTypes", idx, "view", "paging"] as any);
    return;
  }
  const obj: Record<string, unknown> = {};
  if (sizes && sizes.length > 0) obj.sizes = sizes;
  if (defaultSize !== undefined) obj.defaultSize = defaultSize;
  doc.set(["dataTypes", idx, "view", "paging"], obj);
}

// ============ Валидация ID ============

export function validateTableAttributeId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (id.length > 30) return "Не более 30 символов";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) {
    return "Только латинские буквы, цифры и _; начинается с буквы";
  }
  return null;
}

export function validateStatusId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (id.length > 30) return "Не более 30 символов";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) {
    return "Только латинские буквы, цифры и _; начинается с буквы";
  }
  return null;
}

export function addTableSortingForDefault(
  doc: YamlDocument,
  dtId: string,
): void {
  const idx = findDataTypeIndex(doc, dtId);
  if (idx < 0) return;
  // при необходимости создаём view.sortingBy.default = { column: '', direction: 'asc' }
  const existing = doc.get(["dataTypes", idx, "view", "sortingBy", "default"]);
  if (!existing) {
    doc.set(["dataTypes", idx, "view", "sortingBy", "default"], {
      column: "",
      direction: "asc",
    });
  }
}