import type { YamlDocument } from "../../yaml/document";

export function addMenu(
  doc: YamlDocument,
  data: {
    id: string;
    label: string;
    type: "root_group" | "root_menu";
    placement: "top" | "settings";
  },
): void {
  const arr = doc.get(["menus"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["menus", idx], {
    id: data.id,
    route: `/${data.id.toLowerCase()}`,
    label: data.label,
    type: data.type,
    placement: data.placement,
    ...(data.type === "root_group" ? { items: [] } : {}),
  });
}

export function updateMenuField(
  doc: YamlDocument,
  menuId: string,
  field: string,
  value: unknown,
): void {
  const idx = findMenuIdx(doc, menuId);
  if (idx < 0) return;
  doc.set(["menus", idx, field], value);
}

export function deleteMenu(doc: YamlDocument, menuId: string): void {
  const idx = findMenuIdx(doc, menuId);
  if (idx < 0) return;
  doc.doc.deleteIn(["menus", idx] as any);
}

// ============ Items ============

export function addMenuItem(doc: YamlDocument, menuId: string): void {
  const idx = findMenuIdx(doc, menuId);
  if (idx < 0) return;

  doc.appendToArray(["menus", idx, "items"], (i) => ({
    id: `menuItem${i + 1}`,
    route: "/",
    label: "Новый пункт",
    type: "menu",
    view: "",
  }));
}

export function updateMenuItemField(
  doc: YamlDocument,
  menuId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findMenuIdx(doc, menuId);
  if (idx < 0) return;
  doc.set(["menus", idx, "items", i, field], value);
}

export function removeMenuItem(
  doc: YamlDocument,
  menuId: string,
  i: number,
): void {
  const idx = findMenuIdx(doc, menuId);
  if (idx < 0) return;
  doc.doc.deleteIn(["menus", idx, "items", i] as any);
}

function findMenuIdx(doc: YamlDocument, menuId: string): number {
  const arr = doc.get(["menus"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((m: any) => m && m.id === menuId);
}

export function validateMenuId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(id)) {
    return "Только латинские буквы, цифры, _ и .";
  }
  return null;
}
