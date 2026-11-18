import type { YamlDocument } from "../../yaml/document";

export type UiRuleTarget = "list_view" | "entity_view" | "entity_attribute";
export type UiRuleEffect =
  | "hidden"
  | "show"
  | "hiddenEmpty"
  | "readonly"
  | "editable"
  | "variant";
export type UiRuleOperation = "view" | "edit" | "create";

export const TARGET_OPTIONS: Array<{ value: UiRuleTarget; label: string }> = [
  { value: "list_view", label: "Списочное представление" },
  { value: "entity_view", label: "Представление сущности" },
  { value: "entity_attribute", label: "Атрибут (table / array)" },
];

export const EFFECT_OPTIONS: Array<{
  value: UiRuleEffect;
  label: string;
  requiresPresets: boolean;
}> = [
  { value: "hidden", label: "Скрыть", requiresPresets: false },
  { value: "show", label: "Показать", requiresPresets: false },
  { value: "hiddenEmpty", label: "Скрыть пустой", requiresPresets: false },
  { value: "readonly", label: "Только для чтения", requiresPresets: false },
  {
    value: "editable",
    label: "Доступно для редактирования",
    requiresPresets: false,
  },
  { value: "variant", label: "Вариант (с пресетами)", requiresPresets: true },
];

// ============ Поиск / CRUD ============

export function findUiRuleIndex(doc: YamlDocument, id: string): number {
  const arr = doc.get(["uiRules"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((r: any) => r && r.id === id);
}

export function addUiRule(
  doc: YamlDocument,
  data: { id: string; target: UiRuleTarget; view: string; name?: string },
): void {
  const arr = doc.get(["uiRules"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["uiRules", idx], {
    id: data.id,
    ...(data.name ? { name: data.name } : {}),
    target: data.target,
    view: data.view,
    condition: "!rql true",
    rule: {
      effect: "hidden",
      ...(data.target === "list_view"
        ? { columns: [] }
        : data.target === "entity_view"
          ? { widgets: [], groups: [] }
          : { widgets: [] }),
    },
  });
}

export function updateUiRuleTop(
  doc: YamlDocument,
  id: string,
  field: "name" | "description" | "view",
  value: unknown,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["uiRules", idx, field] as any);
  } else {
    doc.set(["uiRules", idx, field], value);
  }
}

export function updateUiRuleContext(
  doc: YamlDocument,
  id: string,
  contextViews: string[],
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  if (contextViews.length === 0) {
    doc.doc.deleteIn(["uiRules", idx, "context"] as any);
    return;
  }
  doc.set(["uiRules", idx, "context", "views"], contextViews);
}

export function updateUiRuleCondition(
  doc: YamlDocument,
  id: string,
  rql: string,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  doc.set(["uiRules", idx, "condition"], rql);
}

export function updateUiRuleRuleField(
  doc: YamlDocument,
  id: string,
  field:
    | "effect"
    | "operations"
    | "widgets"
    | "groups"
    | "columns"
    | "presets"
    | "message"
    | "help",
  value: unknown,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  if (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.length === 0)
  ) {
    doc.doc.deleteIn(["uiRules", idx, "rule", field] as any);
  } else {
    doc.set(["uiRules", idx, "rule", field], value);
  }
}

export function deleteUiRule(doc: YamlDocument, id: string): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["uiRules", idx] as any);
}

// ============ widgets / groups / columns ============

export function addUiRuleWidget(
  doc: YamlDocument,
  id: string,
  widgetId: string,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  const widgets = doc.get(["uiRules", idx, "rule", "widgets"]);
  const i = Array.isArray(widgets) ? widgets.length : 0;
  doc.set(["uiRules", idx, "rule", "widgets", i], { widget: widgetId });
}

export function removeUiRuleWidget(
  doc: YamlDocument,
  id: string,
  i: number,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["uiRules", idx, "rule", "widgets", i] as any);
}

export function updateUiRuleWidgetField(
  doc: YamlDocument,
  id: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["uiRules", idx, "rule", "widgets", i, field] as any);
  } else {
    doc.set(["uiRules", idx, "rule", "widgets", i, field], value);
  }
}

export function addUiRuleGroup(
  doc: YamlDocument,
  id: string,
  groupId: string,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  const groups = doc.get(["uiRules", idx, "rule", "groups"]);
  const i = Array.isArray(groups) ? groups.length : 0;
  doc.set(["uiRules", idx, "rule", "groups", i], { group: groupId });
}

export function removeUiRuleGroup(
  doc: YamlDocument,
  id: string,
  i: number,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["uiRules", idx, "rule", "groups", i] as any);
}

export function addUiRuleColumn(
  doc: YamlDocument,
  id: string,
  columnId: string,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  const cols = doc.get(["uiRules", idx, "rule", "columns"]);
  const i = Array.isArray(cols) ? cols.length : 0;
  doc.set(["uiRules", idx, "rule", "columns", i], { column: columnId });
}

export function removeUiRuleColumn(
  doc: YamlDocument,
  id: string,
  i: number,
): void {
  const idx = findUiRuleIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["uiRules", idx, "rule", "columns", i] as any);
}

// ============ Валидация ============

export function validateUiRuleId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (id.length > 63) return "Не более 63 символов";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) {
    return "Только латинские буквы, цифры и _";
  }
  return null;
}

export function getEffectLabel(effect: string): string {
  return EFFECT_OPTIONS.find((e) => e.value === effect)?.label ?? effect;
}

export function getTargetLabel(target: string): string {
  return TARGET_OPTIONS.find((t) => t.value === target)?.label ?? target;
}

export function isEffectAllowedForTarget(
  effect: UiRuleEffect,
  target: UiRuleTarget,
): boolean {
  if (effect === "readonly" || effect === "editable") {
    return target === "entity_view";
  }
  return true;
}
