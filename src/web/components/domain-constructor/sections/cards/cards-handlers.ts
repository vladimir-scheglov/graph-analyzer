import type { YamlDocument } from "../../yaml/document";
import { findViewIndex } from "../views/views-handlers";

export type CardType = "panel" | "modal" | "page";

export const CARD_TYPES: Array<{ value: CardType; label: string }> = [
  { value: "panel", label: "Компактное представление (panel)" },
  { value: "modal", label: "Модальное окно (modal)" },
  { value: "page", label: "Полноэкранная карточка (page)" },
];

// ============ Поиск / CRUD ============

export function findCardIndex(
  doc: YamlDocument,
  viewId: string,
  cardId: string,
): number {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return -1;
  const cards = doc.get(["views", vIdx, "views"]);
  if (!Array.isArray(cards)) return -1;
  return cards.findIndex((c: any) => c && c.id === cardId);
}

export function addCard(
  doc: YamlDocument,
  viewId: string,
  data: { id: string; type: CardType; label?: string },
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const cards = doc.get(["views", vIdx, "views"]);
  const i = Array.isArray(cards) ? cards.length : 0;

  const base: Record<string, unknown> = {
    id: data.id,
    type: data.type,
    ...(data.label ? { label: data.label } : {}),
  };

  if (data.type === "panel") {
    base.menu = [];
    base.tabs = [];
  } else if (data.type === "modal") {
    base.form = "";
    base.buttons = [
      { type: "submit", label: "Добавить" },
      { type: "close", label: "Отменить" },
    ];
  } else if (data.type === "page") {
    base.actionPanel = [];
    base.tabs = [];
  }

  doc.set(["views", vIdx, "views", i], base);
}

export function updateCardField(
  doc: YamlDocument,
  viewId: string,
  cardId: string,
  field: string,
  value: unknown,
): void {
  const cIdx = findCardIndex(doc, viewId, cardId);
  if (cIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["views", vIdx, "views", cIdx, field] as any);
  } else {
    doc.set(["views", vIdx, "views", cIdx, field], value);
  }
}

export function updateCardNestedField(
  doc: YamlDocument,
  viewId: string,
  cardId: string,
  path: readonly (string | number)[],
  value: unknown,
): void {
  const cIdx = findCardIndex(doc, viewId, cardId);
  if (cIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  doc.set(["views", vIdx, "views", cIdx, ...path], value);
}

export function deleteCard(
  doc: YamlDocument,
  viewId: string,
  cardId: string,
): void {
  const cIdx = findCardIndex(doc, viewId, cardId);
  if (cIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  doc.doc.deleteIn(["views", vIdx, "views", cIdx] as any);
}

export function changeCardType(
  doc: YamlDocument,
  viewId: string,
  cardId: string,
  newType: CardType,
): void {
  const cIdx = findCardIndex(doc, viewId, cardId);
  if (cIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  const card = doc.get(["views", vIdx, "views", cIdx]) as Record<
    string,
    unknown
  >;
  if (!card) return;
  const base: Record<string, unknown> = {
    id: card.id,
    type: newType,
    ...(card.label ? { label: card.label } : {}),
    ...(card.description ? { description: card.description } : {}),
  };
  if (newType === "panel") {
    base.menu = [];
    base.tabs = [];
  } else if (newType === "modal") {
    base.form = "";
    base.buttons = [
      { type: "submit", label: "Добавить" },
      { type: "close", label: "Отменить" },
    ];
  } else if (newType === "page") {
    base.actionPanel = [];
    base.tabs = [];
  }
  doc.set(["views", vIdx, "views", cIdx], base);
}

// ============ Универсальные операции с массивами внутри карточки ============

export function addToCardArray(
  doc: YamlDocument,
  viewId: string,
  cardId: string,
  arrayField: string,
  item: unknown,
): void {
  const cIdx = findCardIndex(doc, viewId, cardId);
  if (cIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  doc.appendToArray(["views", vIdx, "views", cIdx, arrayField], item);
}

export function removeFromCardArray(
  doc: YamlDocument,
  viewId: string,
  cardId: string,
  arrayField: string,
  index: number,
): void {
  const cIdx = findCardIndex(doc, viewId, cardId);
  if (cIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  doc.doc.deleteIn(["views", vIdx, "views", cIdx, arrayField, index] as any);
}

export function updateInCardArray(
  doc: YamlDocument,
  viewId: string,
  cardId: string,
  arrayField: string,
  index: number,
  field: string,
  value: unknown,
): void {
  const cIdx = findCardIndex(doc, viewId, cardId);
  if (cIdx < 0) return;
  const vIdx = findViewIndex(doc, viewId);
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn([
      "views",
      vIdx,
      "views",
      cIdx,
      arrayField,
      index,
      field,
    ] as any);
  } else {
    doc.set(["views", vIdx, "views", cIdx, arrayField, index, field], value);
  }
}

// ============ Валидация ============

export function validateCardId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (id.length > 63) return "Не более 63 символов";
  if (!/^[A-Za-z][A-Za-z0-9_:#@$]*$/.test(id)) {
    return "Допустимы латинские буквы, цифры, _ : # @ $";
  }
  return null;
}
