import type {
  AttributeRecord,
  DataTypeRecord,
  EntityRecord,
  MixinRecord,
  ModelIndex,
  ModelStats,
  SequenceRecord,
  DataTypeKind,
  DomainMeta,
  EntityLinkage,
  ViewElementRef,
  PrefixRuleRecord,
  EntitySortingRecord,
  EntityBindRecord,
  EntityReconciliationRecord,
  EntityIdentificationRecord,
  GenericSnapshotEntry,
  DataRuleRecord,
  DataRuleTarget,
  DataRuleEffect,
  DataRuleAttributeAction,
  DataRuleLinkageAction,
  DataRuleNestedAttribute,
  DataRuleNestedItem,
  DataRuleNested,
  TreeRecord,
  TreeHierarchyChild,
  TreeSortingRecord,
  TransitiveLinkageRecord,
  TransitiveLinkageJoin,
  MenuRecord,
  MenuItemRecord,
  MediaRecord,
  PermissionRecord,
  AccessRuleRecord,
  AccessRuleTarget,
  AccessRuleItem,
  AccessRuleItemKind,
  AccessRuleException,
  LocalizationRecord,
  LocalizationKeyRecord,
  UiRuleOperation,
  CounterColorPatternRecord,
  ActionBulkAttributeUse,
  ActionBulkLinkageUse,
  ActionBulkSettings,
  ActionRecord,
  ActionValueRecord,
  ViewColumnRecord,
  ViewTableFilterAttribute,
  ViewTableFilterLinkage,
  ViewTableFilterRecord,
  ViewTableSortingColumn,
  ViewTableSortingRecord,
  ViewTableActionItemRef,
  ViewTableActionRecord,
  ViewTablePagingRecord,
  ActionControlRecord,
  ViewTreeFilterRecord,
  ViewTreeFilterLinkage,
  ViewTreeFilterAttribute,
  MixinViewRecord,
  MixinTarget,
  MixinComponentRef,
  MixinTabRef,
  MixinActionRef,
  MixinColumnRef,
  MixinPosition,
  MixinChangeAdd,
  MixinChangeDelete,
  MixinChangeReplace,
  ViewWidgetColumnRef,
  ViewSourceJoinRecord,
  ViewWidgetLinkageRef,
  DataTypeViewColumn,
  DataTypeViewSortingBy,
  DataTypeViewSortingColumn,
  DataTypeViewPaging,
  ExchangeSettingsRecord,
  ExchangeEntitySettings,
  ExchangeSettingsAttributeFormats,
  ViewMenuActionRecord,
  ViewGroupComponentRecord,
  AttributeConstraint,
  ActionHookRecord,
  ActionHooksRecord,
} from "../../shared/model-types";
import { buildDomainSchemaSummary } from "./domain-schema";
import type { DomainSchemaSummary } from "../../shared/model-types";
import { lintModel, computeSonarScores } from "./linter";
import { detectOrphans } from "./orphans";
import { computeMartinReport } from "./martin-metrics";
import { detectPii } from "./pii-detector";
import type {
  ScenarioActionRef,
  ScenarioRecord,
  UiRuleRecord,
  UiPresetRecord,
  UiRuleWidgetRef,
  UiRuleGroupRef,
  UiRuleColumnRef,
  UiRuleNested,
  ViewElementsRecord,
  ViewActionPanelRecord,
  ViewGroupRecord,
  ViewWidgetRecord,
} from "../../shared/model-types";

// ============ Базовые типы данных ============

const BASE_DATA_TYPES = new Set([
  "Uuid",
  "Timestamp",
  "Date",
  "Time",
  "TimestampRange",
  "String",
  "Text",
  "MAC",
  "Integer",
  "Decimal",
  "Float",
  "Bool",
  "Enum",
  "IpAddress",
  "CIDR",
  "Reference",
  "Workflow",
  "Array",
  "Table",
  "Calculation",
  "Configuration",
  "Variable",
  "URL",
  "Identifier",
  "Attachment",
  "Counter",
  "RQL",
  "Automation",
]);

// ============ FQID-утилиты ============

/**
 * Нормализует FQID: приводит к lowercase, разрешает локальные ссылки.
 *
 *  "Device"                          → "current.domain/device"
 *  "it.assets.rvision.ru/Device"     → "it.assets.rvision.ru/device"
 */
export function normalizeFqid(
  fqid: string | null | undefined,
  currentDomain: string,
): string | null {
  if (!fqid || typeof fqid !== "string") return null;
  const trimmed = fqid.trim();
  if (!trimmed) return null;

  if (trimmed.includes("/")) {
    return trimmed.toLowerCase();
  }
  return (currentDomain + "/" + trimmed).toLowerCase();
}

// ============ Generic sections (dataRules, uiRules, …) ============

const GENERIC_SECTION_KEYS = [
  "dataRules",
  "uiRules",
  "uiPresets",
  "views",
  "menus",
  "medias",
  "trees",
  "transitiveLinkages",
  "permissions",
  "localizations",
  "actions",
  "accessRules",
  "linkages",
  "widgets",
  "counterColorPatterns",
] as const;

type GenericSectionKey = (typeof GENERIC_SECTION_KEYS)[number];

/** Быстрый детерминированный хэш без crypto (FNV-1a 32-bit). */
function fnv1a(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function hashJsonSafe(value: unknown): string {
  try {
    return fnv1a(JSON.stringify(value));
  } catch {
    return "0";
  }
}

function pickGenericId(
  sectionKey: GenericSectionKey,
  item: any,
  index: number,
): string | null {
  if (!item || typeof item !== "object") return null;

  if (typeof item.id === "string" && item.id) return item.id;

  if (sectionKey === "localizations" && typeof item.language === "string") {
    return item.language;
  }

  // accessRules не имеет своего id — генерируем синтетический ключ
  if (sectionKey === "accessRules") {
    const target = typeof item.target === "string" ? item.target : "?";
    const entity = item.entity ? `@${item.entity}` : "";
    const linkage = item.linkage ? `@${item.linkage}` : "";
    return `accessRule[${index}]:${target}${entity}${linkage}`;
  }

  return null;
}

function pickGenericLabel(
  sectionKey: GenericSectionKey,
  item: any,
): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  if (typeof item.name === "string" && item.name && item.name !== item.id)
    return item.name;
  if (typeof item.label === "string" && item.label && item.label !== item.id)
    return item.label;
  if (typeof item.description === "string" && item.description)
    return item.description;
  return undefined;
}

function pickGenericType(
  sectionKey: GenericSectionKey,
  item: any,
): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  if (typeof item.type === "string" && item.type) return item.type;
  if (typeof item.kind === "string" && item.kind) return item.kind;
  if (typeof item.target === "string" && item.target) return item.target;
  return undefined;
}

function collectGenericSections(
  rawDomains: RawDomainEntry[],
): Record<string, GenericSnapshotEntry[]> {
  const result: Record<string, GenericSnapshotEntry[]> = {};
  for (const key of GENERIC_SECTION_KEYS) result[key] = [];

  for (const d of rawDomains) {
    const raw = d.rawData || {};
    for (const key of GENERIC_SECTION_KEYS) {
      const arr = raw[key];
      if (!Array.isArray(arr)) continue;
      arr.forEach((item: any, index: number) => {
        // ← index
        const id = pickGenericId(key, item, index); // ← прокидываем
        if (!id) return;
        result[key].push({
          id,
          domainId: d.id,
          hash: hashJsonSafe(item),
          label: pickGenericLabel(key, item),
          type: pickGenericType(key, item),
        });
      });
    }
  }

  return result;
}

export function extractDomainFromFqid(fqid: string): string {
  const slash = fqid.indexOf("/");
  return slash > 0 ? fqid.slice(0, slash).toLowerCase() : "";
}

export function extractEntityFromFqid(fqid: string): string {
  const slash = fqid.indexOf("/");
  return slash > 0 ? fqid.slice(slash + 1) : fqid;
}

export function attrKey(entityFqid: string, attrId: string): string {
  return `${entityFqid}#${attrId}`;
}

// ============ Входные данные от DomainAnalyzer ============

export interface RawDomainEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  tags: string[];
  /** Сырой YAML после loadYaml. */
  rawData: any;
}

// ============ Парсинг атрибутов ============

function parseConstraints(raw: any): AttributeConstraint[] {
  if (!Array.isArray(raw)) return [];
  const out: AttributeConstraint[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const kind = String(c.kind || "").trim();
    if (!kind) continue;
    const detail: AttributeConstraint = { kind };
    if (c.min !== undefined && c.min !== null) detail.min = c.min;
    if (c.max !== undefined && c.max !== null) detail.max = c.max;
    if (typeof c.regexp === "string" && c.regexp) detail.regexp = c.regexp;
    if (Array.isArray(c.mimeTypes)) {
      const arr = c.mimeTypes.map(String).filter(Boolean);
      if (arr.length > 0) detail.mimeTypes = arr;
    }
    if (typeof c.message === "string" && c.message) detail.message = c.message;
    out.push(detail);
  }
  return out;
}

function parseAttribute(
  raw: any,
  entityFqid: string,
  domainId: string,
  customDataTypeIds: Set<string>,
): AttributeRecord | null {
  if (!raw || !raw.id) return null;

  const dataType = String(raw.dataType || "String");
  let dataTypeKind: DataTypeKind = "unknown";
  if (BASE_DATA_TYPES.has(dataType)) dataTypeKind = "base";
  else if (customDataTypeIds.has(dataType)) dataTypeKind = "custom";

  const constraintDetails = parseConstraints(raw.constraints);

  const record: AttributeRecord = {
    id: String(raw.id),
    entityFqid,
    name: String(raw.name || raw.id),
    description: String(raw.description || ""),
    dataType,
    dataTypeKind,
    constraints: constraintDetails.map((c) => c.kind),
    constraintDetails:
      constraintDetails.length > 0 ? constraintDetails : undefined,
    usedInViews: 0,
    usedInRules: 0,
  };

  if (
    raw.default !== undefined &&
    raw.default !== null &&
    (typeof raw.default === "string" ||
      typeof raw.default === "number" ||
      typeof raw.default === "boolean")
  ) {
    record.default = raw.default;
  }

  // Базовые флаги
  if (raw.readonly === true) record.readonly = true;
  if (raw.searchable === false) record.searchable = false;
  if (raw.comments === true) record.comments = true;

  // Reference
  if (dataType === "Reference" && raw.entity) {
    const rawRef = String(raw.entity).trim();
    if (!rawRef.startsWith("external:")) {
      const ref = normalizeFqid(rawRef, domainId);
      if (ref) record.referenceEntity = ref;
    }
  }

  // Array
  if (dataType === "Array" && raw.item && typeof raw.item === "object") {
    record.itemDataType = String(raw.item.dataType || "");
    if (raw.item.dataType === "Reference" && raw.item.entity) {
      const rawRef = String(raw.item.entity).trim();
      if (!rawRef.startsWith("external:")) {
        const ref = normalizeFqid(rawRef, domainId);
        if (ref) record.itemReferenceEntity = ref;
      }
    }
    if (Array.isArray(raw.item.constraints)) {
      record.itemConstraints = parseConstraints(raw.item.constraints).map(
        (c) => c.kind,
      );
    }
  }

  // Table — один уровень вглубь
  if (dataType === "Table" && Array.isArray(raw.attributes)) {
    record.nestedAttributes = raw.attributes
      .map((a: any) =>
        parseAttribute(a, entityFqid, domainId, customDataTypeIds),
      )
      .filter((x): x is AttributeRecord => x !== null);
    if (typeof raw.maxRows === "number") record.maxRows = raw.maxRows;
  }

  // Calculation
  if (
    dataType === "Calculation" &&
    raw.calculation &&
    typeof raw.calculation === "object"
  ) {
    record.calculation = {
      schemaId: String(raw.calculation.schemaId || ""),
      id: String(raw.calculation.id || ""),
    };
  }

  // Identifier
  if (dataType === "Identifier") {
    if (typeof raw.template === "string") record.template = raw.template;
    if (Array.isArray(raw.segment)) record.segment = raw.segment.map(String);
    if (typeof raw.defaultPrefix === "string")
      record.defaultPrefix = raw.defaultPrefix;
    if (typeof raw.incrementTemplate === "string")
      record.incrementTemplate = raw.incrementTemplate;
    if (typeof raw.sequence === "string") {
      const seq = normalizeFqid(raw.sequence, domainId);
      if (seq) record.sequence = seq;
    }
    if (Array.isArray(raw.prefixRules)) {
      record.prefixRules = raw.prefixRules
        .map((r: any) => {
          if (!r || !r.id) return null;
          const attribute =
            typeof r.attribute === "string" ? r.attribute.trim() : "";
          const src = r.source || {};
          const entity = normalizeFqid(src.entity, domainId);
          if (!attribute || !entity) return null;
          return {
            id: String(r.id),
            attribute,
            source: {
              entity,
              key: String(src.key || ""),
              value: String(src.value || ""),
            },
          };
        })
        .filter((x): x is PrefixRuleRecord => x !== null);
    }
  }

  return record;
}

// ============ Парсинг сущностей ============

function parseEntity(
  raw: any,
  domainId: string,
  domainMeta: RawDomainEntry,
  customDataTypeIds: Set<string>,
): EntityRecord | null {
  if (!raw || !raw.id) return null;

  const entityId = String(raw.id);
  const fqid = `${domainId}/${entityId}`.toLowerCase();

  const attributes = Array.isArray(raw.attributes)
    ? raw.attributes
        .map((a: any) => parseAttribute(a, fqid, domainId, customDataTypeIds))
        .filter((x: AttributeRecord | null): x is AttributeRecord => x !== null)
    : [];

  const entity: EntityRecord = {
    fqid,
    domainId,
    entityId,
    name: String(raw.name || entityId),
    description: String(raw.description || ""),
    label: typeof raw.label === "string" ? raw.label : null,
    inherits: normalizeFqid(raw.inherits, domainId),
    attributes,
    referencedByInheritance: [],
    linkedViaLinkages: [],
    mixinSources: [],
    domainTags: domainMeta.tags,
    domainVersion: domainMeta.version,
    domainAuthor: domainMeta.author,
  };

  // kind / флаги
  if (
    raw.kind === "abstract" ||
    raw.kind === "static" ||
    raw.kind === "regular"
  ) {
    entity.kind = raw.kind;
  }
  if (raw.scanTarget === true) entity.scanTarget = true;
  if (raw.scanTargetGroup === true) entity.scanTargetGroup = true;
  if (raw.createZeroRecord === true) entity.createZeroRecord = true;

  // icons / graphView
  if (typeof raw.icons === "string") {
    const icons = normalizeFqid(raw.icons, domainId);
    if (icons) entity.icons = icons;
  }
  if (
    raw.graphView &&
    typeof raw.graphView === "object" &&
    raw.graphView.iconColor
  ) {
    entity.graphView = { iconColor: String(raw.graphView.iconColor) };
  }

  // elementOf / extends / partOf
  const elementOf = normalizeFqid(raw.elementOf, domainId);
  if (elementOf) entity.elementOf = elementOf;
  const extendsFqid = normalizeFqid(raw.extends, domainId);
  if (extendsFqid) entity.extends = extendsFqid;
  const partOfFqid = normalizeFqid(raw.partOf, domainId);
  if (partOfFqid) entity.partOf = partOfFqid;

  // sorting
  if (Array.isArray(raw.sorting)) {
    entity.sorting = raw.sorting
      .map((s: any) => {
        if (!s || !s.id) return null;
        const by: EntitySortingRecord["by"] = [];
        if (Array.isArray(s.by)) {
          for (const b of s.by) {
            if (!b || !b.attribute) continue;
            by.push({
              attribute: String(b.attribute),
              direction: b.direction === "desc" ? "desc" : "asc",
            });
          }
        }
        return { id: String(s.id), by };
      })
      .filter((x): x is EntitySortingRecord => x !== null);
  }

  // searching
  if (Array.isArray(raw.searching)) {
    // Каноническая форма: [{attribute: x}, ...]. Допускаем и [x, y] — YAML-шорткат.
    entity.searching = raw.searching
      .map((s: any) => {
        if (typeof s === "string" && s) return { attribute: s };
        if (s && typeof s === "object" && typeof s.attribute === "string") {
          return { attribute: s.attribute };
        }
        return null;
      })
      .filter((x): x is { attribute: string } => x !== null);
    entity.searchingForm = "array";
  } else if (
    raw.searching &&
    typeof raw.searching === "object" &&
    Array.isArray(raw.searching.attributes)
  ) {
    // Legacy / R-Vision docs: {attributes: [a, b, ...]}. Нормализуем в [{attribute}],
    // но помечаем форму — линтер выкатит warning.
    entity.searching = raw.searching.attributes
      .map((a: any) => (typeof a === "string" && a ? { attribute: a } : null))
      .filter((x): x is { attribute: string } => x !== null);
    entity.searchingForm = "object";
  }

  // identification
  if (Array.isArray(raw.identification)) {
    entity.identification = raw.identification
      .map((r: any) => {
        if (!r || !r.id) return null;
        return {
          id: String(r.id),
          rule: Array.isArray(r.rule) ? r.rule : [],
          filter: Array.isArray(r.filter) ? r.filter.map(String) : undefined,
        };
      })
      .filter((x): x is EntityIdentificationRecord => x !== null);
  }

  // reconciliation
  if (Array.isArray(raw.reconciliation)) {
    entity.reconciliation = raw.reconciliation
      .map((r: any) => {
        if (!r) return null;
        const out: EntityReconciliationRecord = {};
        if (typeof r.attribute === "string") out.attribute = r.attribute;
        if (Array.isArray(r.sourcePriority)) {
          out.sourcePriority = r.sourcePriority
            .map((s: any) => (typeof s === "string" ? s : s?.source))
            .filter(Boolean);
        }
        if (Array.isArray(r.default)) {
          out.default = r.default
            .map((s: any) => (typeof s === "string" ? s : s?.source))
            .filter(Boolean);
        }
        if (r.mergeStrategy && typeof r.mergeStrategy === "object") {
          out.mergeStrategy = String(r.mergeStrategy.type || "");
        }
        return Object.keys(out).length > 0 ? out : null;
      })
      .filter((x): x is EntityReconciliationRecord => x !== null);
  }

  // projection
  if (Array.isArray(raw.projection)) {
    entity.projection = raw.projection
      .map((p: any) =>
        p && p.attribute ? { attribute: String(p.attribute) } : null,
      )
      .filter((x): x is { attribute: string } => x !== null);
  }

  // treeNode
  if (
    raw.treeNode &&
    typeof raw.treeNode === "object" &&
    Array.isArray(raw.treeNode.types)
  ) {
    entity.treeNode = {
      types: raw.treeNode.types
        .map((t: any) => {
          if (!t || !t.type) return null;
          const out: { type: string; of?: string[] } = { type: String(t.type) };
          if (Array.isArray(t.of)) {
            out.of = t.of
              .map((o: any) => (typeof o === "string" ? o : o?.treeNode))
              .filter(Boolean);
          }
          return out;
        })
        .filter((x): x is { type: string; of?: string[] } => x !== null),
    };
  }

  // externals
  if (
    raw.externals &&
    typeof raw.externals === "object" &&
    Array.isArray(raw.externals.entities)
  ) {
    const extEntities: string[] = [];
    for (const x of raw.externals.entities) {
      const rawRef = typeof x === "string" ? x : x?.entity;
      if (!rawRef) continue;
      const fqid = normalizeFqid(String(rawRef), domainId);
      if (fqid) extEntities.push(fqid);
    }
    entity.externals = {
      entities: extEntities,
      type: raw.externals.type === "selection" ? "selection" : "composition",
    };
    if (
      raw.externals.type !== undefined &&
      raw.externals.type !== "selection" &&
      raw.externals.type !== "composition"
    ) {
      entity.__rawExternalsType = String(raw.externals.type);
    }
  }

  // bind
  if (raw.bind && typeof raw.bind === "object") {
    const external =
      typeof raw.bind.external === "string" ? raw.bind.external : "";
    const internal =
      typeof raw.bind.internal === "string" ? raw.bind.internal : "";
    if (external && internal) {
      const bind: EntityBindRecord = { external, internal };
      if (Array.isArray(raw.bind.aliases)) {
        bind.aliases = raw.bind.aliases
          .map((a: any) =>
            a && a.external && a.internal
              ? { external: String(a.external), internal: String(a.internal) }
              : null,
          )
          .filter(
            (x): x is { external: string; internal: string } => x !== null,
          );
      }
      entity.bind = bind;
    }
  }

  // overrides
  if (Array.isArray(raw.overrides)) {
    entity.overrides = raw.overrides
      .map((o: any) => {
        if (!o) return null;
        const ancestors = Array.isArray(o.ancestors)
          ? o.ancestors
              .map((x: any) => (typeof x === "string" ? x : x?.entity))
              .filter(Boolean)
          : [];
        const attrs = Array.isArray(o.attributes)
          ? o.attributes
              .map((a: any) =>
                a && a.attribute
                  ? { attribute: String(a.attribute), value: a.value }
                  : null,
              )
              .filter((x): x is { attribute: string; value: any } => x !== null)
          : [];
        return { ancestors, attributes: attrs };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  return entity;
}

// ============ Парсинг dataTypes ============

function parseDataType(raw: any, domainId: string): DataTypeRecord | null {
  if (!raw || !raw.id || !raw.dataType) return null;

  const kind = String(raw.dataType);
  if (kind !== "Enum" && kind !== "Table" && kind !== "Workflow") return null;

  const record: DataTypeRecord = {
    id: String(raw.id),
    domainId,
    name: String(raw.name || raw.id),
    description: String(raw.description || ""),
    kind: kind as "Enum" | "Table" | "Workflow",
  };

  if (kind === "Enum" && Array.isArray(raw.values)) {
    record.valuesCount = raw.values.length;
    record.values = raw.values
      .map((v: any) => (v?.id ? String(v.id) : null))
      .filter((x: string | null): x is string => x !== null);
  } else if (kind === "Workflow" && Array.isArray(raw.statuses)) {
    record.statusesCount = raw.statuses.length;
    record.statuses = raw.statuses
      .map((v: any) => (v?.id ? String(v.id) : null))
      .filter((x: string | null): x is string => x !== null);
  } else if (kind === "Table" && Array.isArray(raw.attributes)) {
    record.attributesCount = raw.attributes.length;
    record.columns = raw.attributes
      .map((v: any) => (v?.id ? String(v.id) : null))
      .filter((x: string | null): x is string => x !== null);

    record.tableAttributes = raw.attributes
      .map((a: any) => parseAttribute(a, "", domainId, new Set()))
      .filter((x: AttributeRecord | null): x is AttributeRecord => x !== null);
  }

  // ============ view (полиморфно по kind) ============
  if (kind === "Enum" && Array.isArray(raw.view)) {
    const enumView: Array<{ value: string; color?: string }> = [];
    for (const v of raw.view) {
      if (!v || typeof v !== "object") continue;
      if (typeof v.value !== "string" || !v.value) continue;
      const item: { value: string; color?: string } = { value: v.value };
      if (typeof v.color === "string" && v.color) item.color = v.color;
      enumView.push(item);
    }
    if (enumView.length > 0) record.enumView = enumView;
  } else if (kind === "Workflow" && Array.isArray(raw.view)) {
    const workflowView: Array<{ status: string; color?: string }> = [];
    for (const v of raw.view) {
      if (!v || typeof v !== "object") continue;
      if (typeof v.status !== "string" || !v.status) continue;
      const item: { status: string; color?: string } = { status: v.status };
      if (typeof v.color === "string" && v.color) item.color = v.color;
      workflowView.push(item);
    }
    if (workflowView.length > 0) record.workflowView = workflowView;
  } else if (kind === "Table" && raw.view && typeof raw.view === "object") {
    const v = raw.view;

    const columns: DataTypeViewColumn[] = [];
    if (Array.isArray(v.columns)) {
      for (const c of v.columns) {
        if (!c || typeof c !== "object") continue;
        const colId = typeof c.id === "string" ? c.id : "";
        const col: DataTypeViewColumn = { id: colId };
        if (typeof c.attribute === "string" && c.attribute) {
          col.attribute = c.attribute;
        }
        if (typeof c.label === "string" && c.label) col.label = c.label;
        if (c.layout && typeof c.layout === "object") {
          const layout: NonNullable<DataTypeViewColumn["layout"]> = {};
          if (typeof c.layout.visible === "boolean") {
            layout.visible = c.layout.visible;
          }
          if (c.layout.width && typeof c.layout.width === "object") {
            const w: { default?: number; min?: number; max?: number } = {};
            if (typeof c.layout.width.default === "number") {
              w.default = c.layout.width.default;
            }
            if (typeof c.layout.width.min === "number") {
              w.min = c.layout.width.min;
            }
            if (typeof c.layout.width.max === "number") {
              w.max = c.layout.width.max;
            }
            if (Object.keys(w).length > 0) layout.width = w;
          }
          if (Object.keys(layout).length > 0) col.layout = layout;
        }
        if (Array.isArray(c.use)) {
          const uses = c.use
            .map((u: any) =>
              u && typeof u.attribute === "string" ? u.attribute : null,
            )
            .filter((x: string | null): x is string => !!x);
          if (uses.length > 0) col.use = uses;
        }
        columns.push(col);
      }
    }

    let sortingBy: DataTypeViewSortingBy | undefined;
    if (v.sortingBy && typeof v.sortingBy === "object") {
      const sb = v.sortingBy;
      const cols: DataTypeViewSortingColumn[] = [];
      if (Array.isArray(sb.columns)) {
        for (const sc of sb.columns) {
          if (!sc || typeof sc !== "object") continue;
          if (typeof sc.column !== "string" || !sc.column) continue;
          if (typeof sc.sorting !== "string" || !sc.sorting) continue;
          cols.push({ column: sc.column, sorting: sc.sorting });
        }
      }
      sortingBy = { columns: cols };
      if (sb.default && typeof sb.default === "object") {
        if (typeof sb.default.column === "string" && sb.default.column) {
          sortingBy.defaultColumn = sb.default.column;
        }
        if (sb.default.direction === "asc" || sb.default.direction === "desc") {
          sortingBy.defaultDirection = sb.default.direction;
        }
      }
      if (cols.length === 0 && !sortingBy.defaultColumn) {
        sortingBy = undefined;
      }
    }

    let paging: DataTypeViewPaging | undefined;
    if (v.paging && typeof v.paging === "object") {
      const p = v.paging;
      const rawSizes = Array.isArray(p.sizes) ? p.sizes : [];
      const sizes: number[] = [];
      for (const s of rawSizes) {
        const n = typeof s === "number" ? s : Number(s);
        if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) sizes.push(n);
      }
      paging = { rawSizes, sizes, rawDefaultSize: p.defaultSize };
      if (p.defaultSize !== undefined) {
        const n =
          typeof p.defaultSize === "number"
            ? p.defaultSize
            : Number(p.defaultSize);
        if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
          paging.defaultSize = n;
        }
      }
    }

    const tableView: NonNullable<DataTypeRecord["tableView"]> = { columns };
    if (sortingBy) tableView.sortingBy = sortingBy;
    if (paging) tableView.paging = paging;
    if (typeof v.rowHeight === "number") tableView.rowHeight = v.rowHeight;
    record.tableView = tableView;
  }

  // ============ Workflow: initial, finals, transitions ============
  if (kind === "Workflow") {
    if (typeof raw.initial === "string" && raw.initial) {
      record.initial = raw.initial;
    }
    if (Array.isArray(raw.finals)) {
      const finals = raw.finals
        .map((f: any) => String(f || "").trim())
        .filter(Boolean);
      if (finals.length > 0) record.finals = finals;
    }
    if (Array.isArray(raw.transitions)) {
      const transitions: Array<{ from: string; to: string }> = [];
      for (const t of raw.transitions) {
        if (!t || typeof t !== "object") continue;
        const from = typeof t.from === "string" ? t.from.trim() : "";
        const to = typeof t.to === "string" ? t.to.trim() : "";
        if (!from || !to) continue;
        transitions.push({ from, to });
      }
      if (transitions.length > 0) record.transitions = transitions;
    }
  }

  // ============ Table: maxRows ============
  if (kind === "Table" && typeof raw.maxRows === "number") {
    record.maxRows = raw.maxRows;
  }

  return record;
}

// ============ Парсинг sequences ============

function parseSequence(raw: any, domainId: string): SequenceRecord | null {
  if (!raw || !raw.id) return null;
  const n = Number(raw.startFrom);
  return {
    id: String(raw.id),
    domainId,
    startFrom: Number.isFinite(n) && n > 0 ? n : 1,
    description: String(raw.description || ""),
    usedByAttributes: [],
  };
}

function parseCounterColorPattern(
  raw: any,
  domainId: string,
): CounterColorPatternRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  return {
    id: raw.id,
    domainId,
    red: String(raw.red || ""),
    yellow: String(raw.yellow || ""),
  };
}

// ============ exchangeSettings ============

function splitCommaList(raw: any): string[] | undefined {
  if (typeof raw !== "string") return undefined;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseExchangeSettings(
  raw: any,
  domainId: string,
): ExchangeSettingsRecord | null {
  if (!raw || typeof raw !== "object") return null;

  const out: ExchangeSettingsRecord = { domainId, entities: [] };

  if (typeof raw.enable === "boolean") out.enable = raw.enable;
  if (typeof raw.description === "string" && raw.description) {
    out.description = raw.description;
  }
  if (typeof raw.label === "string" && raw.label) out.label = raw.label;
  if (typeof raw.noCmsSync === "boolean") out.noCmsSync = raw.noCmsSync;

  if (raw.attributeFormats && typeof raw.attributeFormats === "object") {
    const af: ExchangeSettingsAttributeFormats = {};
    for (const k of ["Date", "Time", "Timestamp", "TimestampRange"] as const) {
      if (
        typeof raw.attributeFormats[k] === "string" &&
        raw.attributeFormats[k]
      ) {
        af[k] = raw.attributeFormats[k];
      }
    }
    if (Object.keys(af).length > 0) out.attributeFormats = af;
  }

  if (raw.entities && typeof raw.entities === "object") {
    for (const [entityKey, cfg] of Object.entries(raw.entities)) {
      if (typeof entityKey !== "string" || !entityKey) continue;
      const entityFqid = normalizeFqid(entityKey, domainId);
      if (!entityFqid) continue;

      const rec: ExchangeEntitySettings = {
        entityFqid,
        entityIdRaw: entityKey,
      };

      if (cfg && typeof cfg === "object") {
        const c = cfg as any;
        if (typeof c.domainLabel === "string" && c.domainLabel) {
          rec.domainLabel = c.domainLabel;
        }
        if (typeof c.enable === "boolean") rec.enable = c.enable;
        if (typeof c.label === "string" && c.label) rec.label = c.label;
        if (typeof c.noCmsSync === "boolean") rec.noCmsSync = c.noCmsSync;

        if (typeof c.forExport === "string" && c.forExport) {
          rec.forExport = c.forExport;
        }
        const upsert = splitCommaList(c.upsertWith);
        if (upsert) rec.upsertWith = upsert;
        const ignore = splitCommaList(c.ignoreAttributes);
        if (ignore) rec.ignoreAttributes = ignore;

        if (typeof c.exportSystemAttributes === "string") {
          const val = c.exportSystemAttributes.trim();
          if (val.toLowerCase() === "all") {
            rec.exportSystemAttributes = "all";
          } else {
            const list = splitCommaList(val);
            if (list) rec.exportSystemAttributes = list;
          }
        }
      }

      out.entities.push(rec);
    }
  }

  return out;
}
// ============ Парсинг mixins ============

// ============ Миксины ============

function parseMixinPosition(raw: any): MixinPosition | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p: MixinPosition = {};
  if (raw.type === "begin" || raw.type === "after" || raw.type === "end") {
    p.type = raw.type;
  }
  if (raw.after !== undefined) p.after = raw.after;
  return Object.keys(p).length > 0 ? p : undefined;
}

function parseMixinComponentRef(raw: any): MixinComponentRef | null {
  if (!raw || typeof raw !== "object") return null;
  const ref: MixinComponentRef = {};
  if (typeof raw.widget === "string") ref.widget = raw.widget;
  else if (
    raw.widget &&
    typeof raw.widget === "object" &&
    typeof raw.widget.id === "string"
  ) {
    ref.widget = raw.widget.id;
  }
  if (typeof raw.block === "string") ref.block = raw.block;
  return ref.widget || ref.block ? ref : null;
}

function parseMixinChangeAdd(raw: any): MixinChangeAdd | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const add: MixinChangeAdd = {};

  if (Array.isArray(raw.components)) {
    const comps = raw.components
      .map(parseMixinComponentRef)
      .filter((x: MixinComponentRef | null): x is MixinComponentRef => !!x);
    if (comps.length > 0) add.components = comps;
  }

  if (
    raw.tabs &&
    typeof raw.tabs === "object" &&
    Array.isArray(raw.tabs.tabs)
  ) {
    const tabs: MixinTabRef[] = raw.tabs.tabs
      .map((t: any) => {
        if (!t || typeof t !== "object" || typeof t.tab !== "string")
          return null;
        return {
          tab: t.tab,
          label: typeof t.label === "string" ? t.label : undefined,
        } as MixinTabRef;
      })
      .filter((x: MixinTabRef | null): x is MixinTabRef => !!x);
    if (tabs.length > 0) add.tabs = tabs;
    if (raw.tabs.position) add.position = parseMixinPosition(raw.tabs.position);
  }

  if (
    raw.menu &&
    typeof raw.menu === "object" &&
    Array.isArray(raw.menu.menu)
  ) {
    const menu: MixinActionRef[] = raw.menu.menu
      .map((a: any) => {
        if (!a || typeof a !== "object" || typeof a.action !== "string") {
          return null;
        }
        return {
          action: a.action,
          label: typeof a.label === "string" ? a.label : undefined,
        } as MixinActionRef;
      })
      .filter((x: MixinActionRef | null): x is MixinActionRef => !!x);
    if (menu.length > 0) add.menu = menu;
    if (raw.menu.position) add.position = parseMixinPosition(raw.menu.position);
  }

  if (typeof raw.form === "string") add.form = raw.form;
  if (typeof raw.list === "string") add.list = raw.list;
  if (typeof raw.block === "string") add.block = raw.block;

  if (
    raw.actionPanel &&
    typeof raw.actionPanel === "object" &&
    Array.isArray(raw.actionPanel.actionPanel)
  ) {
    const ap: MixinActionRef[] = raw.actionPanel.actionPanel
      .map((a: any) => {
        if (!a || typeof a !== "object" || typeof a.widget !== "string") {
          return null;
        }
        return {
          action: a.widget,
          label: typeof a.label === "string" ? a.label : undefined,
        } as MixinActionRef;
      })
      .filter((x: MixinActionRef | null): x is MixinActionRef => !!x);
    if (ap.length > 0) add.actionPanel = ap;
    if (raw.actionPanel.position) {
      add.position = parseMixinPosition(raw.actionPanel.position);
    }
  }

  if (raw.position) add.position = parseMixinPosition(raw.position);

  return Object.keys(add).length > 0 ? add : undefined;
}

function parseMixinChangeDelete(raw: any): MixinChangeDelete | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const del: MixinChangeDelete = {};

  if (Array.isArray(raw.components)) {
    const comps = raw.components
      .map(parseMixinComponentRef)
      .filter((x: MixinComponentRef | null): x is MixinComponentRef => !!x);
    if (comps.length > 0) del.components = comps;
  }

  if (Array.isArray(raw.tabs)) {
    const tabs: MixinTabRef[] = raw.tabs
      .map((t: any) => {
        if (!t || typeof t !== "object" || typeof t.tab !== "string") {
          return null;
        }
        return { tab: t.tab } as MixinTabRef;
      })
      .filter((x: MixinTabRef | null): x is MixinTabRef => !!x);
    if (tabs.length > 0) del.tabs = tabs;
  }

  if (Array.isArray(raw.menu)) {
    const menu: MixinActionRef[] = raw.menu
      .map((a: any) => {
        if (!a || typeof a !== "object" || typeof a.action !== "string") {
          return null;
        }
        return { action: a.action } as MixinActionRef;
      })
      .filter((x: MixinActionRef | null): x is MixinActionRef => !!x);
    if (menu.length > 0) del.menu = menu;
  }

  if (Array.isArray(raw.actionPanel)) {
    const ap: MixinActionRef[] = raw.actionPanel
      .map((a: any) => {
        if (!a || typeof a !== "object") return null;
        const id =
          typeof a.widget === "string"
            ? a.widget
            : typeof a.action === "string"
              ? a.action
              : null;
        return id ? ({ action: id } as MixinActionRef) : null;
      })
      .filter((x: MixinActionRef | null): x is MixinActionRef => !!x);
    if (ap.length > 0) del.actionPanel = ap;
  }

  if (Array.isArray(raw.columns)) {
    const cols: MixinColumnRef[] = raw.columns
      .map((c: any) => {
        if (!c || typeof c !== "object" || typeof c.column !== "string") {
          return null;
        }
        return { column: c.column } as MixinColumnRef;
      })
      .filter((x: MixinColumnRef | null): x is MixinColumnRef => !!x);
    if (cols.length > 0) del.columns = cols;
  }

  return Object.keys(del).length > 0 ? del : undefined;
}

function parseMixinChangeReplace(raw: any): MixinChangeReplace | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rep: MixinChangeReplace = {};

  if (Array.isArray(raw.components)) {
    const comps = raw.components
      .map(parseMixinComponentRef)
      .filter((x: MixinComponentRef | null): x is MixinComponentRef => !!x);
    if (comps.length > 0) rep.components = comps;
  }

  if (Array.isArray(raw.tabs)) {
    const tabs: MixinTabRef[] = raw.tabs
      .map((t: any) => {
        if (!t || typeof t !== "object" || typeof t.tab !== "string") {
          return null;
        }
        return {
          tab: t.tab,
          label: typeof t.label === "string" ? t.label : undefined,
        } as MixinTabRef;
      })
      .filter((x: MixinTabRef | null): x is MixinTabRef => !!x);
    if (tabs.length > 0) rep.tabs = tabs;
  }

  if (Array.isArray(raw.menu)) {
    const menu: MixinActionRef[] = raw.menu
      .map((a: any) => {
        if (!a || typeof a !== "object") return null;
        const id =
          typeof a.action === "string"
            ? a.action
            : typeof a.widget === "string"
              ? a.widget
              : null;
        if (!id) return null;
        return {
          action: id,
          label: typeof a.label === "string" ? a.label : undefined,
        } as MixinActionRef;
      })
      .filter((x: MixinActionRef | null): x is MixinActionRef => !!x);
    if (menu.length > 0) rep.menu = menu;
  }

  if (Array.isArray(raw.actionPanel)) {
    const ap: MixinActionRef[] = raw.actionPanel
      .map((a: any) => {
        if (!a || typeof a !== "object") return null;
        const id =
          typeof a.widget === "string"
            ? a.widget
            : typeof a.action === "string"
              ? a.action
              : null;
        if (!id) return null;
        return {
          action: id,
          label: typeof a.label === "string" ? a.label : undefined,
        } as MixinActionRef;
      })
      .filter((x: MixinActionRef | null): x is MixinActionRef => !!x);
    if (ap.length > 0) rep.actionPanel = ap;
  }

  if (typeof raw.block === "string") rep.block = raw.block;
  if (typeof raw.form === "string") rep.form = raw.form;
  if (typeof raw.list === "string") rep.list = raw.list;

  return Object.keys(rep).length > 0 ? rep : undefined;
}

const MIXIN_VIEW_TYPES = new Set(["panel", "tab", "form", "list", "page"]);

function parseMixins(domainId: string, rawMixins: any[]): MixinRecord[] {
  if (!Array.isArray(rawMixins)) return [];

  const result: MixinRecord[] = [];

  rawMixins.forEach((m: any) => {
    if (!m || !m.id) return;

    const mixinType: "linkage" | "view" =
      m.type === "linkage" ? "linkage" : "view";

    let targetEntityFqid: string | null = null;
    let sourceEntityFqid: string | undefined;
    let linkageFqid: string | undefined;

    if (mixinType === "linkage") {
      if (!m.entity || typeof m.entity !== "object") return;
      const fromFqid = normalizeFqid(m.entity.from, domainId) || undefined;
      const toFqid = normalizeFqid(m.entity.to, domainId);
      if (!toFqid) return;
      targetEntityFqid = toFqid;
      sourceEntityFqid = fromFqid;
      linkageFqid = normalizeFqid(m.linkage, domainId) || undefined;
    } else {
      if (typeof m.entity !== "string") return;
      targetEntityFqid = normalizeFqid(m.entity, domainId);
      if (!targetEntityFqid) return;
    }

    const views = Array.isArray(m.views) ? m.views : [{}];

    views.forEach((v: any, idx: number) => {
      if (!v || typeof v !== "object") return;
      const viewType = String(v.type || "").toLowerCase();
      if (!MIXIN_VIEW_TYPES.has(viewType)) return;

      const to: MixinTarget = {};
      if (v.to && typeof v.to === "object") {
        for (const k of ["panel", "tab", "form", "list", "page"] as const) {
          if (typeof v.to[k] === "string" && v.to[k]) to[k] = v.to[k];
        }
      }

      let change: MixinViewRecord["change"];
      if (v.change && typeof v.change === "object") {
        change = {
          add: parseMixinChangeAdd(v.change.add),
          delete: parseMixinChangeDelete(v.change.delete),
        };
        if (!change.add && !change.delete) change = undefined;
      }

      const replace =
        v.replace && typeof v.replace === "object"
          ? parseMixinChangeReplace(v.replace)
          : undefined;

      const view: MixinViewRecord = {
        id: String(v.id || `${m.id}_${idx}`),
        type: viewType as MixinViewRecord["type"],
        to,
        change,
        replace,
      };
      if (typeof v.fromView === "string" && v.fromView) {
        view.fromView = v.fromView;
      }

      // Legacy flat-поля — производные от view.change.add.
      const addedTabs = (change?.add?.tabs || []).map((t) => t.tab);
      const addedComponents = (change?.add?.components || [])
        .map((c) => c.widget)
        .filter((x): x is string => !!x);
      const addedBlocks = (change?.add?.components || [])
        .map((c) => c.block)
        .filter((x): x is string => !!x);

      result.push({
        id: views.length > 1 ? `${m.id}_${idx}` : String(m.id),
        domainId,
        type: mixinType,
        targetEntityFqid,
        sourceEntityFqid,
        linkageFqid,

        view,

        sourceViewId: String(v.fromView || ""),
        targetPanel: to.panel,
        targetTab: to.tab,
        targetForm: to.form,
        targetList: to.list,
        targetPage: to.page,

        changeAction: replace ? "replace" : "add",
        addedTabs,
        addedComponents,
        addedBlocks,

        useForChild: m.useForChild !== false,
        showMixinInHistory: m.showMixinInHistory === true,
        weight:
          typeof m.weight === "number" && Number.isFinite(m.weight)
            ? m.weight
            : undefined,
        description: String(m.description || v.description || ""),
      });
    });
  });

  return result;
}

// ============ Обратные индексы ============

function buildReverseIndexes(
  entities: EntityRecord[],
  mixins: MixinRecord[],
): {
  entityChildrenByFqid: Record<string, string[]>;
  attributesByNormalizedName: Record<string, string[]>;
  attributesByDataType: Record<string, string[]>;
  mixinsByEntityFqid: Record<string, MixinRecord[]>;
} {
  const entityChildrenByFqid: Record<string, string[]> = {};
  const attributesByNormalizedName: Record<string, string[]> = {};
  const attributesByDataType: Record<string, string[]> = {};
  const mixinsByEntityFqid: Record<string, MixinRecord[]> = {};

  // Дети по наследованию
  entities.forEach((e) => {
    if (!e.inherits) return;
    if (!entityChildrenByFqid[e.inherits])
      entityChildrenByFqid[e.inherits] = [];
    entityChildrenByFqid[e.inherits].push(e.fqid);
  });

  // Атрибуты: имя → места, тип → места
  function collectAttr(attr: AttributeRecord): void {
    const norm = attr.name.toLowerCase();
    const key = attrKey(attr.entityFqid, attr.id);

    if (!attributesByNormalizedName[norm])
      attributesByNormalizedName[norm] = [];
    attributesByNormalizedName[norm].push(key);

    if (!attributesByDataType[attr.dataType])
      attributesByDataType[attr.dataType] = [];
    attributesByDataType[attr.dataType].push(key);
  }

  entities.forEach((e) => {
    e.attributes.forEach((a) => {
      collectAttr(a);
      if (a.nestedAttributes) a.nestedAttributes.forEach(collectAttr);
    });
  });

  // Миксины по целевой сущности
  mixins.forEach((m) => {
    if (!mixinsByEntityFqid[m.targetEntityFqid])
      mixinsByEntityFqid[m.targetEntityFqid] = [];
    mixinsByEntityFqid[m.targetEntityFqid].push(m);
  });

  return {
    entityChildrenByFqid,
    attributesByNormalizedName,
    attributesByDataType,
    mixinsByEntityFqid,
  };
}

// ============ Заполнение обратных ссылок на сущностях ============

function fillEntityBackrefs(
  entities: EntityRecord[],
  entitiesByFqid: Record<string, EntityRecord>,
  mixinsByEntityFqid: Record<string, MixinRecord[]>,
  rawDomainsById: Map<string, RawDomainEntry>,
): void {
  entities.forEach((e) => {
    // referencedByInheritance — заполним после обхода всех
    // mixinSources — какие домены расширяют
    const mixins = mixinsByEntityFqid[e.fqid] || [];
    e.mixinSources = Array.from(new Set(mixins.map((m) => m.domainId)));

    // linkedViaLinkages — заполняем из rawData домена
    const raw = rawDomainsById.get(e.domainId)?.rawData;
    if (raw && Array.isArray(raw.linkages)) {
      raw.linkages.forEach((l: any) => {
        if (!l || !l.id) return;
        const side1 = normalizeFqid(l.side1, e.domainId);
        const side2 = normalizeFqid(l.side2, e.domainId);
        if (side1 === e.fqid || side2 === e.fqid) {
          e.linkedViaLinkages.push(String(l.id));
        }
      });
    }
  });

  // referencedByInheritance: parent → его дети
  entities.forEach((child) => {
    if (!child.inherits) return;
    const parent = entitiesByFqid[child.inherits];
    if (parent) {
      parent.referencedByInheritance.push(child.fqid);
    }
  });
}

// ============ Подсчёт usedInViews ============

function countAttributeUsage(
  entities: EntityRecord[],
  rawDomainsById: Map<string, RawDomainEntry>,
): void {
  // ============ Индекс: attrKey → AttributeRecord ============
  const attrIndex = new Map<string, AttributeRecord>();
  entities.forEach((e) => {
    e.attributes.forEach((a) => {
      attrIndex.set(attrKey(e.fqid, a.id), a);
      if (a.nestedAttributes) {
        a.nestedAttributes.forEach((na) => {
          attrIndex.set(attrKey(e.fqid, na.id), na);
        });
      }
    });
  });

  const entitiesByFqid = new Map<string, EntityRecord>();
  entities.forEach((e) => entitiesByFqid.set(e.fqid, e));

  // ============ Резолвер: ref → AttributeRecord, с учётом наследования ============
  const findAttrWithInheritance = (
    entityFqid: string,
    attrId: string,
  ): AttributeRecord | null => {
    const seen = new Set<string>();
    let cur = entitiesByFqid.get(entityFqid);
    while (cur && !seen.has(cur.fqid)) {
      seen.add(cur.fqid);
      const hit = cur.attributes.find((a) => a.id === attrId);
      if (hit) return hit;
      cur = cur.inherits ? entitiesByFqid.get(cur.inherits) : undefined;
    }
    return null;
  };

  const resolveAttr = (
    ref: string | null | undefined,
    currentDomainId: string,
    currentEntityFqid: string | null,
  ): AttributeRecord | null => {
    if (!ref || typeof ref !== "string") return null;
    const s = ref.trim();
    if (!s) return null;

    // 1) FQID: domain/Entity.attr
    if (s.includes("/")) {
      const slash = s.indexOf("/");
      const domain = s.slice(0, slash).toLowerCase();
      const rest = s.slice(slash + 1);
      const dot = rest.indexOf(".");
      if (dot < 0) return null;
      const entityId = rest.slice(0, dot);
      const attrId = rest.slice(dot + 1);
      return findAttrWithInheritance(
        `${domain}/${entityId}`.toLowerCase(),
        attrId,
      );
    }

    // 2) Entity.attr
    const dot = s.indexOf(".");
    if (dot > 0) {
      const entityPart = s.slice(0, dot);
      const attrId = s.slice(dot + 1);

      // 2a) Если Entity — текущая (или её предок)
      if (currentEntityFqid) {
        const cur = entitiesByFqid.get(currentEntityFqid);
        if (cur && cur.entityId.toLowerCase() === entityPart.toLowerCase()) {
          return findAttrWithInheritance(currentEntityFqid, attrId);
        }
        // 2b) Если Entity — другая сущность того же домена
        const sameDomain = `${currentDomainId.toLowerCase()}/${entityPart.toLowerCase()}`;
        if (entitiesByFqid.has(sameDomain)) {
          return findAttrWithInheritance(sameDomain, attrId);
        }
      }

      // 2c) Fallback — по атрибуту в текущей сущности
      if (currentEntityFqid) {
        return findAttrWithInheritance(currentEntityFqid, attrId);
      }
      return null;
    }

    // 3) attrId — локально в currentEntityFqid (или предках)
    if (currentEntityFqid) {
      return findAttrWithInheritance(currentEntityFqid, s);
    }
    return null;
  };

  // ============ 1. views[].widgets[] / table.columns[] ============
  rawDomainsById.forEach((domain) => {
    const views = domain.rawData?.views;
    if (!Array.isArray(views)) return;

    const walkView = (view: any, entityId: string | null): void => {
      if (!view || typeof view !== "object") return;
      const nextEntityId = view.entity
        ? String(view.entity)
        : view.source?.entity
          ? String(view.source.entity)
          : entityId;

      const currentEntityFqid = nextEntityId
        ? nextEntityId.includes("/")
          ? nextEntityId.toLowerCase()
          : `${domain.id}/${nextEntityId}`.toLowerCase()
        : null;

      if (Array.isArray(view.widgets)) {
        for (const w of view.widgets) {
          if (!w || typeof w !== "object") continue;
          if (typeof w.attribute !== "string") continue;
          const attr = resolveAttr(w.attribute, domain.id, currentEntityFqid);
          if (attr) attr.usedInViews++;
        }
      }

      if (Array.isArray(view.table?.columns)) {
        for (const c of view.table.columns) {
          if (!c || typeof c !== "object") continue;
          if (typeof c.attribute !== "string") continue;
          const attr = resolveAttr(c.attribute, domain.id, currentEntityFqid);
          if (attr) attr.usedInViews++;
        }
      }

      if (Array.isArray(view.views)) {
        for (const nv of view.views) walkView(nv, nextEntityId);
      }
    };

    for (const v of views) walkView(v, null);
  });

  // ============ 2. entities[].searching[] ============
  // (здесь был баг: inner forEach по rawDomainsById внутри outer forEach —
  //  давал N× переинкремент)
  rawDomainsById.forEach((domain) => {
    const ents = domain.rawData?.entities;
    if (!Array.isArray(ents)) return;
    for (const e of ents) {
      if (!e?.id) continue;
      if (!Array.isArray(e.searching)) continue;
      const entityFqid = `${domain.id}/${e.id}`.toLowerCase();
      for (const s of e.searching) {
        if (!s || typeof s !== "object") continue;
        if (typeof s.attribute !== "string") continue;
        const attr = resolveAttr(s.attribute, domain.id, entityFqid);
        if (attr) attr.usedInViews++;
      }
    }
  });

  // ============ 3. dataRules — usedInRules ============
  rawDomainsById.forEach((domain) => {
    const rules = domain.rawData?.dataRules;
    if (!Array.isArray(rules)) return;
    for (const r of rules) {
      if (!r || typeof r !== "object") continue;
      if (r.target === "linkage") continue; // linkage-атрибуты — не entity-атрибуты

      const entityId = r.entity ? String(r.entity) : null;
      const currentEntityFqid = entityId
        ? entityId.includes("/")
          ? entityId.toLowerCase()
          : `${domain.id}/${entityId}`.toLowerCase()
        : null;

      // Для entityAttribute родительский атрибут — r.attribute.
      // Счётчик увеличиваем на родителе; вложенные (nested.attributes)
      // — это колонки внутри Table/Array, они идут под тем же родителем.
      if (r.target === "entityAttribute" && typeof r.attribute === "string") {
        const attr = resolveAttr(r.attribute, domain.id, currentEntityFqid);
        if (attr) attr.usedInRules++;
      }

      // rule.attributes[] — прямые цели эффекта
      if (Array.isArray(r.rule?.attributes)) {
        for (const a of r.rule.attributes) {
          if (!a || typeof a !== "object") continue;
          if (typeof a.attribute !== "string") continue;
          const attr = resolveAttr(a.attribute, domain.id, currentEntityFqid);
          if (attr) attr.usedInRules++;
        }
      }
    }
  });
}

// ============ Stats ============

function computeStats(
  entities: EntityRecord[],
  mixins: MixinRecord[],
  entitiesByFqid: Record<string, EntityRecord>,
  entityChildrenByFqid: Record<string, string[]>,
  mixinsByEntityFqid: Record<string, MixinRecord[]>,
  dataTypes: DataTypeRecord[],
  sequences: SequenceRecord[],
  scenarios: ScenarioRecord[],
  uiRulesCount: number,
  uiPresetCount: number,
  allDomainIds: string[],
  rawDomains: RawDomainEntry[],
): ModelStats {
  const orphanEntities: string[] = [];
  const circularInheritance: string[] = [];
  const unknownReferences: ModelStats["unknownReferences"] = [];
  const duplicateEntityIds: ModelStats["duplicateEntityIds"] = [];
  const mixinConflicts: ModelStats["mixinConflicts"] = [];

  // Orphans
  entities.forEach((e) => {
    const hasChildren = (entityChildrenByFqid[e.fqid] || []).length > 0;
    const hasParent = !!e.inherits;
    const hasRefs = e.referencedByInheritance.length > 0;
    const hasMixins = (mixinsByEntityFqid[e.fqid] || []).length > 0;
    const hasLinkages = e.linkedViaLinkages.length > 0;
    if (!hasChildren && !hasParent && !hasRefs && !hasMixins && !hasLinkages) {
      orphanEntities.push(e.fqid);
    }
  });

  // Circular inheritance
  const seenGlobal = new Set<string>();
  entities.forEach((start) => {
    if (seenGlobal.has(start.fqid)) return;
    const chain: string[] = [];
    const inChain = new Set<string>();
    let cur: string | null = start.fqid;
    while (cur) {
      if (inChain.has(cur)) {
        // нашли цикл — записываем все узлы от cur до конца
        const idx = chain.indexOf(cur);
        chain.slice(idx).forEach((fqid) => {
          if (!circularInheritance.includes(fqid))
            circularInheritance.push(fqid);
        });
        break;
      }
      if (seenGlobal.has(cur)) break;
      inChain.add(cur);
      chain.push(cur);
      const rec = entitiesByFqid[cur];
      if (!rec || !rec.inherits) break;
      cur = rec.inherits;
    }
    chain.forEach((fqid) => seenGlobal.add(fqid));
  });

  // Duplicate entityIds
  const byEntityId = new Map<string, string[]>();
  entities.forEach((e) => {
    const key = e.entityId.toLowerCase();
    if (!byEntityId.has(key)) byEntityId.set(key, []);
    byEntityId.get(key)!.push(e.domainId);
  });
  byEntityId.forEach((domains, entityId) => {
    // Дубликаты внутри одного домена — тоже сигнал.
    const uniqueDomains = new Set(domains);
    if (domains.length > 1) {
      duplicateEntityIds.push({
        entityId,
        domains: Array.from(uniqueDomains),
      });
    }
  });

  // Mixin conflicts
  Object.entries(mixinsByEntityFqid).forEach(([fqid, ms]) => {
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const a = new Set(ms[i].addedTabs);
        const conflicts = ms[j].addedTabs.filter((t) => a.has(t));
        if (conflicts.length > 0) {
          mixinConflicts.push({
            targetFqid: fqid,
            source: ms[i].domainId,
            conflictsWith: [ms[j].domainId],
            addedTabs: conflicts,
          });
        }
      }
    }
  });

  // Unknown references
  entities.forEach((e) => {
    if (e.inherits && !entitiesByFqid[e.inherits]) {
      unknownReferences.push({
        from: e.fqid,
        ref: e.inherits,
        kind: "inherits",
      });
    }
    e.attributes.forEach((a) => {
      if (a.referenceEntity && !entitiesByFqid[a.referenceEntity]) {
        unknownReferences.push({
          from: attrKey(e.fqid, a.id),
          ref: a.referenceEntity,
          kind: "attribute-reference",
        });
      }
      if (a.itemReferenceEntity && !entitiesByFqid[a.itemReferenceEntity]) {
        unknownReferences.push({
          from: attrKey(e.fqid, a.id),
          ref: a.itemReferenceEntity,
          kind: "array-item-reference",
        });
      }
    });
  });

  mixins.forEach((m) => {
    if (!entitiesByFqid[m.targetEntityFqid]) {
      unknownReferences.push({
        from: `${m.domainId}#${m.id}`,
        ref: m.targetEntityFqid,
        kind: "mixin-target",
      });
    }
  });

  const attributeCount = entities.reduce((sum, e) => {
    let cnt = e.attributes.length;
    e.attributes.forEach((a) => {
      if (a.nestedAttributes) cnt += a.nestedAttributes.length;
    });
    return sum + cnt;
  }, 0);

  // ============ attributesWithoutViews ============
  // «Мёртвый код»: не упомянут ни в views[].widgets[], ни в dataRules[].rule.attributes[].
  // Атрибут, используемый только в правилах, не является мёртвым — у него есть
  // семантика (required/readonly/default и т.д.), даже если он не отображается.
  const attributesWithoutViews: ModelStats["attributesWithoutViews"] = [];
  entities.forEach((e) => {
    const visit = (a: AttributeRecord) => {
      if (a.usedInViews === 0 && a.usedInRules === 0) {
        attributesWithoutViews.push({
          key: `${e.fqid}#${a.id}`,
          entityFqid: e.fqid,
          attributeId: a.id,
          name: a.name,
          dataType: a.dataType,
        });
      }
      if (a.nestedAttributes) a.nestedAttributes.forEach(visit);
    };
    e.attributes.forEach(visit);
  });
  // Сортируем — сначала самые «популярные» имена (легче увидеть паттерны)
  attributesWithoutViews.sort((a, b) => a.name.localeCompare(b.name));

  // ============ emptyDomains ============
  const domainsWithEntities = new Set(entities.map((e) => e.domainId));
  if (typeof rawDomains !== "undefined") {
    // rawDomains нам недоступен в computeStats напрямую.
    // Передадим через дополнительный параметр или пересоберём из entities — просто все домены минус те, где есть сущности.
  }

  // ============ entitiesWithoutAttributes ============
  const entitiesWithoutAttributes: string[] = [];
  entities.forEach((e) => {
    if (e.attributes.length === 0) {
      entitiesWithoutAttributes.push(e.fqid);
    }
  });

  const emptyDomains = allDomainIds.filter(
    (id) => !domainsWithEntities.has(id),
  );

  return {
    entityCount: entities.length,
    attributeCount,
    mixinCount: mixins.length,
    dataTypeCount: dataTypes.length,
    sequenceCount: sequences.length,
    scenarioCount: scenarios.length,
    uiRuleCount: uiRulesCount,
    uiPresetCount: uiPresetCount,
    orphanEntities,
    circularInheritance,
    duplicateEntityIds,
    mixinConflicts,
    emptyDomains,
    unknownReferences,
    entitiesWithoutAttributes,
    attributesWithoutViews,
  };
}

function parseEntityLinkages(
  domainId: string,
  raw: any,
  customDataTypeIds: Set<string>,
): EntityLinkage[] {
  if (!raw || !Array.isArray(raw.linkages)) return [];
  const result: EntityLinkage[] = [];

  for (const l of raw.linkages) {
    if (!l || !l.id) continue;
    if (!l.side1 || !l.side2) continue;

    const side1Fqid = normalizeFqid(l.side1, domainId);
    const side2Fqid = normalizeFqid(l.side2, domainId);
    if (!side1Fqid || !side2Fqid) continue;

    const linkageFqid = `${domainId}/${String(l.id)}`.toLowerCase();

    const record: EntityLinkage = {
      id: String(l.id),
      domainId,
      side1Fqid,
      side2Fqid,
      name: String(l.name || l.id),
      type: String(l.type || "n_n"),
      symmetric: side1Fqid === side2Fqid,
      undirected: l.undirected === true,
    };

    if (l.useForSearch === true) record.useForSearch = true;
    if (l.excludeOnGraph === true) record.excludeOnGraph = true;
    else if (l.excludeOnGraph === "off") record.excludeOnGraph = "off";
    else if (l.excludeOnGraph === false) record.excludeOnGraph = false;

    if (l.nameFrom && typeof l.nameFrom === "object") {
      record.nameFrom = {
        side1:
          typeof l.nameFrom.side1 === "string" ? l.nameFrom.side1 : undefined,
        side2:
          typeof l.nameFrom.side2 === "string" ? l.nameFrom.side2 : undefined,
      };
    }

    if (l.view && typeof l.view === "object" && l.view.iconColor) {
      record.view = { iconColor: String(l.view.iconColor) };
    }

    if (Array.isArray(l.searching)) {
      record.searching = l.searching
        .map((s: any) =>
          s && s.attribute ? { attribute: String(s.attribute) } : null,
        )
        .filter((x): x is { attribute: string } => x !== null);
    }

    if (Array.isArray(l.sorting)) {
      record.sorting = l.sorting
        .map((s: any) => {
          if (!s || !s.id) return null;
          const by: EntitySortingRecord["by"] = [];
          if (Array.isArray(s.by)) {
            for (const b of s.by) {
              if (!b || !b.attribute) continue;
              by.push({
                attribute: String(b.attribute),
                direction: b.direction === "desc" ? "desc" : "asc",
              });
            }
          }
          return { id: String(s.id), by };
        })
        .filter((x): x is EntitySortingRecord => x !== null);
    }

    if (Array.isArray(l.attributes)) {
      record.attributes = l.attributes
        .map((a: any) =>
          parseAttribute(a, linkageFqid, domainId, customDataTypeIds),
        )
        .filter(
          (x: AttributeRecord | null): x is AttributeRecord => x !== null,
        );
    }

    if (Array.isArray(l.side1Descendants)) {
      record.side1Descendants = l.side1Descendants.map(String);
    }
    if (Array.isArray(l.side2Descendants)) {
      record.side2Descendants = l.side2Descendants.map(String);
    }

    result.push(record);
  }

  return result;
}

// ============ DataRules ============

function parseDataRuleTarget(raw: any): DataRuleTarget {
  const t = String(raw?.target || "").trim();
  if (t === "entityAttribute") return "entityAttribute";
  if (t === "linkage") return "linkage";
  return "entity";
}

function parseDataRuleEffect(raw: any): DataRuleEffect {
  const e = String(raw?.rule?.effect || "").trim();
  if (
    e === "hidden" ||
    e === "readonly" ||
    e === "required" ||
    e === "default" ||
    e === "allowed"
  ) {
    return e;
  }
  return "hidden";
}

function parseDataRuleAttributeAction(
  raw: any,
): DataRuleAttributeAction | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.attribute !== "string" || !raw.attribute) return null;
  const out: DataRuleAttributeAction = { attribute: raw.attribute };
  if (typeof raw.constraint === "string") out.constraint = raw.constraint;
  if (typeof raw.expression === "string") out.expression = raw.expression;
  if (raw.value !== undefined) out.value = raw.value;
  if (typeof raw.message === "string") out.message = raw.message;
  if (typeof raw.help === "string") out.help = raw.help;
  return out;
}

function parseDataRuleLinkageAction(
  raw: any,
  domainId: string,
): DataRuleLinkageAction | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.linkage !== "string" || !raw.linkage) return null;
  const linkageFqid = normalizeFqid(raw.linkage, domainId);
  if (!linkageFqid) return null;
  const out: DataRuleLinkageAction = { linkage: linkageFqid };
  if (raw.side === 1 || raw.side === 2) out.side = raw.side;
  if (typeof raw.constraint === "string") out.constraint = raw.constraint;
  if (typeof raw.expression === "string") out.expression = raw.expression;
  if (typeof raw.min_count === "number") out.min_count = raw.min_count;
  if (typeof raw.max_count === "number") out.max_count = raw.max_count;
  if (typeof raw.message === "string") out.message = raw.message;
  if (typeof raw.help === "string") out.help = raw.help;
  return out;
}

function parseDataRuleNestedAttribute(
  raw: any,
): DataRuleNestedAttribute | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.attribute !== "string" || !raw.attribute) return null;
  const out: DataRuleNestedAttribute = { attribute: raw.attribute };
  if (typeof raw.constraint === "string") out.constraint = raw.constraint;
  if (typeof raw.expression === "string") out.expression = raw.expression;
  if (raw.value !== undefined) out.value = raw.value;
  if (typeof raw.message === "string") out.message = raw.message;
  if (typeof raw.help === "string") out.help = raw.help;
  return out;
}

function parseDataRuleNestedItem(raw: any): DataRuleNestedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw.item;
  if (item !== "*" && typeof item !== "number") return null;
  const out: DataRuleNestedItem = { item };
  if (typeof raw.constraint === "string") out.constraint = raw.constraint;
  if (typeof raw.expression === "string") out.expression = raw.expression;
  if (raw.value !== undefined) out.value = raw.value;
  if (typeof raw.message === "string") out.message = raw.message;
  if (typeof raw.help === "string") out.help = raw.help;
  return out;
}

function parseDataRuleNested(raw: any): DataRuleNested | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  if (raw.type === "table" && Array.isArray(raw.attributes)) {
    const attributes = raw.attributes
      .map(parseDataRuleNestedAttribute)
      .filter((x): x is DataRuleNestedAttribute => x !== null);
    if (attributes.length === 0) return undefined;
    return { type: "table", attributes };
  }
  if (raw.type === "array" && Array.isArray(raw.items)) {
    const items = raw.items
      .map(parseDataRuleNestedItem)
      .filter((x): x is DataRuleNestedItem => x !== null);
    if (items.length === 0) return undefined;
    return { type: "array", items };
  }
  return undefined;
}

function parseDataRule(raw: any, domainId: string): DataRuleRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;

  const target = parseDataRuleTarget(raw);
  const effect = parseDataRuleEffect(raw);

  const rec: DataRuleRecord = {
    id: raw.id,
    domainId,
    name: String(raw.name || raw.id),
    description: String(raw.description || ""),
    target,
    condition:
      typeof raw.condition === "boolean"
        ? raw.condition
        : String(raw.condition || ""),
    effect,
  };

  if (target === "entity" || target === "entityAttribute") {
    const entityFqid = normalizeFqid(raw.entity, domainId);
    if (entityFqid) rec.entity = entityFqid;
  }
  if (target === "entityAttribute" && typeof raw.attribute === "string") {
    rec.attribute = raw.attribute;
  }
  if (target === "linkage") {
    const linkageFqid = normalizeFqid(raw.linkage, domainId);
    if (linkageFqid) rec.linkage = linkageFqid;
  }

  const rule = raw.rule || {};
  if (Array.isArray(rule.attributes)) {
    const attributes = rule.attributes
      .map(parseDataRuleAttributeAction)
      .filter((x): x is DataRuleAttributeAction => x !== null);
    if (attributes.length > 0) rec.attributes = attributes;
  }
  if (Array.isArray(rule.linkages)) {
    const linkages = rule.linkages
      .map((l: any) => parseDataRuleLinkageAction(l, domainId))
      .filter((x): x is DataRuleLinkageAction => x !== null);
    if (linkages.length > 0) rec.linkages = linkages;
  }
  const nested = parseDataRuleNested(rule.nested);
  if (nested) rec.nested = nested;

  if (typeof raw.message === "string") rec.message = raw.message;
  if (typeof raw.help === "string") rec.help = raw.help;

  return rec;
}

// ============ Trees ============

function parseTreeChild(raw: any, domainId: string): TreeHierarchyChild | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.linkage !== "string") return null;
  if (typeof raw.entity !== "string") return null;
  const linkageFqid = normalizeFqid(raw.linkage, domainId);
  const entityFqid = normalizeFqid(raw.entity, domainId);
  if (!linkageFqid || !entityFqid) return null;

  const out: TreeHierarchyChild = { linkage: linkageFqid, entity: entityFqid };
  if (raw.side === 1 || raw.side === 2) out.side = raw.side;
  if (typeof raw.maxInstances === "number") out.maxInstances = raw.maxInstances;
  if (typeof raw.maxChildren === "number") out.maxChildren = raw.maxChildren;
  if (Array.isArray(raw.children)) {
    const kids = raw.children
      .map((k: any) => parseTreeChild(k, domainId))
      .filter(
        (x: TreeHierarchyChild | null): x is TreeHierarchyChild => x !== null,
      );
    if (kids.length > 0) out.children = kids;
  }
  return out;
}

function parseTreeSorting(
  raw: any,
  domainId: string,
): TreeSortingRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const by: TreeSortingRecord["by"] = [];
  if (Array.isArray(raw.by)) {
    for (const b of raw.by) {
      if (!b || typeof b !== "object") continue;
      const entityFqid = normalizeFqid(b.entity, domainId);
      if (!entityFqid) continue;
      const inner: Array<{ attribute: string; direction: "asc" | "desc" }> = [];
      if (Array.isArray(b.by)) {
        for (const ib of b.by) {
          if (!ib || typeof ib.attribute !== "string") continue;
          inner.push({
            attribute: ib.attribute,
            direction: ib.direction === "asc" ? "asc" : "desc",
          });
        }
      }
      by.push({ entity: entityFqid, by: inner });
    }
  }
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : undefined,
    by,
  };
}

function parseTree(raw: any, domainId: string): TreeRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!raw.hierarchy || typeof raw.hierarchy !== "object") return null;
  const entityFqid = normalizeFqid(raw.hierarchy.entity, domainId);
  if (!entityFqid) return null;

  const rawType = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
  const type: TreeRecord["type"] =
    rawType === "orderable" || rawType === "multiparent"
      ? (rawType as TreeRecord["type"])
      : "ordinary";

  const hierarchy: TreeRecord["hierarchy"] = { entity: entityFqid };
  if (typeof raw.hierarchy.maxInstances === "number") {
    hierarchy.maxInstances = raw.hierarchy.maxInstances;
  }
  if (typeof raw.hierarchy.maxChildren === "number") {
    hierarchy.maxChildren = raw.hierarchy.maxChildren;
  }
  if (Array.isArray(raw.hierarchy.children)) {
    const children = raw.hierarchy.children
      .map((c: any) => parseTreeChild(c, domainId))
      .filter(
        (x: TreeHierarchyChild | null): x is TreeHierarchyChild => x !== null,
      );
    if (children.length > 0) hierarchy.children = children;
  }

  const rec: TreeRecord = {
    id: raw.id,
    domainId,
    name: typeof raw.name === "string" ? raw.name : undefined,
    type,
    hierarchy,
  };
  if (typeof raw.maxDepth === "number") rec.maxDepth = raw.maxDepth;

  if (Array.isArray(raw.sorting)) {
    const sorting = raw.sorting
      .map((s: any) => parseTreeSorting(s, domainId))
      .filter(
        (x: TreeSortingRecord | null): x is TreeSortingRecord => x !== null,
      );
    if (sorting.length > 0) rec.sorting = sorting;
  }

  return rec;
}

// ============ TransitiveLinkages ============

function parseTransitiveJoin(
  raw: any,
  domainId: string,
): TransitiveLinkageJoin | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.linkage !== "string") return null;
  const linkageFqid = normalizeFqid(raw.linkage, domainId);
  if (!linkageFqid) return null;

  const out: TransitiveLinkageJoin = { id: raw.id, linkage: linkageFqid };
  if (raw.side === 1 || raw.side === 2) out.side = raw.side;
  if (raw.search && typeof raw.search === "object") {
    const s: NonNullable<TransitiveLinkageJoin["search"]> = {};
    if (typeof raw.search.enabled === "boolean") s.enabled = raw.search.enabled;
    if (
      raw.search.mode === "entity" ||
      raw.search.mode === "linkage" ||
      raw.search.mode === "both"
    ) {
      s.mode = raw.search.mode;
    }
    out.search = s;
  }
  if (Array.isArray(raw.joins)) {
    const kids = raw.joins
      .map((j: any) => parseTransitiveJoin(j, domainId))
      .filter(
        (x: TransitiveLinkageJoin | null): x is TransitiveLinkageJoin =>
          x !== null,
      );
    if (kids.length > 0) out.joins = kids;
  }
  return out;
}

function parseTransitiveLinkage(
  raw: any,
  domainId: string,
): TransitiveLinkageRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const entityFqid = normalizeFqid(raw.entity, domainId);
  if (!entityFqid) return null;
  if (!Array.isArray(raw.joins)) return null;

  const joins = raw.joins
    .map((j: any) => parseTransitiveJoin(j, domainId))
    .filter(
      (x: TransitiveLinkageJoin | null): x is TransitiveLinkageJoin =>
        x !== null,
    );
  if (joins.length === 0) return null;

  return {
    id: raw.id,
    domainId,
    entity: entityFqid,
    description: String(raw.description || ""),
    joins,
  };
}

// ============ Menus ============

function parseMenuItem(raw: any, domainId: string): MenuItemRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const viewFqid = normalizeFqid(raw.view, domainId);
  if (!viewFqid) return null;
  const out: MenuItemRecord = {
    id: raw.id,
    route: String(raw.route || ""),
    label: String(raw.label || raw.id),
    type: "menu",
    view: viewFqid,
  };
  if (typeof raw.priority === "number") out.priority = raw.priority;
  return out;
}

function parseMenu(raw: any, domainId: string): MenuRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;

  const rawType = typeof raw.type === "string" ? raw.type : undefined;
  const rawPlacement =
    typeof raw.placement === "string" ? raw.placement : undefined;

  const type: MenuRecord["type"] =
    rawType === "root_menu" ? "root_menu" : "root_group";
  const placement: MenuRecord["placement"] =
    rawPlacement === "settings" ? "settings" : "top";
  const rawLabelMissing = !raw.label;
  const rawTypeMissing = rawType === undefined;
  const rawPlacementMissing = rawPlacement === undefined;

  const out: MenuRecord = {
    id: raw.id,
    domainId,
    type,
    route: String(raw.route || ""),
    label: String(raw.label || raw.id),
    placement,
  };

  // Сохраняем оригинальные значения только при невалидных / отсутствующих,
  // чтобы линтер мог ругаться, а нормализованные значения оставались
  // пригодными для UI.
  if (rawType !== undefined && rawType !== type) {
    out.__rawType = rawType;
  }
  if (rawPlacement !== undefined && rawPlacement !== placement) {
    out.__rawPlacement = rawPlacement;
  }
  if (rawLabelMissing) out.__rawLabelMissing = true;
  if (rawTypeMissing) out.__rawTypeMissing = true;
  if (rawPlacementMissing) out.__rawPlacementMissing = true;
  if (typeof raw.icon === "string") {
    const iconFqid = normalizeFqid(raw.icon, domainId);
    if (iconFqid) out.icon = iconFqid;
  }
  if (typeof raw.priority === "number") out.priority = raw.priority;
  if (typeof raw.description === "string") out.description = raw.description;

  if (type === "root_menu" && typeof raw.view === "string") {
    const viewFqid = normalizeFqid(raw.view, domainId);
    if (viewFqid) out.view = viewFqid;
  }
  if (type === "root_group" && Array.isArray(raw.items)) {
    const items = raw.items
      .map((it: any) => parseMenuItem(it, domainId))
      .filter((x: MenuItemRecord | null): x is MenuItemRecord => x !== null);
    if (items.length > 0) out.items = items;
    if (typeof raw.default === "string") out.defaultItem = raw.default;
  }
  return out;
}

// ============ Medias ============

function parseMedia(raw: any, domainId: string): MediaRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;

  const rawType = typeof raw.type === "string" ? raw.type : undefined;
  const type: MediaRecord["type"] = rawType === "data" ? "data" : "icon_name";

  const out: MediaRecord = {
    id: raw.id,
    domainId,
    type,
    description: String(raw.description || ""),
  };
  if (type === "icon_name" && typeof raw.iconName === "string") {
    out.iconName = raw.iconName;
  }
  if (type === "data" && typeof raw.data === "string") {
    out.data = raw.data;
  }
  if (rawType === undefined) {
    out.__rawTypeMissing = true;
  } else if (rawType !== "icon_name" && rawType !== "data") {
    out.__rawType = rawType;
  }
  return out;
}

// ============ Permissions ============

function parsePermission(raw: any, domainId: string): PermissionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const out: PermissionRecord = { id: raw.id, domainId };
  if (typeof raw.name === "string") out.name = raw.name;
  if (typeof raw.description === "string") out.description = raw.description;
  return out;
}

// ============ AccessRules ============

function parseAccessRuleException(raw: any): AccessRuleException | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.attribute !== "string" || !raw.attribute) return null;
  const out: AccessRuleException = { attribute: raw.attribute };
  if (typeof raw.condition === "string" || typeof raw.condition === "boolean") {
    out.condition = raw.condition;
  }
  return out;
}

function parseAccessRuleItem(raw: any): AccessRuleItem | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind;
  if (kind !== "permission" && kind !== "pass" && kind !== "condition") {
    return null;
  }
  const out: AccessRuleItem = { kind: kind as AccessRuleItemKind };
  if (kind === "permission" && typeof raw.permission === "string") {
    out.permission = raw.permission;
  }
  if (
    kind === "condition" &&
    (typeof raw.condition === "string" || typeof raw.condition === "boolean")
  ) {
    out.condition = raw.condition;
  }
  if (Array.isArray(raw.except)) {
    const except = raw.except
      .map(parseAccessRuleException)
      .filter(
        (x: AccessRuleException | null): x is AccessRuleException => x !== null,
      );
    if (except.length > 0) out.except = except;
  }
  return out;
}

function parseAccessRuleItems(raw: any): AccessRuleItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map(parseAccessRuleItem)
    .filter((x: AccessRuleItem | null): x is AccessRuleItem => x !== null);
  return items.length > 0 ? items : undefined;
}

function parseAccessRule(raw: any, domainId: string): AccessRuleRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const target = raw.target;
  if (
    target !== "entity" &&
    target !== "action" &&
    target !== "linkage" &&
    target !== "any_entity" &&
    target !== "any_action" &&
    target !== "any_linkage"
  ) {
    return null;
  }

  const out: AccessRuleRecord = {
    domainId,
    target: target as AccessRuleTarget,
  };

  if (target === "entity" && typeof raw.entity === "string") {
    const fqid = normalizeFqid(raw.entity, domainId);
    if (fqid) out.entity = fqid;
  }
  if (target === "linkage" && typeof raw.linkage === "string") {
    const fqid = normalizeFqid(raw.linkage, domainId);
    if (fqid) out.linkage = fqid;
  }
  if (target === "action") {
    // Zod: d = {target:"action"}.merge(Action), поля как у Action (id, name, …).
    if (typeof raw.id === "string" && raw.id) out.actionId = raw.id;
  }

  // scope
  if (
    target === "entity" ||
    target === "linkage" ||
    target === "any_entity" ||
    target === "any_linkage"
  ) {
    out.create = parseAccessRuleItems(raw.create);
    out.delete = parseAccessRuleItems(raw.delete);
    out.edit = parseAccessRuleItems(raw.edit);
    out.view = parseAccessRuleItems(raw.view);
  } else {
    // action / any_action
    out.launch = parseAccessRuleItems(raw.launch);
  }

  return out;
}

function parseAction(raw: any, domainId: string): ActionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;

  const type = String(raw.type || "");
  const out: ActionRecord = {
    id: raw.id,
    domainId,
    name: String(raw.name || raw.id),
    description: String(raw.description || ""),
    type,
  };

  // entity
  const entityFqid = normalizeFqid(raw.entity, domainId);
  if (entityFqid) out.entity = entityFqid;

  if (type === "open_page") {
    if (typeof raw.view === "string" && raw.view) {
      const fqid = normalizeFqid(raw.view, domainId);
      if (fqid) out.pageView = fqid;
    } else if (typeof raw.pageView === "string" && raw.pageView) {
      const fqid = normalizeFqid(raw.pageView, domainId);
      if (fqid) out.pageView = fqid;
    }
  }
  // modal / panel / view — все через normalizeFqid
  if (typeof raw.modal === "string") {
    const fqid = normalizeFqid(raw.modal, domainId);
    if (fqid) out.modal = fqid;
  }
  if (typeof raw.panel === "string") {
    const fqid = normalizeFqid(raw.panel, domainId);
    if (fqid) out.panel = fqid;
  }
  if (typeof raw.view === "string") {
    const fqid = normalizeFqid(raw.view, domainId);
    if (fqid) out.view = fqid;
  }

  if (
    typeof raw.pageView === "string" &&
    raw.pageView &&
    type === "open_page"
  ) {
    const fqid = normalizeFqid(raw.pageView, domainId);
    if (fqid) out.pageView = fqid;
  }

  if (typeof raw.operation === "string") out.operation = raw.operation;
  if (raw.contextPin === true) out.contextPin = true;

  if (typeof raw.join === "string") out.join = raw.join;

  if (typeof raw.linkage === "string") {
    const fqid = normalizeFqid(raw.linkage, domainId);
    if (fqid) out.linkage = fqid;
  }
  if (raw.side === 1 || raw.side === 2) out.side = raw.side;
  if (raw.page === "blank" || raw.page === "current") out.page = raw.page;

  if (raw.automation && typeof raw.automation === "object") {
    if (typeof raw.automation.id === "string") {
      out.automationId = raw.automation.id;
    }
  }
  if (typeof raw.scenario === "string") out.scenario = raw.scenario;
  if (typeof raw.workerTag === "string") out.workerTag = raw.workerTag;

  // values[]
  if (Array.isArray(raw.values)) {
    const values = raw.values
      .map((v: any) => {
        if (!v || typeof v !== "object") return null;
        if (typeof v.attribute !== "string" || !v.attribute) return null;
        return { attribute: v.attribute, value: v.value };
      })
      .filter(
        (x: ActionValueRecord | null): x is ActionValueRecord => x !== null,
      );
    if (values.length > 0) out.values = values;
  }

  // bulkSettings[]
  if (Array.isArray(raw.bulkSettings)) {
    const settings = raw.bulkSettings
      .map((s: any) => {
        if (!s || typeof s !== "object") return null;
        const setting: ActionBulkSettings = {};

        const sfqid = normalizeFqid(s.entity, domainId);
        if (sfqid) setting.entity = sfqid;

        if (s.attributes && typeof s.attributes === "object") {
          setting.attributes = {
            type: s.attributes.type === "specific" ? "specific" : "all",
            use: Array.isArray(s.attributes.use)
              ? s.attributes.use
                  .map((u: any) =>
                    u && typeof u.attribute === "string"
                      ? ({ attribute: u.attribute } as ActionBulkAttributeUse)
                      : null,
                  )
                  .filter(
                    (
                      x: ActionBulkAttributeUse | null,
                    ): x is ActionBulkAttributeUse => x !== null,
                  )
              : undefined,
          };
        }

        if (s.linkages && typeof s.linkages === "object") {
          setting.linkages = {
            type: "specific",
            use: Array.isArray(s.linkages.use)
              ? s.linkages.use
                  .map((u: any) =>
                    u && typeof u.widget === "string"
                      ? ({ widget: u.widget } as ActionBulkLinkageUse)
                      : null,
                  )
                  .filter(
                    (
                      x: ActionBulkLinkageUse | null,
                    ): x is ActionBulkLinkageUse => x !== null,
                  )
              : undefined,
          };
        }

        return Object.keys(setting).length > 0 ? setting : null;
      })
      .filter(
        (x: ActionBulkSettings | null): x is ActionBulkSettings => x !== null,
      );
    if (settings.length > 0) out.bulkSettings = settings;
  }

  // control — только для bulk + operation=edit_attribute (Zod: Bool).
  // Парсим безусловно, если поле присутствует — линтер сам решит,
  // когда это ошибка (для не-Bool атрибутов control просто игнорируется).
  if (raw.control && typeof raw.control === "object") {
    const ctrl: ActionControlRecord = {};
    if (typeof raw.control.type === "string") ctrl.type = raw.control.type;
    if (typeof raw.control.trueText === "string") {
      ctrl.trueText = raw.control.trueText;
    }
    if (typeof raw.control.falseText === "string") {
      ctrl.falseText = raw.control.falseText;
    }
    if (Object.keys(ctrl).length > 0) out.control = ctrl;
  }

  // openBoardsFromGraph — для open_graph_view
  if (
    raw.openBoardsFromGraph &&
    typeof raw.openBoardsFromGraph === "object" &&
    raw.openBoardsFromGraph.openBoards === true
  ) {
    out.openBoards = true;
    if (typeof raw.openBoardsFromGraph.name === "string") {
      out.openBoardsName = raw.openBoardsFromGraph.name;
    }
  }

  // ============ workflow: transition.to ============
  if (
    type === "workflow" &&
    raw.transition &&
    typeof raw.transition === "object"
  ) {
    if (typeof raw.transition.to === "string" && raw.transition.to) {
      out.transition = { to: raw.transition.to };
    }
  }

  // ============ open_external_widget_modal: params ============
  if (
    type === "open_external_widget_modal" &&
    raw.params &&
    typeof raw.params === "object"
  ) {
    if (typeof raw.params.widget === "string" && raw.params.widget) {
      out.widgetParams = { widget: raw.params.widget, ...raw.params };
    }
  }

  if (typeof raw.attribute === "string") out.attribute = raw.attribute;

  if (typeof raw.widgetId === "string") {
    const fqid = normalizeFqid(raw.widgetId, domainId);
    if (fqid) out.widgetId = fqid;
  }

  // ============ scenario hooks ============
  // Парсим всегда, независимо от type. Если hooks окажутся не на scenario —
  // это поймает linter (action/hooks-not-scenario). Иначе теряем данные
  // для UI и для линтера.
  if (raw.hooks && typeof raw.hooks === "object") {
    const rawHooks = raw.hooks as Record<string, unknown>;
    const parsedHooks: ActionHooksRecord = {};

    for (const hookKey of ["onStart", "onComplete", "onError"] as const) {
      const rawHook = rawHooks[hookKey];
      if (!rawHook || typeof rawHook !== "object") continue;

      const rh = rawHook as Record<string, any>;
      const hook: ActionHookRecord = {};

      if (rh.artifacts && typeof rh.artifacts === "object") {
        const artifacts: NonNullable<ActionHookRecord["artifacts"]> = {};
        if (typeof rh.artifacts.autodownload === "boolean") {
          artifacts.autodownload = rh.artifacts.autodownload;
        }
        hook.artifacts = artifacts;
      }

      if (rh.notify && typeof rh.notify === "object") {
        const notify: NonNullable<ActionHookRecord["notify"]> = {};
        if (typeof rh.notify.includeLinkToScenario === "boolean") {
          notify.includeLinkToScenario = rh.notify.includeLinkToScenario;
        }
        if (typeof rh.notify.msg === "string") {
          notify.msg = rh.notify.msg;
        }
        hook.notify = notify;
      }

      parsedHooks[hookKey] = hook;
    }

    if (Object.keys(parsedHooks).length > 0) {
      out.hooks = parsedHooks;
    }
  }

  return out;
}
// ============ Localizations ============

function parseLocalizationKey(raw: any): LocalizationKeyRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.key !== "string" || !raw.key) return null;
  if (typeof raw.to !== "string") return null;
  const out: LocalizationKeyRecord = { key: raw.key, to: raw.to };
  if (raw.ordinal && typeof raw.ordinal === "object") {
    const ord: NonNullable<LocalizationKeyRecord["ordinal"]> = {};
    for (const k of ["zero", "one", "two", "few", "many", "other"] as const) {
      if (typeof raw.ordinal[k] === "string") ord[k] = raw.ordinal[k];
    }
    if (Object.keys(ord).length > 0) out.ordinal = ord;
  }
  return out;
}

function parseLocalization(
  raw: any,
  domainId: string,
): LocalizationRecord | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.language !== "string" || !raw.language) return null;
  if (!Array.isArray(raw.keys)) return null;
  const keys = raw.keys
    .map(parseLocalizationKey)
    .filter(
      (x: LocalizationKeyRecord | null): x is LocalizationKeyRecord =>
        x !== null,
    );
  if (keys.length === 0) return null;
  return { domainId, language: raw.language, keys };
}
// ============ Главная функция ============

// ============ UI Rules / Presets ============

function parseUiPreset(raw: any, domainId: string): UiPresetRecord | null {
  if (!raw || !raw.id) return null;
  const props: Record<string, string | number | boolean> = {};
  if (raw.props && typeof raw.props === "object") {
    for (const [k, v] of Object.entries(raw.props)) {
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        props[k] = v;
      }
    }
  }
  return {
    id: String(raw.id),
    domainId,
    name: String(raw.name || raw.id),
    description: String(raw.description || ""),
    props,
  };
}

function parseUiRule(raw: any, domainId: string): UiRuleRecord | null {
  if (!raw || !raw.id) return null;

  // ============ Нормализация target ============
  // zod имеет `entity_widget` (legacy/plan), docs и ModelIndex — `entity_attribute`.
  // Приводим к единому имени, чтобы остальная система работала с одним значением.
  const rawTarget = String(raw.target || "").trim();
  const target = rawTarget === "entity_widget" ? "entity_attribute" : rawTarget;

  // ============ Нормализация operations ============
  // Поле описано в docs и в zod (`operations?: ("view"|"edit"|"create")[]`),
  // но сейчас нигде не парсится.
  const rawOperations = Array.isArray(raw.operations) ? raw.operations : [];
  const operations: UiRuleOperation[] = rawOperations
    .map((v: any) => String(v || "").trim())
    .filter(
      (v: string): v is UiRuleOperation =>
        v === "view" || v === "edit" || v === "create",
    );

  // ============ context.views ============
  // zod описывает как [{ view: string }], но в старых файлах может быть [string].
  // Раньше делали `map(String)` → получали "[object Object]". Теперь корректно.
  const rawContextViews = Array.isArray(raw.context?.views)
    ? raw.context.views
    : [];
  const contextViews: string[] = rawContextViews
    .map((v: any) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && typeof v.view === "string")
        return v.view;
      return null;
    })
    .filter((v: string | null): v is string => !!v);

  // ============ widgets[] ============
  // Zod (`WidgetId`) разрешает и строку, и `{ id, linkageId?, referenceId? }`.
  // Inline-объекты берём по `.id`; если id нет — пропускаем.
  const widgets: UiRuleWidgetRef[] = [];
  if (Array.isArray(raw.rule?.widgets)) {
    for (const w of raw.rule.widgets) {
      if (!w || typeof w !== "object") continue;

      let widgetId: string | null = null;
      const rawWidget = (w as any).widget;
      if (typeof rawWidget === "string") widgetId = rawWidget;
      else if (
        rawWidget &&
        typeof rawWidget === "object" &&
        typeof rawWidget.id === "string"
      ) {
        widgetId = rawWidget.id;
      }
      if (!widgetId) continue;

      const ref: UiRuleWidgetRef = { widget: widgetId };
      if (w.nested && typeof w.nested === "object") {
        const nested: UiRuleNested = {
          type: w.nested.type === "array" ? "array" : "table",
        };
        if (Array.isArray(w.nested.attributes)) {
          nested.attributes = w.nested.attributes
            .map((a: any) => String(a?.attribute ?? a))
            .filter(Boolean);
        }
        if (Array.isArray(w.nested.items)) {
          nested.items = w.nested.items
            .map((it: any) => String(it?.item ?? it))
            .filter(Boolean);
        }
        ref.nested = nested;
      }
      if (Array.isArray(w.presets)) {
        ref.presets = w.presets.map(String);
      }
      widgets.push(ref);
    }
  }

  // ============ groups[] ============
  const groups: UiRuleGroupRef[] = [];
  if (Array.isArray(raw.rule?.groups)) {
    for (const g of raw.rule.groups) {
      if (!g || typeof g !== "object") continue;
      let groupId: string | null = null;
      const rawGroup = (g as any).group;
      if (typeof rawGroup === "string") groupId = rawGroup;
      else if (
        rawGroup &&
        typeof rawGroup === "object" &&
        typeof rawGroup.id === "string"
      ) {
        groupId = rawGroup.id;
      }
      if (!groupId) continue;

      const ref: UiRuleGroupRef = { group: groupId };
      if (Array.isArray(g.presets)) ref.presets = g.presets.map(String);
      groups.push(ref);
    }
  }

  // ============ columns[] ============
  const columns: UiRuleColumnRef[] = [];
  if (Array.isArray(raw.rule?.columns)) {
    for (const c of raw.rule.columns) {
      if (!c || typeof c !== "object") continue;
      let columnId: string | null = null;
      const rawColumn = (c as any).column;
      if (typeof rawColumn === "string") columnId = rawColumn;
      else if (
        rawColumn &&
        typeof rawColumn === "object" &&
        typeof rawColumn.id === "string"
      ) {
        columnId = rawColumn.id;
      }
      if (!columnId) continue;

      const ref: UiRuleColumnRef = { column: columnId };
      if (Array.isArray(c.presets)) ref.presets = c.presets.map(String);
      columns.push(ref);
    }
  }

  const presets: string[] = Array.isArray(raw.rule?.presets)
    ? raw.rule.presets.map(String)
    : [];

  // ============ context.data ============
  let contextData: UiRuleRecord["contextData"];
  const rawCtxData = raw.context?.data;
  if (rawCtxData && typeof rawCtxData === "object") {
    const dataType: "entity" | "linkage" =
      rawCtxData.type === "linkage" ? "linkage" : "entity";
    contextData = { type: dataType };
    if (dataType === "entity" && typeof rawCtxData.entity === "string") {
      const fqid = normalizeFqid(rawCtxData.entity, domainId);
      if (fqid) contextData.entity = fqid;
    }
    if (dataType === "linkage" && typeof rawCtxData.linkage === "string") {
      const fqid = normalizeFqid(rawCtxData.linkage, domainId);
      if (fqid) contextData.linkage = fqid;
    }
  }

  return {
    id: String(raw.id),
    domainId,
    name: String(raw.name || raw.id),
    description: String(raw.description || ""),
    target,
    view: String(raw.view || ""),
    contextViews,
    operations: operations.length > 0 ? operations : undefined,
    contextData,
    condition: String(raw.condition || ""),
    effect: String(raw.rule?.effect || ""),
    widgets,
    groups,
    columns,
    presets,
    message: String(raw.message || ""),
    help: String(raw.help || ""),
  };
}

/** Inline-объявление виджета: `{ widget: { id, linkageId?, referenceId? } }`. */
function isInlineWidgetObject(w: any): boolean {
  return (
    w !== null &&
    typeof w === "object" &&
    typeof w.id === "string" &&
    !w.id.startsWith("external:")
  );
}

/** Доменные action-виджеты: id → { type, description }. */
function collectDomainActionWidgets(
  rawViews: any[],
): Map<string, { type: string; description: string }> {
  const result = new Map<string, { type: string; description: string }>();
  if (!Array.isArray(rawViews)) return result;

  const walk = (view: any): void => {
    if (!view || typeof view !== "object") return;
    if (Array.isArray(view.widgets)) {
      for (const w of view.widgets) {
        if (w?.id && w.type === "action" && !result.has(String(w.id))) {
          result.set(String(w.id), {
            type: "action",
            description: String(w.description || ""),
          });
        }
      }
    }
    if (Array.isArray(view.views)) {
      for (const nv of view.views) walk(nv);
    }
  };

  for (const v of rawViews) {
    if (v?.type === "entity") walk(v);
  }
  return result;
}

// ---------- Основная функция ----------

function collectViewElements(
  rawViews: any[],
  raw: any, // ← rawData всего домена
): Record<string, ViewElementsRecord> {
  const result: Record<string, ViewElementsRecord> = {};
  if (!Array.isArray(rawViews)) return result;

  // ============ Индексы для резолва description ============
  const linkageById = new Map<string, { name: string; type: string }>();
  if (Array.isArray(raw?.linkages)) {
    for (const l of raw.linkages) {
      if (!l?.id) continue;
      linkageById.set(String(l.id), {
        name: String(l.name || l.id),
        type: String(l.type || ""),
      });
    }
  }

  const entityNameById = new Map<string, string>();
  const attrByEntityAndId = new Map<
    string,
    { name: string; dataType: string; nestedColumns?: string[] }
  >();
  if (Array.isArray(raw?.entities)) {
    for (const e of raw.entities) {
      if (!e?.id) continue;
      entityNameById.set(String(e.id), String(e.name || e.id));
      if (Array.isArray(e.attributes)) {
        for (const a of e.attributes) {
          if (!a?.id) continue;
          const nestedColumns =
            a.dataType === "Table" && Array.isArray(a.attributes)
              ? a.attributes
                  .map((x: any) => String(x?.id || ""))
                  .filter(Boolean)
              : undefined;
          attrByEntityAndId.set(`${e.id}#${a.id}`, {
            name: String(a.name || a.id),
            dataType: String(a.dataType || ""),
            nestedColumns,
          });
        }
      }
    }
  }

  /** Резолв `attribute`-ссылки в ключ `<EntityId>#<AttrId>` для текущего домена. */
  const resolveAttrKey = (ref: any, entityId: string | null): string | null => {
    if (!ref || typeof ref !== "string") return null;
    const s = ref.trim();
    if (!s) return null;
    // FQID на другой домен — не резолвим локально.
    if (s.includes("/")) {
      // `other.dom/Entity.attr` → попробуем вытащить локальную часть,
      // но только если домен — текущий. Здесь у нас нет domainId домена
      // (raw.domainId мог быть переопределён), поэтому пропускаем.
      return null;
    }
    const dot = s.indexOf(".");
    if (dot > 0) {
      const eId = s.slice(0, dot);
      const aId = s.slice(dot + 1);
      return `${eId}#${aId}`;
    }
    if (!entityId) return null;
    return `${entityId}#${s}`;
  };

  const buildAttributeWidgetDescription = (
    attributeRef: any,
    entityId: string | null,
  ): string => {
    const key = resolveAttrKey(attributeRef, entityId);
    if (!key) return "";
    const info = attrByEntityAndId.get(key);
    if (!info) return "";
    const parts: string[] = [];
    if (info.dataType) parts.push(info.dataType);
    if (info.name && info.name !== key.split("#")[1]) parts.push(info.name);
    return parts.join(" · ");
  };

  // ============ Всё остальное — как в прошлом патче ============
  const domainActionWidgets = collectDomainActionWidgets(rawViews);

  for (const v of rawViews) {
    if (!v?.id) continue;

    const widgets = new Set<string>();
    const groups = new Set<string>();
    const columns = new Set<string>();
    const widgetsWithType: ViewElementRef[] = [];
    const groupsWithType: ViewElementRef[] = [];
    const columnsWithType: ViewElementRef[] = [];
    const seenW = new Set<string>();
    const seenG = new Set<string>();
    const seenC = new Set<string>();

    const addWidget = (
      id: string,
      type: string,
      description: string,
      counterColorPattern?: string,
      attributeDataType?: string,
      attributeNestedColumns?: string[],
    ) => {
      widgets.add(id);
      if (!seenW.has(id)) {
        seenW.add(id);
        const ref: ViewElementRef = {
          id,
          type: type || "",
          description: description || "",
        };
        if (counterColorPattern) ref.counterColorPattern = counterColorPattern;
        if (attributeDataType) ref.attributeDataType = attributeDataType;
        if (attributeNestedColumns && attributeNestedColumns.length > 0) {
          ref.attributeNestedColumns = attributeNestedColumns;
        }
        widgetsWithType.push(ref);
      }
    };

    const addColumn = (
      id: string,
      type: string,
      description: string,
      counterColorPattern?: string,
      attributeDataType?: string,
      attributeNestedColumns?: string[],
    ) => {
      columns.add(id);
      if (!seenC.has(id)) {
        seenC.add(id);
        const ref: ViewElementRef = {
          id,
          type: type || "",
          description: description || "",
        };
        if (counterColorPattern) ref.counterColorPattern = counterColorPattern;
        if (attributeDataType) ref.attributeDataType = attributeDataType;
        if (attributeNestedColumns && attributeNestedColumns.length > 0) {
          ref.attributeNestedColumns = attributeNestedColumns;
        }
        columnsWithType.push(ref);
      }
    };

    const addGroup = (id: string, type: string, description: string) => {
      groups.add(id);
      if (!seenG.has(id)) {
        seenG.add(id);
        groupsWithType.push({
          id,
          type: type || "",
          description: description || "",
        });
      }
    };

    // ============ Компоненты групп ============
    const collectComponents = (comps: any): void => {
      if (!Array.isArray(comps)) return;
      for (const c of comps) {
        if (!c || typeof c !== "object") continue;
        if (isInlineWidgetObject(c.widget)) {
          const wid = String(c.widget.id);
          let desc = String(c.widget.description || "").trim();

          if (!desc && c.widget.linkageId) {
            const info = linkageById.get(String(c.widget.linkageId));
            desc = info
              ? `связь: ${info.name}${info.type ? ` (${info.type})` : ""}`
              : `связь: ${c.widget.linkageId}`;
          } else if (!desc && c.widget.referenceId) {
            const refId = String(c.widget.referenceId);
            const localId = refId.includes("/")
              ? refId.split("/").pop()!
              : refId;
            const nm = entityNameById.get(localId);
            desc = nm ? `ссылка: ${nm}` : `ссылка: ${refId}`;
          }

          addWidget(wid, "", desc);
        }
      }
    };

    // ============ Рекурсивный обход view ============
    const collectFromView = (view: any, entityId: string | null): void => {
      if (!view || typeof view !== "object") return;

      const nextEntityId: string | null = view.entity
        ? String(view.entity)
        : view.source?.entity
          ? String(view.source.entity)
          : entityId;

      if (Array.isArray(view.widgets)) {
        for (const w of view.widgets) {
          if (!w?.id) continue;
          let desc = String(w.description || "").trim();
          if (!desc && w.type === "attribute" && w.attribute) {
            desc = buildAttributeWidgetDescription(w.attribute, nextEntityId);
          }
          const ccp =
            typeof w.counterColorPattern === "string" && w.counterColorPattern
              ? w.counterColorPattern
              : undefined;

          let attrDataType: string | undefined;
          let attrNestedColumns: string[] | undefined;
          if (w.type === "attribute" && typeof w.attribute === "string") {
            const key = resolveAttrKey(w.attribute, nextEntityId);
            if (key) {
              const info = attrByEntityAndId.get(key);
              if (info) {
                attrDataType = info.dataType || undefined;
                attrNestedColumns = info.nestedColumns;
              }
            }
          }

          addWidget(
            String(w.id),
            String(w.type || ""),
            desc,
            ccp,
            attrDataType,
            attrNestedColumns,
          );
        }
      }

      if (Array.isArray(view.groups)) {
        for (const g of view.groups) {
          if (g?.id) {
            addGroup(
              String(g.id),
              String(g.type || ""),
              String(g.description || "").trim(),
            );
          }
          collectComponents(g?.components);
        }
      }

      if (Array.isArray(view.table?.columns)) {
        for (const c of view.table.columns) {
          if (!c?.id) continue;
          const ccp =
            typeof c.counterColorPattern === "string" && c.counterColorPattern
              ? c.counterColorPattern
              : undefined;

          let attrDataType: string | undefined;
          let attrNestedColumns: string[] | undefined;
          if (typeof c.attribute === "string" && c.attribute) {
            const key = resolveAttrKey(c.attribute, nextEntityId);
            if (key) {
              const info = attrByEntityAndId.get(key);
              if (info) {
                attrDataType = info.dataType || undefined;
                attrNestedColumns = info.nestedColumns;
              }
            }
          }

          addColumn(
            String(c.id),
            "",
            String(c.label || c.description || "").trim(),
            ccp,
            attrDataType,
            attrNestedColumns,
          );
        }
      }

      if (Array.isArray(view.actionPanel)) {
        for (const ap of view.actionPanel) {
          if (!ap || typeof ap !== "object") continue;
          // ============ Плоская ссылка: - widget: buttons_createIoc ============
          // (list-view / tree-view / page actionPanel)
          if (
            typeof ap.widget === "string" &&
            ap.widget &&
            !ap.widget.startsWith("external:")
          ) {
            addWidget(ap.widget, "action", "");
            continue;
          }
          // ============ Inline-объект (mixin change.add) ============
          if (isInlineWidgetObject(ap.widget)) {
            const wid = String(ap.widget.id);
            let desc = String(ap.widget.description || "").trim();
            if (!desc && ap.widget.linkageId) {
              const info = linkageById.get(String(ap.widget.linkageId));
              desc = info
                ? `связь: ${info.name}${info.type ? ` (${info.type})` : ""}`
                : `связь: ${ap.widget.linkageId}`;
            } else if (!desc && ap.widget.referenceId) {
              const refId = String(ap.widget.referenceId);
              const localId = refId.includes("/")
                ? refId.split("/").pop()!
                : refId;
              const nm = entityNameById.get(localId);
              desc = nm ? `ссылка: ${nm}` : `ссылка: ${refId}`;
            }
            addWidget(wid, "action", desc);
          }
        }
      }

      if (Array.isArray(view.views)) {
        for (const nv of view.views) collectFromView(nv, nextEntityId);
      }
    };

    collectFromView(v, null);

    if (v.type === "list" || v.type === "tree") {
      domainActionWidgets.forEach((info, id) =>
        addWidget(id, info.type, info.description),
      );
    }

    result[String(v.id)] = {
      widgets: Array.from(widgets),
      groups: Array.from(groups),
      columns: Array.from(columns),
      widgetsWithType,
      groupsWithType,
      columnsWithType,
    };
  }

  return result;
}

// ============ Плоская мета-структура view ============

interface ViewMetaResult {
  groups: ViewGroupRecord[];
  widgets: ViewWidgetRecord[];
  actionPanels: ViewActionPanelRecord[];
  columns: ViewColumnRecord[];
  filters: ViewTableFilterRecord[];
  sortings: ViewTableSortingRecord[];
  pagings: ViewTablePagingRecord[];
  tableActions: ViewTableActionRecord[];
  sourceJoins: ViewSourceJoinRecord[];
  menuActions: ViewMenuActionRecord[];
  groupComponents: ViewGroupComponentRecord[];
}

/**
 * Парсит `views[type=tree].table.filter[]` — массив фильтр-блоков по
 * сущностям дерева. Для list-view `filter` объектный и обрабатывается
 * в `collectViewMeta`; здесь — только tree-специфика.
 */
function collectTreeFilters(
  raw: any,
  domainId: string,
): ViewTreeFilterRecord[] {
  const result: ViewTreeFilterRecord[] = [];
  const views = Array.isArray(raw?.views) ? raw.views : [];

  for (const v of views) {
    if (!v?.id) continue;
    if (v.type !== "tree") continue;

    const filters = v.table?.filter;
    if (!Array.isArray(filters)) continue;

    for (let i = 0; i < filters.length; i++) {
      const f = filters[i];
      if (!f || typeof f !== "object") continue;

      const entityFqid = normalizeFqid(f.entity, domainId);
      if (!entityFqid) continue;

      // attributes.use[] — только при type: specific
      const attributes: ViewTreeFilterAttribute[] = [];
      const fa = f.attributes;
      if (
        fa &&
        typeof fa === "object" &&
        fa.type === "specific" &&
        Array.isArray(fa.use)
      ) {
        for (const a of fa.use) {
          if (!a || typeof a !== "object") continue;
          if (typeof a.attribute !== "string" || !a.attribute) continue;
          const rec: ViewTreeFilterAttribute = { attribute: a.attribute };
          if (Array.isArray(a.use)) {
            const arr = a.use
              .map((u: any) =>
                u && typeof u.attribute === "string" ? u.attribute : null,
              )
              .filter((x: string | null): x is string => !!x);
            if (arr.length > 0) rec.use = arr;
          }
          attributes.push(rec);
        }
      }

      // linkages.use[] — только при type: specific
      const linkages: ViewTreeFilterLinkage[] = [];
      const fl = f.linkages;
      if (
        fl &&
        typeof fl === "object" &&
        fl.type === "specific" &&
        Array.isArray(fl.use)
      ) {
        for (const u of fl.use) {
          if (!u || typeof u !== "object") continue;
          const rec: ViewTreeFilterLinkage = {};

          if (typeof u.linkage === "string" && u.linkage) {
            const fqid = normalizeFqid(u.linkage, domainId);
            if (fqid) rec.linkage = fqid;
          }
          if (typeof u.join === "string" && u.join) rec.join = u.join;

          if (Array.isArray(u.link_attributes)) {
            const arr = u.link_attributes
              .map((x: any) =>
                x && typeof x.attribute === "string" ? x.attribute : null,
              )
              .filter((x: string | null): x is string => !!x);
            if (arr.length > 0) rec.linkAttributes = arr;
          }
          if (Array.isArray(u.linkedEntity)) {
            const arr = u.linkedEntity
              .map((x: any) =>
                x && typeof x.attribute === "string" ? x.attribute : null,
              )
              .filter((x: string | null): x is string => !!x);
            if (arr.length > 0) rec.linkedEntity = arr;
          }

          if (Object.keys(rec).length > 0) linkages.push(rec);
        }
      }

      result.push({
        domainId,
        viewId: String(v.id),
        entity: entityFqid,
        attributes,
        linkages,
        propertyPath: `views[${v.id}].table.filter[${i}]`,
      });
    }
  }

  return result;
}

function collectViewMeta(raw: any, domainId: string): ViewMetaResult {
  const groups: ViewGroupRecord[] = [];
  const widgets: ViewWidgetRecord[] = [];
  const actionPanels: ViewActionPanelRecord[] = [];
  const columns: ViewColumnRecord[] = [];
  const seenGroups = new Set<string>();
  const seenWidgets = new Set<string>();
  const seenColumns = new Set<string>();
  const filters: ViewTableFilterRecord[] = [];
  const sortings: ViewTableSortingRecord[] = [];
  const pagings: ViewTablePagingRecord[] = [];
  const tableActions: ViewTableActionRecord[] = [];
  const sourceJoins: ViewSourceJoinRecord[] = [];
  const menuActions: ViewMenuActionRecord[] = [];
  const groupComponents: ViewGroupComponentRecord[] = [];

  const views = Array.isArray(raw?.views) ? raw.views : [];

  // ============ walk: обходит view рекурсивно (top-level + nested) ============
  // Обрабатывает только то, что относится к любому уровню вложенности:
  // widgets, groups, actionPanel, panel.menu, table.columns, source.joins.
  const walk = (view: any, topViewId: string): void => {
    if (!view || typeof view !== "object") return;

    // ============ widgets[] ============
    if (Array.isArray(view.widgets)) {
      for (const w of view.widgets) {
        if (!w?.id) continue;
        const key = `${topViewId}#${w.id}`;
        if (seenWidgets.has(key)) continue;
        seenWidgets.add(key);

        const rec: ViewWidgetRecord = {
          id: String(w.id),
          domainId,
          parentViewId: topViewId,
          type: String(w.type || ""),
        };
        if (
          w.control &&
          typeof w.control === "object" &&
          typeof w.control.type === "string"
        ) {
          rec.controlType = w.control.type;
        }
        if (typeof w.attribute === "string" && w.attribute) {
          rec.attribute = w.attribute;
        }
        if (typeof w.linkage === "string" && w.linkage) {
          rec.linkage = w.linkage;
        }
        if (w.side === 1 || w.side === 2) {
          rec.side = w.side;
        }
        if (Array.isArray(w.attributes)) {
          const attrs: string[] = [];
          for (const a of w.attributes) {
            if (a && typeof a === "object" && typeof a.attribute === "string") {
              attrs.push(a.attribute);
            }
          }
          if (attrs.length > 0) rec.linkageAttributes = attrs;
        }
        // control.columns[] — только для linkage с control.type=table
        if (
          w.type === "linkage" &&
          w.control &&
          typeof w.control === "object" &&
          w.control.type === "table" &&
          Array.isArray(w.control.columns)
        ) {
          const cols: ViewWidgetColumnRef[] = [];
          for (const c of w.control.columns) {
            if (!c || typeof c !== "object" || typeof c.id !== "string") {
              continue;
            }
            const cr: ViewWidgetColumnRef = { id: c.id };
            if (typeof c.attribute === "string" && c.attribute) {
              cr.attribute = c.attribute;
            }
            if (typeof c.join === "string" && c.join) cr.join = c.join;
            if (typeof c.linkageAttribute === "string" && c.linkageAttribute) {
              cr.linkageAttribute = c.linkageAttribute;
            }
            // PR-5: control.type / control.tree — для проверки tree_path
            if (c.control && typeof c.control === "object") {
              if (typeof c.control.type === "string" && c.control.type) {
                cr.controlType = c.control.type;
              }
              if (typeof c.control.tree === "string" && c.control.tree) {
                cr.controlTree = c.control.tree;
              }
            }
            cols.push(cr);
          }
          if (cols.length > 0) rec.controlColumns = cols;
          if (
            typeof w.control.addLinksView === "string" &&
            w.control.addLinksView
          ) {
            rec.addLinksView = w.control.addLinksView;
          }
          if (w.control && typeof w.control === "object") {
            const dm = w.control.displayMode;
            if (dm === "flat" || dm === "grouped") rec.displayMode = dm;
          }
        }
        // linked_objects_groups.linkages[]
        if (w.type === "linked_objects_groups" && Array.isArray(w.linkages)) {
          const refs: ViewWidgetLinkageRef[] = [];
          for (const lk of w.linkages) {
            if (!lk || typeof lk !== "object") continue;
            if (typeof lk.linkage !== "string" || !lk.linkage) continue;
            const ref: ViewWidgetLinkageRef = { linkage: lk.linkage };
            if (lk.side === 1 || lk.side === 2) ref.side = lk.side;
            refs.push(ref);
          }
          if (refs.length > 0) rec.linkedGroupsLinkages = refs;
        }

        // linked_objects_groups.joins[] + control.displayMode
        if (w.type === "linked_objects_groups") {
          if (Array.isArray(w.joins)) {
            const joins: string[] = [];
            for (const j of w.joins) {
              if (
                j &&
                typeof j === "object" &&
                typeof j.join === "string" &&
                j.join
              ) {
                joins.push(j.join);
              }
            }
            if (joins.length > 0) rec.linkedGroupsJoins = joins;
          }

          // columns[]
          if (Array.isArray(w.columns)) {
            const cols: ViewWidgetColumnRef[] = [];
            for (const c of w.columns) {
              if (!c || typeof c !== "object") continue;
              if (typeof c.id !== "string" || !c.id) continue;
              const cr: ViewWidgetColumnRef = { id: c.id };
              if (typeof c.attribute === "string" && c.attribute) {
                cr.attribute = c.attribute;
              }
              if (typeof c.join === "string" && c.join) cr.join = c.join;
              if (
                typeof c.linkageAttribute === "string" &&
                c.linkageAttribute
              ) {
                cr.linkageAttribute = c.linkageAttribute;
              }
              cols.push(cr);
            }
            if (cols.length > 0) rec.linkedGroupsColumns = cols;
          }

          // groupingBy[] — по docs [{attribute: x}, ...] или [x, y, ...]
          if (Array.isArray(w.groupingBy)) {
            const ids: string[] = [];
            for (const g of w.groupingBy) {
              if (typeof g === "string" && g) ids.push(g);
              else if (
                g &&
                typeof g === "object" &&
                typeof g.attribute === "string"
              ) {
                ids.push(g.attribute);
              }
            }
            if (ids.length > 0) rec.linkedGroupsGroupingBy = ids;
          }
        }

        // join-widget
        if (w.type === "join") {
          if (typeof w.joinId === "string" && w.joinId) {
            rec.joinId = w.joinId;
          }
          if (typeof w.openView === "string" && w.openView) {
            rec.openView = w.openView;
          }
        }

        // ============ action-widget: actions[] (dropdown) ============
        if (w.type === "action" && Array.isArray(w.actions)) {
          const acts: string[] = [];
          for (const a of w.actions) {
            if (typeof a === "string" && a) {
              acts.push(a);
              continue;
            }
            if (
              a &&
              typeof a === "object" &&
              typeof a.action === "string" &&
              a.action
            ) {
              acts.push(a.action);
            }
          }
          if (acts.length > 0) rec.actionIds = acts;
        }
        
        widgets.push(rec);
      }
    }

    // ============ groups[] ============
    if (Array.isArray(view.groups)) {
      for (const g of view.groups) {
        if (!g?.id) continue;
        const key = `${topViewId}#${g.id}`;
        if (seenGroups.has(key)) continue;
        seenGroups.add(key);
        groups.push({
          id: String(g.id),
          domainId,
          parentViewId: topViewId,
          type: String(g.type || ""),
        });

        if (Array.isArray(g.components)) {
          for (let ci = 0; ci < g.components.length; ci++) {
            const comp = g.components[ci];
            if (!comp || typeof comp !== "object") continue;
            // Пропускаем inherit-компоненты (в них нет реальной ссылки)
            if ("inherit" in comp) continue;

            if (typeof comp.widget === "string" && comp.widget) {
              groupComponents.push({
                domainId,
                viewId: topViewId,
                groupId: String(g.id),
                kind: "widget",
                widget: comp.widget,
                index: ci,
              });
            } else if (
              comp.widget &&
              typeof comp.widget === "object" &&
              typeof comp.widget.id === "string"
            ) {
              // Инлайн-объект widget {id, linkageId?, referenceId?}
              groupComponents.push({
                domainId,
                viewId: topViewId,
                groupId: String(g.id),
                kind: "widget",
                widget: comp.widget.id,
                index: ci,
              });
            } else if (typeof comp.block === "string" && comp.block) {
              groupComponents.push({
                domainId,
                viewId: topViewId,
                groupId: String(g.id),
                kind: "block",
                block: comp.block,
                index: ci,
              });
            }
          }
        }
      }
    }

    // ============ panel.menu[].action ============
    if (view.type === "panel" && Array.isArray(view.menu)) {
      for (let mi = 0; mi < view.menu.length; mi++) {
        const item = view.menu[mi];
        if (!item || typeof item !== "object") continue;
        if ("inherit" in item) continue;
        if (typeof item.action === "string" && item.action) {
          menuActions.push({
            domainId,
            viewId: topViewId,
            panelViewId: String(view.id),
            action: item.action,
            index: mi,
          });
        }
      }
    }

    // ============ actionPanel[] ============
    if (Array.isArray(view.actionPanel)) {
      for (const ap of view.actionPanel) {
        let widgetId: string | null = null;
        if (typeof ap === "string" && ap) widgetId = ap;
        else if (ap && typeof ap === "object" && typeof ap.widget === "string")
          widgetId = ap.widget;
        if (!widgetId) continue;

        actionPanels.push({
          id: `${domainId}#${topViewId}#${actionPanels.length}`,
          domainId,
          viewId: topViewId,
          widget: widgetId,
        });
      }
    }

    // ============ table.columns[] ============
    if (Array.isArray(view.table?.columns)) {
      for (const c of view.table.columns) {
        if (!c?.id) continue;
        const key = `${topViewId}#${c.id}`;
        if (seenColumns.has(key)) continue;
        seenColumns.add(key);

        const rec: ViewColumnRecord = {
          id: String(c.id),
          domainId,
          viewId: topViewId,
        };
        if (typeof c.attribute === "string" && c.attribute)
          rec.attribute = c.attribute;
        if (typeof c.join === "string" && c.join) rec.join = c.join;
        if (typeof c.linkageAttribute === "string" && c.linkageAttribute)
          rec.linkageAttribute = c.linkageAttribute;
        if (c.control && typeof c.control === "object") {
          if (typeof c.control.type === "string")
            rec.controlType = c.control.type;
          if (typeof c.control.tree === "string")
            rec.controlTree = c.control.tree;
        }
        if (Array.isArray(c.actions)) {
          const types = c.actions
            .map((a: any) =>
              a && typeof a === "object" && typeof a.action === "string"
                ? String(a.action)
                : null,
            )
            .filter((x: string | null): x is string => !!x);
          if (types.length > 0) rec.actionTypes = types;
        }
        columns.push(rec);
      }
    }

    // ============ view.source.joins[] (legacy) ============
    const src = view.source;
    if (
      src &&
      typeof src === "object" &&
      Array.isArray(src.joins) &&
      (view.type === "list" ||
        view.type === "tree" ||
        view.type === "tabs_list")
    ) {
      for (let i = 0; i < src.joins.length; i++) {
        const j = src.joins[i];
        if (!j || typeof j !== "object") continue;
        if (typeof j.id !== "string" || !j.id) continue;
        if (typeof j.linkage !== "string" || !j.linkage) continue;
        const fqid = normalizeFqid(j.linkage, domainId);
        if (!fqid) continue;
        const rec: ViewSourceJoinRecord = {
          domainId,
          viewId: topViewId,
          id: j.id,
          linkage: fqid,
          propertyPath: `views[${topViewId}].source.joins[${i}]`,
        };
        if (j.side === 1 || j.side === 2) rec.side = j.side;
        sourceJoins.push(rec);
      }
    }

    // ============ рекурсия во вложенные views ============
    if (Array.isArray(view.views)) {
      for (const nv of view.views) walk(nv, topViewId);
    }
  };

  // ============ обход всех top-level views (walk) ============
  for (const v of views) {
    if (!v?.id) continue;
    walk(v, String(v.id));
  }

  // ============ filter / sortingBy / paging / table.actions[] ============
  // Эти секции относятся ТОЛЬКО к top-level view (list / tree).
  // Вынесено из walk() — иначе на каждый рекурсивный вызов проходились
  // бы ВСЕ top-level views (O(n²) с guard'ами seen*).
  //
  // Каждая view обрабатывается ровно один раз — guard'ы больше не нужны.
  for (const v of views) {
    if (!v?.id) continue;
    const viewId = String(v.id);
    const t = v.table;

    // ============ filter ============
    if (t && typeof t === "object") {
      const attributes: ViewTableFilterAttribute[] = [];
      const linkages: ViewTableFilterLinkage[] = [];

      // filter.attributes
      const fa = t.filter?.attributes;
      if (
        fa &&
        typeof fa === "object" &&
        fa.type === "specific" &&
        Array.isArray(fa.use)
      ) {
        for (const u of fa.use) {
          if (!u || typeof u !== "object") continue;
          if (typeof u.attribute !== "string" || !u.attribute) continue;
          attributes.push({ attribute: u.attribute });
        }
      }

      // filter.linkages
      const fl = t.filter?.linkages;
      if (
        fl &&
        typeof fl === "object" &&
        fl.type === "specific" &&
        Array.isArray(fl.use)
      ) {
        for (const u of fl.use) {
          if (!u || typeof u !== "object") continue;
          const rec: ViewTableFilterLinkage = {};

          if (typeof u.linkage === "string" && u.linkage) {
            const fqid = normalizeFqid(u.linkage, domainId);
            if (fqid) rec.linkage = fqid;
          }
          if (typeof u.join === "string" && u.join) rec.join = u.join;

          if (Array.isArray(u.link_attributes)) {
            const arr = u.link_attributes
              .map((x: any) =>
                x && typeof x === "object" && typeof x.attribute === "string"
                  ? x.attribute
                  : null,
              )
              .filter((x: string | null): x is string => !!x);
            if (arr.length > 0) rec.linkAttributes = arr;
          }
          if (Array.isArray(u.linkedEntity)) {
            const arr = u.linkedEntity
              .map((x: any) =>
                x && typeof x === "object" && typeof x.attribute === "string"
                  ? x.attribute
                  : null,
              )
              .filter((x: string | null): x is string => !!x);
            if (arr.length > 0) rec.linkedEntity = arr;
          }

          if (Object.keys(rec).length > 0) linkages.push(rec);
        }
      }

      if (attributes.length > 0 || linkages.length > 0) {
        filters.push({ domainId, viewId, attributes, linkages });
      }
    }

    // ============ sortingBy ============
    if (t && typeof t === "object") {
      const sb = t.sortingBy;
      if (sb && typeof sb === "object") {
        const cols: ViewTableSortingColumn[] = [];
        if (Array.isArray(sb.columns)) {
          for (const c of sb.columns) {
            if (!c || typeof c !== "object") continue;
            if (typeof c.column !== "string" || !c.column) continue;
            if (typeof c.sorting !== "string" || !c.sorting) continue;
            cols.push({ column: c.column, sorting: c.sorting });
          }
        }

        const rec: ViewTableSortingRecord = {
          domainId,
          viewId,
          columns: cols,
        };

        if (sb.defaults && typeof sb.defaults === "object") {
          if (typeof sb.defaults.column === "string" && sb.defaults.column) {
            rec.defaultColumn = sb.defaults.column;
          }
          if (
            sb.defaults.direction === "asc" ||
            sb.defaults.direction === "desc"
          ) {
            rec.defaultDirection = sb.defaults.direction;
          }
        }

        if (cols.length > 0 || rec.defaultColumn) {
          sortings.push(rec);
        }
      }
    }

    // ============ paging ============
    if (t && typeof t === "object" && t.paging) {
      const p = t.paging;
      const rawSizes = Array.isArray(p.sizes) ? p.sizes : [];
      const sizes: number[] = [];
      for (const s of rawSizes) {
        const n = typeof s === "number" ? s : Number(s);
        if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) sizes.push(n);
      }
      const rawDefaultSize = p.defaultSize;
      let defaultSize: number | undefined;
      if (rawDefaultSize !== undefined) {
        const n =
          typeof rawDefaultSize === "number"
            ? rawDefaultSize
            : Number(rawDefaultSize);
        if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) defaultSize = n;
      }
      if (rawSizes.length > 0 || rawDefaultSize !== undefined) {
        pagings.push({
          domainId,
          viewId,
          rawSizes,
          sizes,
          rawDefaultSize,
          defaultSize,
        });
      }
    }

    // ============ table.actions[] ============
    if (t && typeof t === "object" && Array.isArray(t.actions)) {
      for (const a of t.actions) {
        if (!a || typeof a !== "object") continue;
        const type = String(a.type || "");
        if (!type) continue;

        const rec: ViewTableActionRecord = {
          domainId,
          viewId,
          type,
          items: [],
        };

        if (typeof a.action === "string" && a.action) {
          rec.action = a.action;
        }
        const rawItems = Array.isArray(a.menu)
          ? a.menu
          : Array.isArray(a.items)
            ? a.items
            : [];
        for (const it of rawItems) {
          if (!it || typeof it !== "object") continue;
          if (typeof it.action !== "string" || !it.action) continue;
          const item: ViewTableActionItemRef = { action: it.action };
          if (typeof it.label === "string") item.label = it.label;
          if (typeof it.icon === "string") item.icon = it.icon;
          rec.items.push(item);
        }
        tableActions.push(rec);
      }
    }
  }

  return {
    groups,
    widgets,
    actionPanels,
    columns,
    filters,
    sortings,
    pagings,
    tableActions,
    sourceJoins,
    menuActions,
    groupComponents,
  };
}

export function buildModelIndex(rawDomains: RawDomainEntry[]): ModelIndex {
  const rawDomainsById = new Map<string, RawDomainEntry>();
  rawDomains.forEach((d) => rawDomainsById.set(d.id, d));

  // Generic-секции — минимальные снимки для semantic-diff.
  const genericSections = collectGenericSections(rawDomains);

  const entities: EntityRecord[] = [];
  const entitiesByFqid: Record<string, EntityRecord> = {};
  const mixins: MixinRecord[] = [];
  const dataTypes: DataTypeRecord[] = [];
  const sequences: SequenceRecord[] = [];
  const schemasByDomain: Record<string, DomainSchemaSummary> = {};
  const scenarioMap = new Map<string, ScenarioRecord>();
  const uiRules: UiRuleRecord[] = [];
  const uiPresets: UiPresetRecord[] = [];
  const uiPresetsByDomain: Record<string, string[]> = {};
  const viewElementsByDomain: Record<
    string,
    Record<string, ViewElementsRecord>
  > = {};
  const dataRules: DataRuleRecord[] = [];
  const trees: TreeRecord[] = [];
  const transitiveLinkages: TransitiveLinkageRecord[] = [];
  const menus: MenuRecord[] = [];
  const medias: MediaRecord[] = [];
  const permissions: PermissionRecord[] = [];
  const accessRules: AccessRuleRecord[] = [];
  const localizations: LocalizationRecord[] = [];
  const counterColorPatterns: CounterColorPatternRecord[] = [];
  const counterColorPatternsByDomain: Record<string, string[]> = {};
  const actions: ActionRecord[] = [];
  const actionsById: Record<string, ActionRecord> = {};
  const viewGroups: ViewGroupRecord[] = [];
  const viewWidgets: ViewWidgetRecord[] = [];
  const viewActionPanels: ViewActionPanelRecord[] = [];
  const viewColumns: ViewColumnRecord[] = [];
  const viewTableFilters: ViewTableFilterRecord[] = [];
  const viewTableSortings: ViewTableSortingRecord[] = [];
  const viewTablePagings: ViewTablePagingRecord[] = [];
  const viewTableActions: ViewTableActionRecord[] = [];
  const viewTreeFilters: ViewTreeFilterRecord[] = [];
  const viewSourceJoins: ViewSourceJoinRecord[] = [];
  const exchangeSettingsByDomain: Record<string, ExchangeSettingsRecord> = {};
  const viewMenuActions: ViewMenuActionRecord[] = [];
  const viewGroupComponents: ViewGroupComponentRecord[] = [];

  // Проход 1: собрать все кастомные dataTypes IDs (для классификации атрибутов)
  const customDataTypeIdsByDomain = new Map<string, Set<string>>();
  rawDomains.forEach((d) => {
    const set = new Set<string>();
    const dts = d.rawData?.dataTypes;
    if (Array.isArray(dts)) {
      dts.forEach((dt: any) => {
        if (dt && dt.id) set.add(String(dt.id));
      });
    }
    customDataTypeIdsByDomain.set(d.id, set);
  });

  // Проход 2: парсим сущности, dataTypes, sequences, mixins
  rawDomains.forEach((d) => {
    const raw = d.rawData || {};
    const customIds = customDataTypeIdsByDomain.get(d.id) || new Set<string>();

    // Entities
    if (Array.isArray(raw.entities)) {
      raw.entities.forEach((e: any) => {
        const rec = parseEntity(e, d.id, d, customIds);
        if (rec) {
          // Дубликаты оставляем в массиве — их поймает линтер (duplicate-id).
          entities.push(rec);
          if (!entitiesByFqid[rec.fqid]) {
            entitiesByFqid[rec.fqid] = rec;
          }
        }
      });
    }

    // DataTypes
    if (Array.isArray(raw.dataTypes)) {
      raw.dataTypes.forEach((dt: any) => {
        const rec = parseDataType(dt, d.id);
        if (rec) dataTypes.push(rec);
      });
    }

    // Sequences
    if (Array.isArray(raw.sequences)) {
      raw.sequences.forEach((s: any) => {
        const rec = parseSequence(s, d.id);
        if (rec) sequences.push(rec);
      });
    }

    // Scenarios (playbooks / scripts) — собираем из actions[]
    if (Array.isArray(raw.actions)) {
      raw.actions.forEach((a: any) => {
        if (!a || typeof a !== "object") return;
        if (a.type !== "scenario") return;
        const scenarioId = a.scenario ? String(a.scenario).trim() : "";
        if (!scenarioId) return;
        const actionId = String(a.id || "").trim();
        if (!actionId) return;

        let rec = scenarioMap.get(scenarioId);
        if (!rec) {
          rec = { id: scenarioId, actions: [], domains: [] };
          scenarioMap.set(scenarioId, rec);
        }

        const actionRef: ScenarioActionRef = {
          domainId: d.id,
          actionId,
          actionName: String(a.name || a.id || ""),
        };
        if (a.workerTag) actionRef.workerTag = String(a.workerTag);

        rec.actions.push(actionRef);
        if (!rec.domains.includes(d.id)) rec.domains.push(d.id);
      });
    }

    // UI Rules
    if (Array.isArray(raw.uiRules)) {
      raw.uiRules.forEach((r: any) => {
        const rec = parseUiRule(r, d.id);
        if (rec) uiRules.push(rec);
      });
    }

    // UI Presets
    if (Array.isArray(raw.uiPresets)) {
      const domainPresetIds: string[] = [];
      raw.uiPresets.forEach((p: any) => {
        const rec = parseUiPreset(p, d.id);
        if (rec) {
          uiPresets.push(rec);
          domainPresetIds.push(rec.id);
        }
      });
      uiPresetsByDomain[d.id] = domainPresetIds;
    }

    // View Elements (для валидации UI Rules)
    viewElementsByDomain[d.id] = collectViewElements(raw.views || [], raw);

    // PR 6: плоская мета-структура view для checkViews
    {
      const meta = collectViewMeta(raw, d.id);
      viewGroups.push(...meta.groups);
      viewWidgets.push(...meta.widgets);
      viewActionPanels.push(...meta.actionPanels);
      viewColumns.push(...meta.columns);
      viewTableFilters.push(...meta.filters);
      viewTreeFilters.push(...collectTreeFilters(raw, d.id));
      viewSourceJoins.push(...meta.sourceJoins);
      viewTableSortings.push(...meta.sortings);
      viewTablePagings.push(...meta.pagings);
      viewTableActions.push(...meta.tableActions);
      viewMenuActions.push(...meta.menuActions);
      viewGroupComponents.push(...meta.groupComponents);
    }

    // Mixins
    if (Array.isArray(raw.mixins)) {
      const parsed = parseMixins(d.id, raw.mixins);
      mixins.push(...parsed);
    }

    schemasByDomain[d.id] = buildDomainSchemaSummary(d.id, raw);

    // ============ DataRules ============
    if (Array.isArray(raw.dataRules)) {
      raw.dataRules.forEach((r: any) => {
        const rec = parseDataRule(r, d.id);
        if (rec) dataRules.push(rec);
      });
    }

    // ============ Trees ============
    if (Array.isArray(raw.trees)) {
      raw.trees.forEach((t: any) => {
        const rec = parseTree(t, d.id);
        if (rec) trees.push(rec);
      });
    }

    // ============ TransitiveLinkages ============
    if (Array.isArray(raw.transitiveLinkages)) {
      raw.transitiveLinkages.forEach((tl: any) => {
        const rec = parseTransitiveLinkage(tl, d.id);
        if (rec) transitiveLinkages.push(rec);
      });
    }

    // ============ Menus ============
    if (Array.isArray(raw.menus)) {
      raw.menus.forEach((m: any) => {
        const rec = parseMenu(m, d.id);
        if (rec) menus.push(rec);
      });
    }

    // ============ Medias ============
    if (Array.isArray(raw.medias)) {
      raw.medias.forEach((m: any) => {
        const rec = parseMedia(m, d.id);
        if (rec) medias.push(rec);
      });
    }

    // ============ Permissions ============
    if (Array.isArray(raw.permissions)) {
      raw.permissions.forEach((p: any) => {
        const rec = parsePermission(p, d.id);
        if (rec) permissions.push(rec);
      });
    }

    // ============ AccessRules ============
    if (Array.isArray(raw.accessRules)) {
      raw.accessRules.forEach((r: any) => {
        const rec = parseAccessRule(r, d.id);
        if (rec) accessRules.push(rec);
      });
    }

    // ============ Actions ============
    if (Array.isArray(raw.actions)) {
      for (const a of raw.actions) {
        const rec = parseAction(a, d.id);
        if (!rec) continue;
        actions.push(rec);
        actionsById[`${rec.domainId.toLowerCase()}#${rec.id}`] = rec;
      }
    }

    // ============ Localizations ============
    if (Array.isArray(raw.localizations)) {
      raw.localizations.forEach((loc: any) => {
        const rec = parseLocalization(loc, d.id);
        if (rec) localizations.push(rec);
      });
    }

    // ============ CounterColorPatterns ============
    // zod ждёт `counterColorPatterns` (plural), docs — `counterColorPattern`.
    // Поддерживаем оба, чтобы не терять данные.
    const rawCCP = Array.isArray((raw as any).counterColorPatterns)
      ? (raw as any).counterColorPatterns
      : Array.isArray((raw as any).counterColorPattern)
        ? (raw as any).counterColorPattern
        : [];
    const domainCCP: string[] = [];
    for (const c of rawCCP) {
      const rec = parseCounterColorPattern(c, d.id);
      if (!rec) continue;
      counterColorPatterns.push(rec);
      domainCCP.push(rec.id);
    }
    counterColorPatternsByDomain[d.id] = domainCCP;

    // ============ exchangeSettings ============
    if (raw.exchangeSettings && typeof raw.exchangeSettings === "object") {
      const es = parseExchangeSettings(raw.exchangeSettings, d.id);
      if (es) exchangeSettingsByDomain[d.id] = es;
    }
  });

  const scenarios: ScenarioRecord[] = Array.from(scenarioMap.values());
  const scenariosById: Record<string, ScenarioRecord> = {};
  scenarios.forEach((s) => {
    scenariosById[s.id] = s;
  });

  // Проход 3: обратные индексы
  const {
    entityChildrenByFqid,
    attributesByNormalizedName,
    attributesByDataType,
    mixinsByEntityFqid,
  } = buildReverseIndexes(entities, mixins);

  // Проход 4: заполнить обратные ссылки в сущностях
  fillEntityBackrefs(
    entities,
    entitiesByFqid,
    mixinsByEntityFqid,
    rawDomainsById,
  );

  // Проход 5: sequences usedByAttributes
  const seqMap = new Map<string, SequenceRecord>();
  sequences.forEach((s) => seqMap.set(`${s.domainId}/${s.id}`, s));

  entities.forEach((e) => {
    e.attributes.forEach((a) => {
      // Ищем sequence по прямому совпадению в rawData — здесь используем эвристику:
      // атрибуты с dataType Identifier и sequence === ссылка на секвенс
      // (нужен доступ к rawData сущности, поэтому пропускаем — заполним отдельно при желании)
    });
  });

  // Проход 6: usage
  countAttributeUsage(entities, rawDomainsById);

  const uiRulesById: Record<string, UiRuleRecord> = {};
  uiRules.forEach((r) => {
    uiRulesById[`${r.domainId}#${r.id}`] = r;
  });

  // Stats
  const stats = computeStats(
    entities,
    mixins,
    entitiesByFqid,
    entityChildrenByFqid,
    mixinsByEntityFqid,
    dataTypes,
    sequences,
    scenarios,
    uiRules.length,
    uiPresets.length,
    rawDomains.map((d) => d.id),
    rawDomains,
  );

  const entityLinkages: EntityLinkage[] = [];
  const domains: DomainMeta[] = rawDomains.map((d) => {
    const customIds = customDataTypeIdsByDomain.get(d.id) || new Set<string>();
    entityLinkages.push(...parseEntityLinkages(d.id, d.rawData, customIds));

    return {
      id: d.id,
      name: d.name || d.id,
      version: d.version || "",
      author: d.author || "",
      tags: d.tags || [],
      description: d.rawData?.description || "",
    };
  });

  // ============ Линтер + Sonar ============
  const orphans = detectOrphans(
    rawDomains.map((d) => ({ id: d.id, rawData: d.rawData })),
  );

  const partialIndex = {
    generatedAt: new Date().toISOString(),
    domains,
    entities,
    entitiesByFqid,
    mixins,
    mixinsByEntityFqid,
    entityLinkages,
    dataTypes,
    sequences,
    scenarios,
    scenariosById,
    uiRules,
    uiRulesById,
    uiPresets,
    uiPresetsByDomain,
    viewElementsByDomain,
    schemasByDomain,
    entityChildrenByFqid,
    attributesByNormalizedName,
    attributesByDataType,
    stats,
    dataRules,
    dataRulesById: dataRules.reduce<Record<string, DataRuleRecord>>(
      (acc, r) => {
        acc[`${r.domainId}#${r.id}`] = r;
        return acc;
      },
      {},
    ),
    trees,
    transitiveLinkages,
    menus,
    medias,
    permissions,
    accessRules,
    localizations,
    actions,
    actionsById,
    counterColorPatterns,
    counterColorPatternsByDomain,
    viewGroups,
    viewWidgets,
    viewActionPanels,
    viewColumns,
    viewTableFilters,
    viewTableSortings,
    viewTablePagings,
    viewTableActions,
    viewTreeFilters,
    viewSourceJoins,
    exchangeSettingsByDomain,
    viewMenuActions,
    orphans,
  } as ModelIndex;

  const lintReport = lintModel(partialIndex);
  const sonar = computeSonarScores(partialIndex, lintReport);
  const martin = computeMartinReport(partialIndex);
  const pii = detectPii(partialIndex);

  return {
    ...partialIndex,
    scenarios,
    scenariosById,
    genericSections,
    orphans,
    martin,
    pii,
    lint: { lintReport, sonar },
  };
}
