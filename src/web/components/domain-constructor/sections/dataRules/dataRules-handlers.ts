import type { YamlDocument } from "../../yaml/document";

export type DataRuleTarget = "entity" | "entityAttribute" | "linkage";
export type DataRuleEffect =
  | "hidden"
  | "readonly"
  | "required"
  | "default"
  | "allowed";

export const EFFECT_OPTIONS: Array<{ value: DataRuleEffect; label: string }> = [
  { value: "hidden", label: "Скрытие" },
  { value: "readonly", label: "Только для чтения" },
  { value: "required", label: "Обязательность" },
  { value: "default", label: "Значение по умолчанию" },
  { value: "allowed", label: "Проверка допустимости" },
];

export function findDataRuleIndex(doc: YamlDocument, id: string): number {
  const arr = doc.get(["dataRules"]);
  if (!Array.isArray(arr)) return -1;
  return arr.findIndex((r: any) => r && r.id === id);
}

export function addDataRule(
  doc: YamlDocument,
  data: {
    id: string;
    target: DataRuleTarget;
    entity?: string;
    linkage?: string;
    attribute?: string;
  },
): void {
  const arr = doc.get(["dataRules"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  const base: Record<string, unknown> = {
    id: data.id,
    target: data.target,
    condition: true,
    rule: { effect: "readonly", attributes: [] },
  };
  if (data.entity) base.entity = data.entity;
  if (data.linkage) base.linkage = data.linkage;
  if (data.attribute) base.attribute = data.attribute;
  doc.set(["dataRules", idx], base);
}

export function updateDataRuleField(
  doc: YamlDocument,
  id: string,
  field: string,
  value: unknown,
): void {
  const idx = findDataRuleIndex(doc, id);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["dataRules", idx, field] as any);
  } else {
    doc.set(["dataRules", idx, field], value);
  }
}

export function updateDataRuleNested(
  doc: YamlDocument,
  id: string,
  path: readonly (string | number)[],
  value: unknown,
): void {
  const idx = findDataRuleIndex(doc, id);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["dataRules", idx, ...path] as any);
  } else {
    doc.set(["dataRules", idx, ...path], value);
  }
}

export function deleteDataRule(doc: YamlDocument, id: string): void {
  const idx = findDataRuleIndex(doc, id);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataRules", idx] as any);
}

// ============ Установка RQL с тегом !rql ============

export function setDataRuleCondition(
  doc: YamlDocument,
  id: string,
  rql: string | boolean,
): void {
  const idx = findDataRuleIndex(doc, id);
  if (idx < 0) return;
  if (typeof rql === "boolean") {
    doc.set(["dataRules", idx, "condition"], rql);
  } else {
    doc.set(["dataRules", idx, "condition"], rql);
  }
}

// ============ Атрибуты / связи ============

export function addRuleAttribute(
  doc: YamlDocument,
  ruleId: string,
  attributeId: string,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  const attrs = doc.get(["dataRules", idx, "rule", "attributes"]);
  const i = Array.isArray(attrs) ? attrs.length : 0;
  doc.set(["dataRules", idx, "rule", "attributes", i], {
    attribute: attributeId,
  });
}

export function removeRuleAttribute(
  doc: YamlDocument,
  ruleId: string,
  i: number,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataRules", idx, "rule", "attributes", i] as any);
}

export function updateRuleAttributeField(
  doc: YamlDocument,
  ruleId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["dataRules", idx, "rule", "attributes", i, field] as any);
  } else {
    doc.set(["dataRules", idx, "rule", "attributes", i, field], value);
  }
}

export function addRuleLinkage(
  doc: YamlDocument,
  ruleId: string,
  linkageId: string,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  const items = doc.get(["dataRules", idx, "rule", "linkages"]);
  const i = Array.isArray(items) ? items.length : 0;
  doc.set(["dataRules", idx, "rule", "linkages", i], { linkage: linkageId });
}

export function removeRuleLinkage(
  doc: YamlDocument,
  ruleId: string,
  i: number,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataRules", idx, "rule", "linkages", i] as any);
}

export function updateRuleLinkageField(
  doc: YamlDocument,
  ruleId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["dataRules", idx, "rule", "linkages", i, field] as any);
  } else {
    doc.set(["dataRules", idx, "rule", "linkages", i, field], value);
  }
}

// ============ nested (для entityAttribute) ============

export function setNestedType(
  doc: YamlDocument,
  ruleId: string,
  type: "table" | "array" | undefined,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  if (!type) {
    doc.doc.deleteIn(["dataRules", idx, "rule", "nested"] as any);
    return;
  }
  const existing = doc.get(["dataRules", idx, "rule", "nested"]);
  const base: Record<string, unknown> = { type };
  if (type === "table") base.attributes = (existing as any)?.attributes ?? [];
  else base.items = (existing as any)?.items ?? [];
  doc.set(["dataRules", idx, "rule", "nested"], base);
}

export function addNestedAttribute(
  doc: YamlDocument,
  ruleId: string,
  attrId: string,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  const attrs = doc.get(["dataRules", idx, "rule", "nested", "attributes"]);
  const i = Array.isArray(attrs) ? attrs.length : 0;
  doc.set(["dataRules", idx, "rule", "nested", "attributes", i], {
    attribute: attrId,
  });
}

export function removeNestedAttribute(
  doc: YamlDocument,
  ruleId: string,
  i: number,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  doc.doc.deleteIn([
    "dataRules",
    idx,
    "rule",
    "nested",
    "attributes",
    i,
  ] as any);
}

export function addNestedItem(
  doc: YamlDocument,
  ruleId: string,
  item: number | "*",
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  const items = doc.get(["dataRules", idx, "rule", "nested", "items"]);
  const i = Array.isArray(items) ? items.length : 0;
  doc.set(["dataRules", idx, "rule", "nested", "items", i], { item });
}

export function removeNestedItem(
  doc: YamlDocument,
  ruleId: string,
  i: number,
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  doc.doc.deleteIn(["dataRules", idx, "rule", "nested", "items", i] as any);
}

export function updateNestedItem(
  doc: YamlDocument,
  ruleId: string,
  i: number,
  item: number | "*",
): void {
  const idx = findDataRuleIndex(doc, ruleId);
  if (idx < 0) return;
  doc.set(["dataRules", idx, "rule", "nested", "items", i, "item"], item);
}

// ============ Валидация ============

export function validateDataRuleId(id: string): string | null {
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

/** Обязательные поля для каждого effect (по evo_003). */
export function getEffectRequirements(effect: DataRuleEffect): {
  needsValue: boolean;
  needsExpression: boolean;
  needsConstraint: boolean;
  hasHelp: boolean;
  hasMessage: boolean;
} {
  switch (effect) {
    case "hidden":
      return {
        needsValue: false,
        needsExpression: false,
        needsConstraint: false,
        hasHelp: false,
        hasMessage: false,
      };
    case "readonly":
      return {
        needsValue: false,
        needsExpression: false,
        needsConstraint: false,
        hasHelp: true,
        hasMessage: true,
      };
    case "required":
      return {
        needsValue: false,
        needsExpression: false,
        needsConstraint: false,
        hasHelp: true,
        hasMessage: true,
      };
    case "default":
      return {
        needsValue: true,
        needsExpression: true,
        needsConstraint: false,
        hasHelp: false,
        hasMessage: true,
      };
    case "allowed":
      return {
        needsValue: false,
        needsExpression: true,
        needsConstraint: true,
        hasHelp: true,
        hasMessage: true,
      };
  }
}
