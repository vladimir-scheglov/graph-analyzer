import type { YamlDocument } from "../../yaml/document";
import { findViewIndex } from "../views/views-handlers";

export type GroupType =
  | "block"
  | "tab"
  | "form"
  | "tabs"
  | "resizableblockpair";
export type GroupComponentKind = "widget" | "block";

export const GROUP_TYPES: Array<{
  value: GroupType;
  label: string;
  /** Какие kind можно класть в components[]. */
  allowedComponentKinds: GroupComponentKind[];
  /** Сколько компонентов (для resizableblockpair — ровно 2). */
  fixedCount?: number;
}> = [
  { value: "block", label: "Блок", allowedComponentKinds: ["widget", "block"] },
  {
    value: "tab",
    label: "Вкладка",
    allowedComponentKinds: ["widget", "block"],
  },
  { value: "form", label: "Форма", allowedComponentKinds: ["widget", "block"] },
  { value: "tabs", label: "Группа вкладок", allowedComponentKinds: ["block"] },
  {
    value: "resizableblockpair",
    label: "Блок из двух секций",
    allowedComponentKinds: ["block"],
    fixedCount: 2,
  },
];

// ============ Поиск / CRUD ============

export function findGroupIndex(
  doc: YamlDocument,
  viewId: string,
  groupId: string,
): number {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return -1;
  const groups = doc.get(["views", vIdx, "groups"]);
  if (!Array.isArray(groups)) return -1;
  return groups.findIndex((g: any) => g && g.id === groupId);
}

export function addGroup(
  doc: YamlDocument,
  viewId: string,
  data: { id: string; type: GroupType; description?: string },
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const groups = doc.get(["views", vIdx, "groups"]);
  const i = Array.isArray(groups) ? groups.length : 0;

  const base: Record<string, unknown> = {
    id: data.id,
    type: data.type,
    ...(data.description ? { description: data.description } : {}),
  };

  if (data.type === "block" || data.type === "tab") {
    base.label = "";
  }
  if (data.type === "block" || data.type === "tab" || data.type === "form") {
    base.components = [];
  }
  if (data.type === "tabs" || data.type === "resizableblockpair") {
    base.components = [];
  }

  doc.set(["views", vIdx, "groups", i], base);
}

export function updateGroupField(
  doc: YamlDocument,
  viewId: string,
  groupId: string,
  field: string,
  value: unknown,
): void {
  const gIdx = findGroupIndex(doc, viewId, groupId);
  if (gIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["views", vIdx, "groups", gIdx, field] as any);
  } else {
    doc.set(["views", vIdx, "groups", gIdx, field], value);
  }
}

export function updateGroupLayoutField(
  doc: YamlDocument,
  viewId: string,
  groupId: string,
  field: string,
  value: unknown,
): void {
  const gIdx = findGroupIndex(doc, viewId, groupId);
  if (gIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  if (value === undefined || value === null) {
    doc.doc.deleteIn(["views", vIdx, "groups", gIdx, "layout", field] as any);
  } else {
    doc.set(["views", vIdx, "groups", gIdx, "layout", field], value);
  }
}

export function deleteGroup(
  doc: YamlDocument,
  viewId: string,
  groupId: string,
): void {
  const gIdx = findGroupIndex(doc, viewId, groupId);
  if (gIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  doc.doc.deleteIn(["views", vIdx, "groups", gIdx] as any);
}

export function changeGroupType(
  doc: YamlDocument,
  viewId: string,
  groupId: string,
  newType: GroupType,
): void {
  const gIdx = findGroupIndex(doc, viewId, groupId);
  if (gIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  const group = doc.get(["views", vIdx, "groups", gIdx]) as Record<
    string,
    unknown
  >;
  if (!group) return;
  const base: Record<string, unknown> = {
    id: group.id,
    type: newType,
    ...(group.description ? { description: group.description } : {}),
  };
  if (newType === "block" || newType === "tab" || newType === "form") {
    base.components = [];
  } else {
    base.components = [];
  }
  doc.set(["views", vIdx, "groups", gIdx], base);
}

// ============ Components ============

export function addGroupComponent(
  doc: YamlDocument,
  viewId: string,
  groupId: string,
  kind: GroupComponentKind,
): void {
  const gIdx = findGroupIndex(doc, viewId, groupId);
  if (gIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  const item: Record<string, unknown> = {};
  item[kind] = "";
  doc.appendToArray(["views", vIdx, "groups", gIdx, "components"], item);
}

export function removeGroupComponent(
  doc: YamlDocument,
  viewId: string,
  groupId: string,
  i: number,
): void {
  const gIdx = findGroupIndex(doc, viewId, groupId);
  if (gIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  doc.doc.deleteIn(["views", vIdx, "groups", gIdx, "components", i] as any);
}

export function updateGroupComponentField(
  doc: YamlDocument,
  viewId: string,
  groupId: string,
  i: number,
  kind: GroupComponentKind,
  id: string,
): void {
  const gIdx = findGroupIndex(doc, viewId, groupId);
  if (gIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  // Очищаем другой ключ (widget / block)
  const other = kind === "widget" ? "block" : "widget";
  doc.doc.deleteIn([
    "views",
    vIdx,
    "groups",
    gIdx,
    "components",
    i,
    other,
  ] as any);
  doc.set(["views", vIdx, "groups", gIdx, "components", i, kind], id);
}

// ============ Валидация ============

export function validateGroupId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (id.length > 63) return "Не более 63 символов";
  if (!/^[A-Za-z][A-Za-z0-9_:#@$]*$/.test(id)) {
    return "Допустимы латинские буквы, цифры, _ : # @ $";
  }
  return null;
}

export function getGroupTypeLabel(type: string): string {
  return GROUP_TYPES.find((t) => t.value === type)?.label ?? type;
}
