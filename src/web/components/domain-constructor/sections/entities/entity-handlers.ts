import { isMap, isScalar, isSeq } from "yaml";
import type { YamlDocument } from "../../yaml/document";

export type AttributeOwnerType = "entity" | "linkage";

// ============ Поиск локаций ============

export function findEntityIndex(doc: YamlDocument, entityId: string): number {
  const arr = doc.get(["entities"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((e: any) => e && e.id === entityId);
}

export function findLinkageIndex(doc: YamlDocument, linkageId: string): number {
  const arr = doc.get(["linkages"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((l: any) => l && l.id === linkageId);
}

export function findOwnerAttrLocation(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  attrId: string,
): readonly (string | number)[] | null {
  if (!attrId) return null;

  const baseKey = ownerType === "entity" ? "entities" : "linkages";
  const ownerIdx =
    ownerType === "entity"
      ? findEntityIndex(doc, ownerId)
      : findLinkageIndex(doc, ownerId);
  if (ownerIdx < 0) return null;

  const attrsNode = doc.getNode([baseKey, ownerIdx, "attributes"]);
  if (!isSeq(attrsNode)) return null;

  for (let i = 0; i < attrsNode.items.length; i++) {
    const item = attrsNode.items[i];
    if (!isMap(item)) continue; // пропускаем скаляры / null / alias
    const idNode = item.get("id", true);
    if (isScalar(idNode) && idNode.value === attrId) {
      return [baseKey, ownerIdx, "attributes", i];
    }
  }
  return null;
}

// ============ CRUD атрибутов ============

export function addAttribute(
  doc: YamlDocument,
  ownerType: AttributeOwnerType,
  ownerId: string,
  data: { id: string; dataType: string; name?: string },
): void {
  const base =
    ownerType === "entity"
      ? (() => {
          const i = findEntityIndex(doc, ownerId);
          return i < 0 ? null : (["entities", i] as const);
        })()
      : (() => {
          const i = findLinkageIndex(doc, ownerId);
          return i < 0 ? null : (["linkages", i] as const);
        })();
  if (!base) return;

  doc.appendToArray([...base, "attributes"], {
    id: data.id,
    dataType: data.dataType,
    ...(data.name ? { name: data.name } : {}),
  });
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
  doc.set([...loc, ...subPath], value);
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

  // target="item": родительский узел item обязан быть mapping.
  // appendToArray нормализует только сам массив, но не родителей —
  // поэтому item чиним здесь (null / скаляр / alias → {}).
  if (target === "item") {
    const itemNode = doc.getNode([...loc, "item"]);
    if (itemNode !== undefined && !isMap(itemNode)) {
      doc.set([...loc, "item"], {});
    }
  }

  const path =
    target === "item"
      ? [...loc, "item", "constraints"]
      : [...loc, "constraints"];

  // appendToArray сам нормализует constraints: (null) / строку / map
  // в пустой seq и добавит { kind } в конец одним setIn.
  doc.appendToArray(path, { kind });
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
  doc.set(path, value);
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
  doc.appendToArray([...loc, "prefixRules"], (idx) => ({
    id: `Rule_${idx + 1}`,
    attribute: "",
    source: { entity: "", key: "", value: "" },
  }));
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
  if (segments.length === 0) {
    doc.doc.deleteIn([...loc, "segment"] as any);
  } else {
    doc.set([...loc, "segment"], segments);
  }
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
    return "Только латинские буквы, цифры и _; начинается с буквы";
  }
  if (RESERVED_DEVICE_NAMES.has(id.toLowerCase()))
    return "Зарезервированное имя";
  return null;
}

export const validateEntityId = validateDataId;

// ============ Сущности ============

export function addEntity(
  doc: YamlDocument,
  data: { id: string; name?: string; inherits?: string | null },
): void {
  const seq = doc.get(["entities"]);
  const idx = Array.isArray(seq) ? seq.length : 0;
  doc.set(["entities", idx], {
    id: data.id,
    ...(data.name ? { name: data.name } : {}),
    ...(data.inherits ? { inherits: data.inherits } : {}),
    attributes: [],
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
  doc.set(["entities", idx, field], value);
}

export function deleteEntity(doc: YamlDocument, entityId: string): void {
  const idx = findEntityIndex(doc, entityId);
  if (idx < 0) return;
  doc.doc.deleteIn(["entities", idx] as any);
}

export function updateAttributeField(
  doc: YamlDocument,
  entityId: string,
  attrId: string,
  field: string,
  value: unknown,
): void {
  const loc = findAttributeLocation(doc, entityId, attrId);
  if (!loc) return;
  doc.set([...loc, field], value);
}

function findAttributeLocation(
  doc: YamlDocument,
  entityId: string,
  attrId: string,
): readonly (string | number)[] | null {
  const eIdx = findEntityIndex(doc, entityId);
  if (eIdx < 0) return null;
  const attrs = doc.get(["entities", eIdx, "attributes"]);
  if (!Array.isArray(attrs)) return null;
  const aIdx = attrs.findIndex((a: any) => a && a.id === attrId);
  if (aIdx < 0) return null;
  return ["entities", eIdx, "attributes", aIdx];
}

// ============ Универсальные правки по пути ============

export function deleteAttributePath(
  doc: YamlDocument,
  entityId: string,
  attrId: string,
  subPath: readonly (string | number)[],
): void {
  const loc = findAttributeLocation(doc, entityId, attrId);
  if (!loc) return;
  doc.doc.deleteIn([...loc, ...subPath] as any);
}