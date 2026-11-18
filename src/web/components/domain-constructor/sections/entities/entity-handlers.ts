import { isMap, isScalar, isSeq } from "yaml";
import type { YamlDocument, YamlPath } from "../../yaml/document";
import { getAvailableConstraints } from "../../model/compat-tables";
import { escapeRegExp, uniqueId } from "./entity-utils";

export type AttributeOwnerType = "entity" | "linkage";

// ============ Надёжный push в seq (нормализует null/скаляр) ============
function push(doc: YamlDocument, path: YamlPath, item: unknown): number {
  let node = doc.getNode(path);
  if (node !== undefined && !isSeq(node)) {
    doc.set(path, []);
    node = doc.getNode(path);
  }
  const i = isSeq(node) ? node.items.length : 0;
  doc.set([...path, i], item);
  return i;
}

/** Перестановка узлов seq без потери комментариев. */
function moveNode(
  doc: YamlDocument,
  path: YamlPath,
  from: number,
  to: number,
): void {
  const node = doc.getNode(path);
  if (!isSeq(node)) return;
  const len = node.items.length;
  if (from < 0 || from >= len || to < 0 || to >= len || from === to) return;
  const [item] = node.items.splice(from, 1);
  node.items.splice(to, 0, item);
}

// ============ Поиск локаций (по сырым YAML-узлам) ============
function findIndexById(doc: YamlDocument, section: string, id: string): number {
  if (!id) return -1;
  const node = doc.getNode([section]);
  if (!isSeq(node)) return -1;
  for (let i = 0; i < node.items.length; i++) {
    const item = node.items[i];
    if (!isMap(item)) continue;
    const idNode = item.get("id", true);
    if (isScalar(idNode) && idNode.value === id) return i;
  }
  return -1;
}

export function findEntityIndex(doc: YamlDocument, entityId: string): number {
  return findIndexById(doc, "entities", entityId);
}

export function findLinkageIndex(doc: YamlDocument, linkageId: string): number {
  return findIndexById(doc, "linkages", linkageId);
}

export function findOwnerAttrLocation(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
): readonly (string | number)[] | null {
  if (!attrId) return null;
  const section = ownerType === "entity" ? "entities" : "linkages";
  const idx = findIndexById(doc, section, ownerId);
  if (idx < 0) return null;
  const attrs = doc.getNode([section, idx, "attributes"]);
  if (!isSeq(attrs)) return null;
  for (let i = 0; i < attrs.items.length; i++) {
    const item = attrs.items[i];
    if (!isMap(item)) continue;
    const idNode = item.get("id", true);
    if (isScalar(idNode) && idNode.value === attrId) {
      return [section, idx, "attributes", i];
    }
  }
  return null;
}

function ownerBase(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
): YamlPath | null {
  const section = ownerType === "entity" ? "entities" : "linkages";
  const idx = findIndexById(doc, section, ownerId);
  return idx < 0 ? null : [section, idx];
}

// ============ Сущности ============
export function addEntity(
  doc: YamlDocument,
  data: {
    id: string;
    name?: string;
    description?: string;
    inherits?: string | null;
    kind?: string;
    label?: string;
    attributes?: Array<Record<string, unknown>>;
  },
): void {
  push(doc, ["entities"], {
    id: data.id,
    ...(data.name ? { name: data.name } : {}),
    ...(data.description ? { description: data.description } : {}),
    ...(data.label ? { label: data.label } : {}),
    ...(data.kind && data.kind !== "regular" ? { kind: data.kind } : {}),
    ...(data.inherits ? { inherits: data.inherits } : {}),
    attributes: data.attributes ?? [],
  });
}

export function updateEntityField(
  doc: YamlDocument,
  entityId: string,
  field: string,
  value: unknown,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["entities", idx, field] as any);
  } else {
    doc.set(["entities", idx, field], value);
  }
}

export function setEntityGraphColor(
  doc: YamlDocument,
  entityId: string,
  color: string | undefined,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  if (!color) doc.doc.deleteIn(["entities", idx, "graphView"] as any);
  else doc.set(["entities", idx, "graphView"], { iconColor: color });
}

export function duplicateEntity(
  doc: YamlDocument,
  entityId: string,
): string | null {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return null;
  const plain = doc.get(["entities", idx]) as
    | Record<string, unknown>
    | undefined;
  if (!plain) return null;
  const existing = new Set(
    ((doc.get(["entities"]) as any[]) ?? []).map((e) => e?.id).filter(Boolean),
  );
  const newId = uniqueId((entityId + "Copy").slice(0, 30), existing);
  const copy = JSON.parse(JSON.stringify(plain));
  copy.id = newId;
  if (copy.name) copy.name = String(copy.name) + " (копия)";
  push(doc, ["entities"], copy);
  return newId;
}

export function deleteEntity(doc: YamlDocument, entityId: string): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  doc.doc.deleteIn(["entities", idx] as any);
}

// ============ Атрибуты ============
export interface NewAttributeData {
  id: string;
  dataType: string;
  name?: string;
  description?: string;
  required?: boolean;
  readonly?: boolean;
  entity?: string;
  item?: { dataType: string; entity?: string };
}

function buildAttribute(data: NewAttributeData): Record<string, unknown> {
  return {
    id: data.id,
    dataType: data.dataType,
    ...(data.name ? { name: data.name } : {}),
    ...(data.description ? { description: data.description } : {}),
    ...(data.readonly ? { readonly: true } : {}),
    ...(data.entity ? { entity: data.entity } : {}),
    ...(data.item ? { item: data.item } : {}),
    ...(data.required ? { constraints: [{ kind: "required" }] } : {}),
  };
}

export function addAttribute(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  data: NewAttributeData,
): void {
  const base = ownerBase(doc, ownerType, ownerId);
  if (!base) return;
  push(doc, [...base, "attributes"], buildAttribute(data));
}

export function addAttributesBatch(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  items: NewAttributeData[],
): void {
  const base = ownerBase(doc, ownerType, ownerId);
  if (!base) return;
  for (const data of items)
    push(doc, [...base, "attributes"], buildAttribute(data));
}

export function updateAttributePath(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  subPath: readonly (string | number)[],
  value: unknown,
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn([...loc, ...subPath] as any);
  } else {
    doc.set([...loc, ...subPath], value);
  }
}

/** Переименование атрибута + обновление ссылок внутри сущности. */
export function renameAttribute(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  oldId: string,
  newId: string,
): void {
  if (oldId === newId) return;
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, oldId);
  if (!loc) return;
  doc.set([...loc, "id"], newId);
  if (ownerType !== "entity") return;

  const eIdx = findEntityIndex(doc, ownerId);
  const entity = doc.get(["entities", eIdx]) as any;
  if (!entity) return;

  const sorting = entity.sorting;
  if (Array.isArray(sorting)) {
    sorting.forEach((rule: any, ri: number) => {
      (rule.by ?? []).forEach((b: any, bi: number) => {
        if (b?.attribute === oldId) {
          doc.set(
            ["entities", eIdx, "sorting", ri, "by", bi, "attribute"],
            newId,
          );
        }
      });
    });
  }
  (["projection", "searching"] as const).forEach((field) => {
    const arr = entity[field];
    if (Array.isArray(arr)) {
      arr.forEach((p: any, pi: number) => {
        if (p?.attribute === oldId) {
          doc.set(["entities", eIdx, field, pi, "attribute"], newId);
        }
      });
    }
  });
  if (typeof entity.label === "string" && entity.label.includes(`{${oldId}}`)) {
    doc.set(
      ["entities", eIdx, "label"],
      entity.label.replace(
        new RegExp(`\\{${escapeRegExp(oldId)}\\}`, "g"),
        `{${newId}}`,
      ),
    );
  }
  const prefixRules = (entity.attributes ?? []).flatMap(
    (a: any) => a?.prefixRules ?? [],
  );
  void prefixRules;
  const attrLoc = findOwnerAttrLocation(doc, "entity", ownerId, newId);
  if (attrLoc) {
    const rules = doc.get([...attrLoc, "prefixRules"]) as any[];
    if (Array.isArray(rules)) {
      rules.forEach((r, ri) => {
        if (r?.attribute === oldId)
          doc.set([...attrLoc, "prefixRules", ri, "attribute"], newId);
      });
    }
  }
}

export function deleteAttribute(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  doc.doc.deleteIn(loc as any);
}

export function deleteAttributesBatch(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrIds: string[],
): void {
  // удаляем с конца, чтобы индексы не сдвигались
  const base = ownerBase(doc, ownerType, ownerId);
  if (!base) return;
  const node = doc.getNode([...base, "attributes"]);
  if (!isSeq(node)) return;
  const indexes: number[] = [];
  node.items.forEach((item, i) => {
    if (!isMap(item)) return;
    const idNode = item.get("id", true);
    if (isScalar(idNode) && attrIds.includes(String(idNode.value)))
      indexes.push(i);
  });
  indexes.sort((a, b) => b - a).forEach((i) => node.items.splice(i, 1));
}

export function duplicateAttribute(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
): string | null {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return null;
  const plain = doc.get(loc) as Record<string, unknown> | undefined;
  if (!plain) return null;
  const base = ownerBase(doc, ownerType, ownerId);
  if (!base) return null;
  const existing = new Set(
    ((doc.get([...base, "attributes"]) as any[]) ?? [])
      .map((a) => a?.id)
      .filter(Boolean),
  );
  const newId = uniqueId((attrId + "Copy").slice(0, 30), existing);
  const copy = JSON.parse(JSON.stringify(plain));
  copy.id = newId;
  if (copy.name) copy.name = String(copy.name) + " (копия)";
  push(doc, [...base, "attributes"], copy);
  return newId;
}

export function moveAttribute(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  from: number,
  to: number,
): void {
  const base = ownerBase(doc, ownerType, ownerId);
  if (!base) return;
  moveNode(doc, [...base, "attributes"], from, to);
}

/** Смена типа с очисткой несовместимых полей и ограничений. */
export function changeAttributeType(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  newType: string,
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  const plain = doc.get(loc) as any;
  if (!plain || plain.dataType === newType) return;
  const allowed = new Set(getAvailableConstraints(newType as any));
  const next: Record<string, unknown> = {
    id: plain.id,
    dataType: newType,
    ...(plain.name ? { name: plain.name } : {}),
    ...(plain.description ? { description: plain.description } : {}),
    ...(plain.readonly ? { readonly: true } : {}),
  };
  const constraints = (plain.constraints ?? []).filter((c: any) =>
    allowed.has(c?.kind),
  );
  if (constraints.length) next.constraints = constraints;
  if (newType === "Array") next.item = plain.item ?? { dataType: "String" };
  if (newType === "Reference" && plain.entity) next.entity = plain.entity;
  if (newType === "Text" && plain.comments) next.comments = true;
  doc.set(loc, next);
}

// ============ Constraints ============
export function addConstraint(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  kind: string,
  target: "attribute" | "item" = "attribute",
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  if (target === "item") {
    const itemNode = doc.getNode([...loc, "item"]);
    if (itemNode !== undefined && !isMap(itemNode))
      doc.set([...loc, "item"], {});
  }
  const path =
    target === "item"
      ? [...loc, "item", "constraints"]
      : [...loc, "constraints"];
  push(doc, path, { kind });
}

export function removeConstraint(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  index: number,
  target: "attribute" | "item" = "attribute",
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  const path =
    target === "item"
      ? [...loc, "item", "constraints", index]
      : [...loc, "constraints", index];
  doc.doc.deleteIn(path as any);
}

export function updateConstraintField(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  index: number,
  field: string,
  value: unknown,
  target: "attribute" | "item" = "attribute",
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  const path =
    target === "item"
      ? [...loc, "item", "constraints", index, field]
      : [...loc, "constraints", index, field];
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(path as any);
  } else {
    doc.set(path, value);
  }
}

export function toggleRequired(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  const constraints = (doc.get([...loc, "constraints"]) as any[]) ?? [];
  const idx = constraints.findIndex((c) => c?.kind === "required");
  if (idx >= 0) removeConstraint(doc, ownerType, ownerId, attrId, idx);
  else addConstraint(doc, ownerType, ownerId, attrId, "required");
}

// ============ PrefixRules ============
export function addPrefixRule(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  const existing = (doc.get([...loc, "prefixRules"]) as any[]) ?? [];
  const ids = new Set(existing.map((r) => r?.id).filter(Boolean));
  push(doc, [...loc, "prefixRules"], {
    id: uniqueId(`Rule_${existing.length + 1}`, ids),
    attribute: "",
    source: { entity: "", key: "", value: "" },
  });
}

export function removePrefixRule(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  index: number,
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  doc.doc.deleteIn([...loc, "prefixRules", index] as any);
}

export function updatePrefixRuleField(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  index: number,
  path: readonly (string | number)[],
  value: unknown,
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  doc.set([...loc, "prefixRules", index, ...path], value);
}

export function movePrefixRule(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  from: number,
  to: number,
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  moveNode(doc, [...loc, "prefixRules"], from, to);
}

// ============ Segment ============
export function setSegment(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
  segments: string[],
): void {
  const loc = findOwnerAttrLocation(doc, ownerType, ownerId, attrId);
  if (!loc) return;
  if (!segments.length) doc.doc.deleteIn([...loc, "segment"] as any);
  else doc.set([...loc, "segment"], segments);
}

// ============ Sorting (правила сортировки сущности) ============
export function addSortingRule(
  doc: YamlDocument,
  entityId: string,
): string | null {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return null;
  const rules = (doc.get(["entities", idx, "sorting"]) as any[]) ?? [];
  const ids = new Set(rules.map((r) => r?.id).filter(Boolean));
  const id = uniqueId(`sort${rules.length + 1}`, ids);
  const attrs = (doc.get(["entities", idx, "attributes"]) as any[]) ?? [];
  const firstAttr = attrs.find((a) => a?.id)?.id;
  push(doc, ["entities", idx, "sorting"], {
    id,
    by: firstAttr ? [{ attribute: firstAttr, direction: "asc" }] : [],
    createIndex: false,
  });
  return id;
}

export function updateSortingRuleField(
  doc: YamlDocument,
  entityId: string,
  ruleIndex: number,
  field: string,
  value: unknown,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["entities", idx, "sorting", ruleIndex, field] as any);
  } else {
    doc.set(["entities", idx, "sorting", ruleIndex, field], value);
  }
}

export function deleteSortingRule(
  doc: YamlDocument,
  entityId: string,
  ruleIndex: number,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  doc.doc.deleteIn(["entities", idx, "sorting", ruleIndex] as any);
}

export function moveSortingRule(
  doc: YamlDocument,
  entityId: string,
  from: number,
  to: number,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  moveNode(doc, ["entities", idx, "sorting"], from, to);
}

export function addSortingBy(
  doc: YamlDocument,
  entityId: string,
  ruleIndex: number,
  attribute: string,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0 || !attribute) return;
  push(doc, ["entities", idx, "sorting", ruleIndex, "by"], {
    attribute,
    direction: "asc",
  });
}

export function removeSortingBy(
  doc: YamlDocument,
  entityId: string,
  ruleIndex: number,
  byIndex: number,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  doc.doc.deleteIn([
    "entities",
    idx,
    "sorting",
    ruleIndex,
    "by",
    byIndex,
  ] as any);
}

export function updateSortingByField(
  doc: YamlDocument,
  entityId: string,
  ruleIndex: number,
  byIndex: number,
  field: "attribute" | "direction",
  value: string,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  doc.set(["entities", idx, "sorting", ruleIndex, "by", byIndex, field], value);
}

export function moveSortingBy(
  doc: YamlDocument,
  entityId: string,
  ruleIndex: number,
  from: number,
  to: number,
): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  moveNode(doc, ["entities", idx, "sorting", ruleIndex, "by"], from, to);
}

// ============ Валидация Data ID ============
const RESERVED_DEVICE_NAMES = new Set([
  "aux",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
  "con",
  "nul",
  "prn",
]);

export function validateDataId(id: string): string | null {
  if (!id) return "Идентификатор не может быть пустым";
  if (id.length > 30) return "Не более 30 символов";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) {
    return "Латинские буквы, цифры и _; начинается с буквы";
  }
  if (RESERVED_DEVICE_NAMES.has(id.toLowerCase()))
    return "Зарезервированное имя";
  return null;
}

export const validateEntityId = validateDataId;
