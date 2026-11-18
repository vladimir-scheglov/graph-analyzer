import type { AttributeDataType } from "../types";

// ============ dataRules.effect × dataType ============
// По evo_003.txt + uiRules.txt:
//  - hidden     не для Counter
//  - readonly   не для Counter/Identifier/RQL и системных (кроме organizationId)
//  - required   не для Counter/Identifier и системных (кроме organizationId)
//  - default    не для Attachment/Counter/Identifier/Reference/RQL/Table/Workflow,
//               не для связей и системных
//  - allowed    не для Array/Counter/RQL/Table

export type DataRuleEffect =
  | "hidden"
  | "readonly"
  | "required"
  | "default"
  | "allowed";

const SYSTEM_ATTRS = new Set([
  "id",
  "domainId",
  "entityId",
  "entityName",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "tenantId",
  "label",
  "version",
]);

const EFFECT_EXCLUDED_TYPES: Record<DataRuleEffect, Set<AttributeDataType>> = {
  hidden: new Set(["Counter"]),
  readonly: new Set(["Counter", "Identifier", "RQL"]),
  required: new Set(["Counter", "Identifier"]),
  default: new Set([
    "Attachment",
    "Counter",
    "Identifier",
    "Reference",
    "RQL",
    "Table",
    "Workflow",
  ]),
  allowed: new Set(["Array", "Counter", "RQL", "Table"]),
};

export function isEffectAvailableForAttribute(
  effect: DataRuleEffect,
  dataType: AttributeDataType,
  isSystem = false,
): boolean {
  if (EFFECT_EXCLUDED_TYPES[effect].has(dataType)) return false;
  // Системные: только organizationId разрешён для readonly/required.
  if (isSystem) {
    if (effect === "hidden") return true; // hidden у системных не запрещён
    if (effect === "readonly" || effect === "required") return true;
    return false;
  }
  return true;
}

export function isSystemAttribute(attrId: string): boolean {
  return SYSTEM_ATTRS.has(attrId) || attrId === "organizationId";
}

// ============ attribute.constraint.kind × dataType ============

export type ConstraintKind =
  | "required"
  | "range"
  | "length"
  | "regexp"
  | "size"
  | "mime_types"
  | "unique";

const CONSTRAINT_BY_TYPE: Record<ConstraintKind, Set<AttributeDataType>> = {
  required: new Set(), // для всех
  range: new Set(["Integer", "Decimal", "Float"]),
  length: new Set(["String", "Text", "Array"]),
  regexp: new Set(["String", "Text"]),
  size: new Set(["Attachment"]),
  mime_types: new Set(["Attachment"]),
  unique: new Set(["String", "Integer", "Uuid", "Reference", "Array", "Table"]),
};

export function getAvailableConstraints(
  dataType: AttributeDataType,
): ConstraintKind[] {
  const all = Object.keys(CONSTRAINT_BY_TYPE) as ConstraintKind[];
  return all.filter(
    (k) =>
      CONSTRAINT_BY_TYPE[k].size === 0 || CONSTRAINT_BY_TYPE[k].has(dataType),
  );
}

// ============ widget.control.type × dataType (для форм и колонок) ============
// Из evo_002.txt (Редакторы и представления атрибутов).

export type ControlType =
  | "text"
  | "textarea"
  | "uuid"
  | "timestamp"
  | "timestamp_range"
  | "date"
  | "time"
  | "mac"
  | "integer"
  | "integer_slider"
  | "decimal"
  | "decimal_slider"
  | "float"
  | "float_slider"
  | "switch"
  | "checkbox"
  | "bool_text"
  | "select"
  | "radio"
  | "tag"
  | "level"
  | "link"
  | "ip"
  | "cidr"
  | "file"
  | "dragdroparea";

const CONTROL_BY_TYPE: Record<string, ControlType[]> = {
  Uuid: ["uuid", "text"],
  Identifier: ["uuid", "text"],
  Timestamp: ["timestamp", "text"],
  Date: ["date", "text"],
  Time: ["time", "text"],
  TimestampRange: ["timestamp_range", "text"],
  String: ["text", "textarea"],
  Text: ["textarea"],
  MAC: ["mac", "text"],
  Integer: ["integer", "integer_slider", "text"],
  Decimal: ["decimal", "decimal_slider", "text"],
  Float: ["float", "float_slider", "text"],
  Bool: ["switch", "checkbox", "bool_text"],
  Enum: ["select", "radio", "tag", "level", "text"],
  IpAddress: ["ip", "text"],
  CIDR: ["cidr", "text"],
  Attachment: ["file", "dragdroparea", "text"],
  Reference: ["select", "tag", "link"],
  Workflow: ["select", "level", "text"],
  URL: ["link"],
  Counter: ["text"],
};

export function getAvailableControls(
  dataType: AttributeDataType,
): ControlType[] {
  return CONTROL_BY_TYPE[dataType] ?? ["text"];
}

export function getDefaultControl(dataType: AttributeDataType): ControlType {
  return getAvailableControls(dataType)[0] ?? "text";
}

// ============ action.type × контекст ============
// Для виджета действия в entity_view / list_view / page и т.д.

export type ActionContext = "entity_view" | "list_view" | "page";
export type ActionType = string; // полный список в types.ts

const ACTION_TYPES_BY_CONTEXT: Record<ActionContext, Set<ActionType>> = {
  entity_view: new Set([
    "open_panel",
    "open_modal",
    "open_page",
    "opengraphview",
    "openboardview",
    "open_list",
    "open_tree",
    "open_view",
    "remove",
    "setattributevalue",
    "automation",
    "scenario",
    "generateqrcode",
    "copyentitylink",
  ]),
  list_view: new Set([
    "open_panel",
    "open_modal",
    "open_page",
    "opengraphview",
    "open_list",
    "bulk",
    "automation",
    "scenario",
    "generateqrcode",
    "copyentitylink",
  ]),
  page: new Set([
    "open_modal",
    "open_page",
    "remove",
    "setattributevalue",
    "automation",
    "scenario",
    "generateqrcode",
    "copyentitylink",
  ]),
};

export function isActionAllowedInContext(
  type: ActionType,
  context: ActionContext,
): boolean {
  return ACTION_TYPES_BY_CONTEXT[context].has(type);
}

// ============ view.type × target uiRule ============

export function isValidUiRuleTarget(target: string, viewType: string): boolean {
  switch (target) {
    case "list_view":
      return viewType === "list" || viewType === "tabs_list";
    case "entity_view":
      return viewType === "entity";
    case "entity_attribute":
      return viewType === "entity";
    default:
      return false;
  }
}
