import type { YamlDocument } from "../../yaml/document";

// ============ Константы ============

export const ACTION_TYPES = [
  { value: "open_panel", label: "Открыть панель" },
  { value: "open_modal", label: "Открыть модальное окно" },
  { value: "open_page", label: "Открыть полноэкранную карточку" },
  { value: "opengraphview", label: "Открыть граф связей" },
  { value: "openboardview", label: "Открыть доску" },
  { value: "open_list", label: "Открыть списочное представление" },
  { value: "open_tree", label: "Открыть дерево" },
  { value: "open_view", label: "Открыть представление без контекста" },
  { value: "remove", label: "Удалить объект" },
  { value: "bulk", label: "Массовое действие" },
  { value: "tree_bulk", label: "Массовое действие в дереве" },
  { value: "setattributevalue", label: "Установить значение атрибута" },
  { value: "automation", label: "Запустить автоматизацию" },
  { value: "scenario", label: "Запустить сценарий" },
  { value: "generateqrcode", label: "Сгенерировать QR-код" },
  { value: "copyentitylink", label: "Скопировать ссылку на объект" },
  { value: "open_external_widget_modal", label: "Открыть внешний виджет" },
] as const;

export type ActionType = (typeof ACTION_TYPES)[number]["value"];

/** Типы, которым нужен `entity`. */
export const TYPES_WITH_ENTITY: ActionType[] = [
  "open_panel",
  "open_modal",
  "open_page",
  "opengraphview",
  "openboardview",
  "remove",
  "bulk",
  "tree_bulk",
  "setattributevalue",
  "automation",
  "generateqrcode",
  "copyentitylink",
];

// ============ CRUD ============

export function findActionIndex(doc: YamlDocument, actionId: string): number {
  const arr = doc.get(["actions"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((a: any) => a && a.id === actionId);
}

export function addAction(
  doc: YamlDocument,
  data: { id: string; type: ActionType; name?: string; entity?: string },
): void {
  const arr = doc.get(["actions"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["actions", idx], {
    id: data.id,
    type: data.type,
    ...(data.name ? { name: data.name } : {}),
    ...(data.entity && TYPES_WITH_ENTITY.includes(data.type)
      ? { entity: data.entity }
      : {}),
  });
}

export function updateActionField(
  doc: YamlDocument,
  actionId: string,
  field: string,
  value: unknown,
): void {
  const idx = findActionIndex(doc, actionId);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["actions", idx, field] as any);
  } else {
    doc.set(["actions", idx, field], value);
  }
}

export function deleteAction(doc: YamlDocument, actionId: string): void {
  const idx = findActionIndex(doc, actionId);
  if (idx < 0) return;
  doc.doc.deleteIn(["actions", idx] as any);
}

// ============ Change type (нужно чистить несовместимые поля) ============

export function changeActionType(
  doc: YamlDocument,
  actionId: string,
  newType: ActionType,
): void {
  const idx = findActionIndex(doc, actionId);
  if (idx < 0) return;
  const action = doc.get(["actions", idx]) as
    | Record<string, unknown>
    | undefined;
  if (!action) return;

  // Оставляем только универсальные поля
  const base: Record<string, unknown> = {
    id: action.id,
    type: newType,
  };
  if (action.name) base.name = action.name;
  if (action.description) base.description = action.description;
  if (action.entity && TYPES_WITH_ENTITY.includes(newType)) {
    base.entity = action.entity;
  }
  doc.set(["actions", idx], base);
}

// ============ values (setattributevalue) ============

export function addActionValue(doc: YamlDocument, actionId: string): void {
  const idx = findActionIndex(doc, actionId);
  if (idx < 0) return;
  const values = doc.get(["actions", idx, "values"]);
  const i = Array.isArray(values) ? values.length : 0;
  doc.set(["actions", idx, "values", i], { attribute: "", value: "" });
}

export function removeActionValue(
  doc: YamlDocument,
  actionId: string,
  i: number,
): void {
  const idx = findActionIndex(doc, actionId);
  if (idx < 0) return;
  doc.doc.deleteIn(["actions", idx, "values", i] as any);
}

export function updateActionValueField(
  doc: YamlDocument,
  actionId: string,
  i: number,
  field: "attribute" | "value",
  value: unknown,
): void {
  const idx = findActionIndex(doc, actionId);
  if (idx < 0) return;
  doc.set(["actions", idx, "values", i, field], value);
}

// ============ Валидация ============

export function validateActionId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (id.length > 63) return "Не более 63 символов";
  if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(id)) {
    return "Только латинские буквы, цифры, _ и .";
  }
  return null;
}

export function getActionTypeLabel(type: string): string {
  return ACTION_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** Требования по типу действия: какие поля обязательны. */
export function getActionRequirements(type: ActionType): {
  requiresEntity: boolean;
  requiresModal?: boolean;
  requiresPanel?: boolean;
  requiresView?: boolean;
  requiresPageView?: boolean;
  requiresScenario?: boolean;
} {
  switch (type) {
    case "open_panel":
      return { requiresEntity: true, requiresPanel: true };
    case "open_modal":
      return { requiresEntity: true, requiresModal: true };
    case "open_page":
      return { requiresEntity: true, requiresPageView: true };
    case "open_list":
      return { requiresEntity: false, requiresView: true };
    case "open_tree":
      return { requiresEntity: false, requiresView: true };
    case "open_view":
      return { requiresEntity: false, requiresView: true };
    case "openboardview":
      return { requiresEntity: true };
    case "opengraphview":
      return { requiresEntity: true };
    case "remove":
      return { requiresEntity: true };
    case "bulk":
      return { requiresEntity: true };
    case "tree_bulk":
      return { requiresEntity: false };
    case "setattributevalue":
      return { requiresEntity: true };
    case "automation":
      return { requiresEntity: false };
    case "scenario":
      return { requiresEntity: false, requiresScenario: true };
    case "generateqrcode":
      return { requiresEntity: true };
    case "copyentitylink":
      return { requiresEntity: true };
    case "open_external_widget_modal":
      return { requiresEntity: false };
    default:
      return { requiresEntity: false };
  }
}
