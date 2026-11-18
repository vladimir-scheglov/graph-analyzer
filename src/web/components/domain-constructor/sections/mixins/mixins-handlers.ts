import type { YamlDocument } from "../../yaml/document";

export function findMixinIndex(doc: YamlDocument, id: string): number {
  const arr = doc.get(["mixins"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((m: any) => m && m.id === id);
}

export function addMixin(
  doc: YamlDocument,
  data: { id: string; type: "linkage" | "view" },
): void {
  const arr = doc.get(["mixins"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  const base: Record<string, unknown> = {
    id: data.id,
    type: data.type,
    useForChild: true,
    views: [],
  };
  if (data.type === "linkage") {
    base.linkage = "";
    base.entity = { from: "", to: "" };
  } else {
    base.entity = "";
  }
  doc.set(["mixins", idx], base);
}

export function updateMixinField(
  doc: YamlDocument,
  id: string,
  field: string,
  value: unknown,
): void {
  const idx = findMixinIndex(doc, id);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["mixins", idx, field] as any);
  } else {
    doc.set(["mixins", idx, field], value);
  }
}

export function updateMixinEntity(
  doc: YamlDocument,
  id: string,
  side: "from" | "to",
  entityFqid: string,
): void {
  const idx = findMixinIndex(doc, id);
  if (idx < 0) return;
  doc.set(["mixins", idx, "entity", side], entityFqid);
}

export function deleteMixin(doc: YamlDocument, id: string): void {
  const idx = findMixinIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["mixins", idx] as any);
}

export function addMixinView(doc: YamlDocument, mixinId: string): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  const views = doc.get(["mixins", idx, "views"]);
  const i = Array.isArray(views) ? views.length : 0;
  doc.set(["mixins", idx, "views", i], {
    id: `${mixinId}_${i + 1}`,
    type: "panel",
    to: { panel: "" },
    change: { add: {} },
  });
}

export function removeMixinView(
  doc: YamlDocument,
  mixinId: string,
  i: number,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  doc.doc.deleteIn(["mixins", idx, "views", i] as any);
}

export function updateMixinViewField(
  doc: YamlDocument,
  mixinId: string,
  i: number,
  path: readonly (string | number)[],
  value: unknown,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  doc.set(["mixins", idx, "views", i, ...path], value);
}

export function validateMixinId(id: string): string | null {
  if (!id) return "ID обязателен";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id))
    return "Только латинские буквы, цифры и _";
  return null;
}

// ============ Расширенный редактор views[i] ============

export function setMixinViewType(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  newType: 'panel' | 'tab' | 'form' | 'list' | 'page',
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;

  const v = doc.get(['mixins', idx, 'views', viewIdx]) as Record<string, unknown>;
  if (!v) return;

  // Пересобираем структуру под новый тип
  const base: Record<string, unknown> = {
    id: v.id,
    type: newType,
    to: { [newType]: '' },
    change: { add: {} },
  };
  doc.set(['mixins', idx, 'views', viewIdx], base);
}

export function setFromView(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  fromView: string,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  if (!fromView) {
    doc.doc.deleteIn(['mixins', idx, 'views', viewIdx, 'fromView'] as any);
  } else {
    doc.set(['mixins', idx, 'views', viewIdx, 'fromView'], fromView);
  }
}

// ============ change.add ============

export function addChangeAddArrayItem(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  field: 'tabs' | 'menu' | 'actionPanel' | 'components',
  initial: Record<string, unknown>,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  const arr = doc.get(['mixins', idx, 'views', viewIdx, 'change', 'add', field]);
  const i = Array.isArray(arr) ? arr.length : 0;
  doc.set(['mixins', idx, 'views', viewIdx, 'change', 'add', field, i], initial);
}

export function removeChangeAddArrayItem(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  field: 'tabs' | 'menu' | 'actionPanel' | 'components',
  i: number,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  doc.doc.deleteIn(['mixins', idx, 'views', viewIdx, 'change', 'add', field, i] as any);
}

export function updateChangeAddArrayItem(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  field: 'tabs' | 'menu' | 'actionPanel' | 'components',
  i: number,
  itemField: string,
  value: unknown,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  doc.set(['mixins', idx, 'views', viewIdx, 'change', 'add', field, i, itemField], value);
}

export function setChangeAddScalar(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  field: 'form' | 'list' | 'block',
  value: string,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  if (!value) {
    doc.doc.deleteIn(['mixins', idx, 'views', viewIdx, 'change', 'add', field] as any);
  } else {
    doc.set(['mixins', idx, 'views', viewIdx, 'change', 'add', field], value);
  }
}

// ============ change.delete ============

export function addChangeDeleteItem(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  field: 'tabs' | 'menu' | 'actionPanel' | 'components' | 'columns',
  initial: Record<string, unknown>,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  const arr = doc.get(['mixins', idx, 'views', viewIdx, 'change', 'delete', field]);
  const i = Array.isArray(arr) ? arr.length : 0;
  doc.set(['mixins', idx, 'views', viewIdx, 'change', 'delete', field, i], initial);
}

export function removeChangeDeleteItem(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  field: 'tabs' | 'menu' | 'actionPanel' | 'components' | 'columns',
  i: number,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  doc.doc.deleteIn(['mixins', idx, 'views', viewIdx, 'change', 'delete', field, i] as any);
}

export function updateChangeDeleteItem(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  field: 'tabs' | 'menu' | 'actionPanel' | 'components' | 'columns',
  i: number,
  itemField: string,
  value: unknown,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  doc.set(['mixins', idx, 'views', viewIdx, 'change', 'delete', field, i, itemField], value);
}

// ============ replace ============

export function setReplaceScalar(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  field: 'block' | 'form' | 'list',
  value: string,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  if (!value) {
    doc.doc.deleteIn(['mixins', idx, 'views', viewIdx, 'replace', field] as any);
  } else {
    doc.set(['mixins', idx, 'views', viewIdx, 'replace', field], value);
  }
}

// ============ position ============

export function setChangeAddPosition(
  doc: YamlDocument,
  mixinId: string,
  viewIdx: number,
  position: { type?: string; after?: any } | undefined,
): void {
  const idx = findMixinIndex(doc, mixinId);
  if (idx < 0) return;
  if (!position) {
    doc.doc.deleteIn(['mixins', idx, 'views', viewIdx, 'change', 'add', 'position'] as any);
    return;
  }
  doc.set(['mixins', idx, 'views', viewIdx, 'change', 'add', 'position'], position);
}