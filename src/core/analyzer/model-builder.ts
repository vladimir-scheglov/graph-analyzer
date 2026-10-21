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
): string | null {
  if (!item || typeof item !== "object") return null;
  if (typeof item.id === "string" && item.id) return item.id;
  // localizations: ключ — language
  if (sectionKey === "localizations" && typeof item.language === "string") {
    return item.language;
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
      for (const item of arr) {
        const id = pickGenericId(key, item);
        if (!id) continue;
        result[key].push({
          id,
          domainId: d.id,
          hash: hashJsonSafe(item),
          label: pickGenericLabel(key, item),
          type: pickGenericType(key, item),
        });
      }
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

  const record: AttributeRecord = {
    id: String(raw.id),
    entityFqid,
    name: String(raw.name || raw.id),
    description: String(raw.description || ""),
    dataType,
    dataTypeKind,
    constraints: Array.isArray(raw.constraints)
      ? raw.constraints.map((c: any) => String(c?.kind || "")).filter(Boolean)
      : [],
    usedInViews: 0,
    usedInRules: 0,
  };

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
      record.itemConstraints = raw.item.constraints
        .map((c: any) => String(c?.kind || ""))
        .filter(Boolean);
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
    entity.searching = raw.searching
      .map((s: any) =>
        s && s.attribute ? { attribute: String(s.attribute) } : null,
      )
      .filter((x): x is { attribute: string } => x !== null);
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
    entity.externals = {
      entities: raw.externals.entities
        .map((x: any) => (typeof x === "string" ? x : x?.entity))
        .filter(Boolean),
      type: raw.externals.type === "selection" ? "selection" : "composition",
    };
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

// ============ Парсинг mixins ============

function extractMixinAdditions(add: any): {
  tabs: string[];
  components: string[];
  blocks: string[];
} {
  const tabs: string[] = [];
  const components: string[] = [];
  const blocks: string[] = [];

  if (!add || typeof add !== "object") return { tabs, components, blocks };

  // add.tabs.tabs = [{tab, label}, ...] или [string, ...]
  if (add.tabs && Array.isArray(add.tabs.tabs)) {
    add.tabs.tabs.forEach((t: any) => {
      const id = typeof t === "string" ? t : t?.tab;
      if (id) tabs.push(String(id));
    });
  }

  // add.components = [{widget|block}, ...] или [string, ...]
  if (Array.isArray(add.components)) {
    add.components.forEach((c: any) => {
      if (typeof c === "string") {
        components.push(c);
      } else if (c && typeof c === "object") {
        if (c.widget) components.push(String(c.widget));
        if (c.block) blocks.push(String(c.block));
      }
    });
  }

  // add.block = "id"
  if (typeof add.block === "string") blocks.push(add.block);

  // add.tabs может быть и просто массивом
  if (Array.isArray(add.tabs)) {
    add.tabs.forEach((t: any) => {
      const id = typeof t === "string" ? t : t?.tab;
      if (id) tabs.push(String(id));
    });
  }

  return { tabs, components, blocks };
}

function parseMixins(domainId: string, rawMixins: any[]): MixinRecord[] {
  if (!Array.isArray(rawMixins)) return [];

  const result: MixinRecord[] = [];

  rawMixins.forEach((m: any) => {
    if (!m || !m.id) return;

    const mixinType: "linkage" | "view" =
      m.type === "linkage" ? "linkage" : "view";

    // Определяем targetEntityFqid / sourceEntityFqid / linkageFqid
    //   view:    entity — строка
    //   linkage: entity — { from, to }, linkage — строка
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
      const change = v.change || {};
      const add = change.add || {};
      // ВАЖНО: replace лежит на уровне v (а не v.change.replace) —
      // это соответствует zod-схеме mixin (G/J/K/N/Q → replace: ...)
      const replace = v.replace || {};

      const { tabs, components, blocks } = extractMixinAdditions(add);

      const record: MixinRecord = {
        id: views.length > 1 ? `${m.id}_${idx}` : String(m.id),
        domainId,
        type: mixinType,
        targetEntityFqid,
        sourceEntityFqid,
        linkageFqid,
        sourceViewId: String(v.fromView || ""),
        targetPanel: v.to?.panel ? String(v.to.panel) : undefined,
        targetTab: v.to?.tab ? String(v.to.tab) : undefined,
        targetForm: v.to?.form ? String(v.to.form) : undefined,
        targetList: v.to?.list ? String(v.to.list) : undefined,
        targetPage: v.to?.page ? String(v.to.page) : undefined,
        changeAction: Object.keys(replace).length > 0 ? "replace" : "add",
        addedTabs: tabs,
        addedComponents: components,
        addedBlocks: blocks,
        useForChild: m.useForChild !== false, // default true
        showMixinInHistory: m.showMixinInHistory === true,
        weight:
          typeof m.weight === "number" && Number.isFinite(m.weight)
            ? m.weight
            : undefined,
        description: String(m.description || v.description || ""),
      };

      result.push(record);
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
    if (domains.length > 1) duplicateEntityIds.push({ entityId, domains });
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

function parseDataRuleLinkageAction(raw: any): DataRuleLinkageAction | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.linkage !== "string" || !raw.linkage) return null;
  const out: DataRuleLinkageAction = { linkage: raw.linkage };
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
      .map(parseDataRuleLinkageAction)
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
            direction: ib.direction === "desc" ? "desc" : "asc",
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

  const type: TreeRecord["type"] =
    raw.type === "orderable" || raw.type === "multiparent"
      ? raw.type
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
  const type: MenuRecord["type"] =
    raw.type === "root_menu" ? "root_menu" : "root_group";
  const placement: MenuRecord["placement"] =
    raw.placement === "settings" ? "settings" : "top";
  const out: MenuRecord = {
    id: raw.id,
    domainId,
    type,
    route: String(raw.route || ""),
    label: String(raw.label || raw.id),
    placement,
  };
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
  const type: MediaRecord["type"] = raw.type === "data" ? "data" : "icon_name";
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

  const widgets: UiRuleWidgetRef[] = [];
  if (Array.isArray(raw.rule?.widgets)) {
    for (const w of raw.rule.widgets) {
      if (!w || !w.widget) continue;
      const ref: UiRuleWidgetRef = { widget: String(w.widget) };
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

  const groups: UiRuleGroupRef[] = [];
  if (Array.isArray(raw.rule?.groups)) {
    for (const g of raw.rule.groups) {
      if (!g || !g.group) continue;
      const ref: UiRuleGroupRef = { group: String(g.group) };
      if (Array.isArray(g.presets)) ref.presets = g.presets.map(String);
      groups.push(ref);
    }
  }

  const columns: UiRuleColumnRef[] = [];
  if (Array.isArray(raw.rule?.columns)) {
    for (const c of raw.rule.columns) {
      if (!c || !c.column) continue;
      const ref: UiRuleColumnRef = { column: String(c.column) };
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
    target: String(raw.target || ""),
    view: String(raw.view || ""),
    contextViews: Array.isArray(raw.context?.views)
      ? raw.context.views.map(String)
      : [],
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

/**
 * Извлекает локальное имя виджета из строки (FQID / external) или объекта
 * { id, linkageId?, referenceId? }.
 * Возвращает null для внешних виджетов (external:*) — их не проверяем локально.
 */
function extractWidgetId(w: any): string | null {
  if (typeof w === "string") {
    if (!w) return null;
    if (w.startsWith("external:")) return null;
    const slash = w.lastIndexOf("/");
    const dot = w.lastIndexOf(".");
    const cut = Math.max(slash, dot);
    return cut >= 0 ? w.slice(cut + 1) : w;
  }
  if (w && typeof w === "object") {
    if (typeof w.id === "string") return extractWidgetId(w.id);
  }
  return null;
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
    { name: string; dataType: string }
  >();
  if (Array.isArray(raw?.entities)) {
    for (const e of raw.entities) {
      if (!e?.id) continue;
      entityNameById.set(String(e.id), String(e.name || e.id));
      if (Array.isArray(e.attributes)) {
        for (const a of e.attributes) {
          if (!a?.id) continue;
          attrByEntityAndId.set(`${e.id}#${a.id}`, {
            name: String(a.name || a.id),
            dataType: String(a.dataType || ""),
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

    const addWidget = (id: string, type: string, description: string) => {
      widgets.add(id);
      if (!seenW.has(id)) {
        seenW.add(id);
        widgetsWithType.push({
          id,
          type: type || "",
          description: description || "",
        });
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
    const addColumn = (id: string, type: string, description: string) => {
      columns.add(id);
      if (!seenC.has(id)) {
        seenC.add(id);
        columnsWithType.push({
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
          // Fallback: у attribute-виджета без description подтягиваем данные атрибута.
          if (!desc && w.type === "attribute" && w.attribute) {
            desc = buildAttributeWidgetDescription(w.attribute, nextEntityId);
          }
          addWidget(String(w.id), String(w.type || ""), desc);
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
          addColumn(
            String(c.id),
            "",
            String(c.label || c.description || "").trim(),
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
          if (!entitiesByFqid[rec.fqid]) {
            entities.push(rec);
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

    // ============ Localizations ============
    if (Array.isArray(raw.localizations)) {
      raw.localizations.forEach((loc: any) => {
        const rec = parseLocalization(loc, d.id);
        if (rec) localizations.push(rec);
      });
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
