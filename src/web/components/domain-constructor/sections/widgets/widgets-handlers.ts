import type { YamlDocument } from "../../yaml/document";
import { findViewIndex } from "../views/views-handlers";

export type WidgetType =
  | "attribute"
  | "action"
  | "linkage"
  | "linkage_list"
  | "linkedobjectsgroups"
  | "join"
  | "visualization"
  | "history"
  | "runs_history"
  | "comments"
  | "card"
  | "conversation";

export const WIDGET_TYPES: Array<{
  value: WidgetType;
  label: string;
  group: string;
}> = [
  { value: "attribute", label: "Виджет атрибута", group: "База" },
  { value: "action", label: "Виджет действия", group: "База" },
  { value: "linkage", label: "Виджет связи", group: "База" },
  { value: "linkage_list", label: "Список связей", group: "Связи" },
  {
    value: "linkedobjectsgroups",
    label: "Группировка связанных",
    group: "Связи",
  },
  { value: "join", label: "Транзитивная связь", group: "Связи" },
  { value: "visualization", label: "Визуализация", group: "Прочее" },
  { value: "history", label: "История изменений", group: "Прочее" },
  { value: "runs_history", label: "История запусков", group: "Прочее" },
  { value: "comments", label: "Комментарии", group: "Прочее" },
  { value: "card", label: "Карточка дашборда", group: "Дашборд" },
  { value: "conversation", label: "Переписки", group: "Прочее" },
];

export function findWidgetIndex(
  doc: YamlDocument,
  viewId: string,
  widgetId: string,
): number {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return -1;
  const widgets = doc.get(["views", vIdx, "widgets"]);
  if (!Array.isArray(widgets)) return -1;
  return widgets.findIndex((w: any) => w && w.id === widgetId);
}

export function addWidget(
  doc: YamlDocument,
  viewId: string,
  data: { id: string; type: WidgetType; description?: string },
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const widgets = doc.get(["views", vIdx, "widgets"]);
  const i = Array.isArray(widgets) ? widgets.length : 0;

  const base: Record<string, unknown> = {
    id: data.id,
    type: data.type,
    ...(data.description ? { description: data.description } : {}),
  };

  // Дефолтные поля по типу
  switch (data.type) {
    case "attribute":
      base.attribute = "";
      break;
    case "action":
      base.action = "";
      break;
    case "linkage":
      base.linkage = "";
      base.side = 2;
      break;
    case "history":
      base.eventStorageId = "";
      break;
    case "join":
      base.joinId = "";
      base.attribute = "";
      break;
    // остальные — только обязательные id/type
  }

  doc.set(["views", vIdx, "widgets", i], base);
}

export function updateWidgetField(
  doc: YamlDocument,
  viewId: string,
  widgetId: string,
  field: string,
  value: unknown,
): void {
  const wIdx = findWidgetIndex(doc, viewId, widgetId);
  if (wIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["views", vIdx, "widgets", wIdx, field] as any);
  } else {
    doc.set(["views", vIdx, "widgets", wIdx, field], value);
  }
}

export function updateWidgetNestedField(
  doc: YamlDocument,
  viewId: string,
  widgetId: string,
  path: readonly (string | number)[],
  value: unknown,
): void {
  const wIdx = findWidgetIndex(doc, viewId, widgetId);
  if (wIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  doc.set(["views", vIdx, "widgets", wIdx, ...path], value);
}

export function deleteWidget(
  doc: YamlDocument,
  viewId: string,
  widgetId: string,
): void {
  const wIdx = findWidgetIndex(doc, viewId, widgetId);
  if (wIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  doc.doc.deleteIn(["views", vIdx, "widgets", wIdx] as any);
}

export function changeWidgetType(
  doc: YamlDocument,
  viewId: string,
  widgetId: string,
  newType: WidgetType,
): void {
  const wIdx = findWidgetIndex(doc, viewId, widgetId);
  if (wIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  const widget = doc.get(["views", vIdx, "widgets", wIdx]) as Record<
    string,
    unknown
  >;
  if (!widget) return;
  const base: Record<string, unknown> = {
    id: widget.id,
    type: newType,
    ...(widget.description ? { description: widget.description } : {}),
  };
  doc.set(["views", vIdx, "widgets", wIdx], base);
}

export function validateWidgetId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (id.length > 63) return "Не более 63 символов";
  // View ID: буквы/цифры/_/:#@$
  if (!/^[A-Za-z][A-Za-z0-9_:#@$]*$/.test(id)) {
    return "Допустимы латинские буквы, цифры, _ : # @ $";
  }
  return null;
}

export function getWidgetTypeLabel(type: string): string {
  return WIDGET_TYPES.find((t) => t.value === type)?.label ?? type;
}
