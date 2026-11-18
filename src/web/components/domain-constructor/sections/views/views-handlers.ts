import type { YamlDocument } from "../../yaml/document";

export type ViewType =
  | "entity"
  | "list"
  | "tabs_list"
  | "tree"
  | "dashboard"
  | "dashboard_tree";

export const VIEW_TYPES: Array<{
  value: ViewType;
  label: string;
  needsEntity: boolean;
}> = [
  { value: "entity", label: "Представление объекта", needsEntity: true },
  { value: "list", label: "Список объектов", needsEntity: true },
  { value: "tabs_list", label: "Списки на вкладках", needsEntity: false },
  { value: "tree", label: "Дерево связей", needsEntity: false },
  { value: "dashboard", label: "Дашборд", needsEntity: false },
  {
    value: "dashboard_tree",
    label: "Навигация по дашбордам",
    needsEntity: false,
  },
];

// ============ Поиск / CRUD ============

export function findViewIndex(doc: YamlDocument, viewId: string): number {
  const arr = doc.get(["views"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((v: any) => v && v.id === viewId);
}

export function addView(
  doc: YamlDocument,
  data: { id: string; type: ViewType; entity?: string; label?: string },
): void {
  const arr = doc.get(["views"]);
  const idx = Array.isArray(arr) ? arr.length : 0;

  const base: Record<string, unknown> = {
    id: data.id,
    type: data.type,
    ...(data.label ? { label: data.label } : {}),
  };

  if ((data.type === "entity" || data.type === "list") && data.entity) {
    base.entity = data.entity;
  }
  if (data.type === "list") {
    base.source = { type: "operational", entity: data.entity };
    base.table = { columns: [] };
  }
  if (data.type === "entity") {
    base.widgets = [];
    base.groups = [];
    base.views = [];
  }
  if (data.type === "tabs_list") {
    base.tabs = [];
  }
  if (data.type === "tree") {
    base.tree = "";
  }
  if (data.type === "dashboard") {
    base.widgets = [];
  }
  if (data.type === "dashboard_tree") {
    base.tree = [];
  }

  doc.set(["views", idx], base);
}

export function updateViewField(
  doc: YamlDocument,
  viewId: string,
  field: string,
  value: unknown,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  if (value === undefined || value === null) {
    doc.doc.deleteIn(["views", idx, field] as any);
  } else {
    doc.set(["views", idx, field], value);
  }
}

export function updateViewNestedField(
  doc: YamlDocument,
  viewId: string,
  path: readonly (string | number)[],
  value: unknown,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  doc.set(["views", idx, ...path], value);
}

export function deleteView(doc: YamlDocument, viewId: string): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  doc.doc.deleteIn(["views", idx] as any);
}

// ============ Source (для list) ============

export function updateSourceField(
  doc: YamlDocument,
  viewId: string,
  field: string,
  value: unknown,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  doc.set(["views", idx, "source", field], value);
}

export function addSourceJoin(doc: YamlDocument, viewId: string): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;

  doc.appendToArray(["views", idx, "source", "joins"], (i) => ({
    id: `join_${i + 1}`,
    linkage: "",
  }));
}

export function removeSourceJoin(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  doc.doc.deleteIn(["views", idx, "source", "joins", i] as any);
}

export function updateSourceJoinField(
  doc: YamlDocument,
  viewId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  doc.set(["views", idx, "source", "joins", i, field], value);
}

// ============ Table columns ============

export function addTableColumn(doc: YamlDocument, viewId: string): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;

  doc.appendToArray(["views", idx, "table", "columns"], (i) => ({
    id: `column${i + 1}`,
    attribute: "",
  }));
}

export function removeTableColumn(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  doc.doc.deleteIn(["views", idx, "table", "columns", i] as any);
}

export function updateTableColumnField(
  doc: YamlDocument,
  viewId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  doc.set(["views", idx, "table", "columns", i, field], value);
}

export function updateTableColumnWidth(
  doc: YamlDocument,
  viewId: string,
  i: number,
  which: "default" | "min" | "max",
  value: number | undefined,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  if (value === undefined) {
    doc.doc.deleteIn([
      "views",
      idx,
      "table",
      "columns",
      i,
      "layout",
      "width",
      which,
    ] as any);
  } else {
    doc.set(
      ["views", idx, "table", "columns", i, "layout", "width", which],
      value,
    );
  }
}

export function moveTableColumn(
  doc: YamlDocument,
  viewId: string,
  from: number,
  to: number,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  const cols = doc.get(["views", idx, "table", "columns"]);
  if (!Array.isArray(cols)) return;
  if (to < 0 || to >= cols.length || from === to) return;
  const copy = [...cols];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  doc.set(["views", idx, "table", "columns"], copy);
}

// ============ Table actions (row click) ============

export function setRowClickAction(
  doc: YamlDocument,
  viewId: string,
  type: "row_click" | "row_double_click",
  actionId: string | undefined,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  const actions = doc.get(["views", idx, "table", "actions"]);
  const arr = Array.isArray(actions) ? actions : [];

  // Найти существующий типа type
  const existing = arr.findIndex((a: any) => a && a.type === type);
  if (!actionId) {
    if (existing >= 0) {
      const next = arr.filter((_, i) => i !== existing);
      doc.set(["views", idx, "table", "actions"], next);
    }
    return;
  }
  if (existing >= 0) {
    doc.set(["views", idx, "table", "actions", existing, "action"], actionId);
  } else {
    doc.set(["views", idx, "table", "actions", arr.length], {
      type,
      action: actionId,
    });
  }
}

export function setSelection(
  doc: YamlDocument,
  viewId: string,
  value: boolean,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  doc.set(["views", idx, "table", "selection"], value);
}

// ============ Paging ============

export function updatePaging(
  doc: YamlDocument,
  viewId: string,
  sizes: number[] | undefined,
  defaultSize: number | undefined,
): void {
  const idx = findViewIndex(doc, viewId);
  if (idx < 0) return;
  if (!sizes && defaultSize === undefined) {
    doc.doc.deleteIn(["views", idx, "table", "paging"] as any);
    return;
  }
  const obj: Record<string, unknown> = {};
  if (sizes) obj.sizes = sizes;
  if (defaultSize !== undefined) obj.defaultSize = defaultSize;
  doc.set(["views", idx, "table", "paging"], obj);
}

// ============ Валидация ============

export function validateViewId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (id.length > 63) return "Не более 63 символов";
  // View ID: буквы/цифры/_/:#@$.
  if (!/^[A-Za-z][A-Za-z0-9_:#@$.]*$/.test(id)) {
    return "Допустимы латинские буквы, цифры, _ : # @ $ .";
  }
  return null;
}

export function isWidgetAction(actionType: string): boolean {
  return actionType === "action";
}
