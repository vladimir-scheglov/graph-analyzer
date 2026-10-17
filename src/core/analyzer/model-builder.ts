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
} from "../../shared/model-types";
import { buildDomainSchemaSummary } from "./domain-schema";
import type { DomainSchemaSummary } from "../../shared/model-types";
import { lintModel, computeSonarScores } from "./linter";
import { detectOrphans } from "./orphans";
import { computeMartinReport } from "./martin-metrics";
import { detectPii } from "./pii-detector";

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

  // Reference
  if (dataType === "Reference" && raw.entity) {
    const ref = normalizeFqid(String(raw.entity), domainId);
    if (ref) record.referenceEntity = ref;
  }

  // Array
  if (dataType === "Array" && raw.item && typeof raw.item === "object") {
    record.itemDataType = String(raw.item.dataType || "");
    if (raw.item.dataType === "Reference" && raw.item.entity) {
      const ref = normalizeFqid(String(raw.item.entity), domainId);
      if (ref) record.itemReferenceEntity = ref;
    }
  }

  // Table — один уровень вглубь
  if (dataType === "Table" && Array.isArray(raw.attributes)) {
    record.nestedAttributes = raw.attributes
      .map((a: any) =>
        parseAttribute(a, entityFqid, domainId, customDataTypeIds),
      )
      .filter((x: AttributeRecord | null): x is AttributeRecord => x !== null);
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

  return {
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
    if (!m || !m.id || !m.entity) return;

    const targetEntityFqid = normalizeFqid(m.entity, domainId);
    if (!targetEntityFqid) return;

    const views = Array.isArray(m.views) ? m.views : [{}];

    views.forEach((v: any, idx: number) => {
      if (!v || typeof v !== "object") return;
      const change = v.change || {};
      const add = change.add || {};
      const replace = change.replace || {};

      const { tabs, components, blocks } = extractMixinAdditions(add);

      const record: MixinRecord = {
        id: views.length > 1 ? `${m.id}_${idx}` : String(m.id),
        domainId,
        type: m.type === "linkage" ? "linkage" : "view",
        targetEntityFqid,
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
  // Строим map: attributeId → [entityFqid, ...] — куда накапливать
  const attrIndex = new Map<string, AttributeRecord[]>();
  entities.forEach((e) => {
    e.attributes.forEach((a) => {
      const key = attrKey(e.fqid, a.id);
      if (!attrIndex.has(key)) attrIndex.set(key, []);
      attrIndex.get(key)!.push(a);
    });
  });

  // Обходим views[].widgets[] всех доменов и считаем
  rawDomainsById.forEach((domain) => {
    const views = domain.rawData?.views;
    if (!Array.isArray(views)) return;

    function visitWidgets(widgets: any[]): void {
      if (!Array.isArray(widgets)) return;
      widgets.forEach((w: any) => {
        if (!w || typeof w !== "object") return;
        const attrId = w.attribute;
        if (typeof attrId !== "string") return;

        // Ищем, какая сущность является владельцем этого виджета.
        // Проблема: виджет может ссылаться на атрибут родителя через FQID.
        // Простая эвристика: ищем атрибут с таким id в целевой сущности представления.
        // Полноценный резолвинг — отдельная задача.
        // Здесь мы просто инкрементируем всем атрибутам с таким id внутри того же домена.
        attrIndex.forEach((attrs, key) => {
          attrs.forEach((a) => {
            if (a.id === attrId && a.entityFqid.startsWith(domain.id + "/")) {
              a.usedInViews++;
            }
          });
        });
      });
    }

    views.forEach((v: any) => {
      if (!v) return;
      visitWidgets(v.widgets);
    });
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
  // Мы уже считаем usedInViews в countAttributeUsage — теперь собираем те, у кого 0.
  const attributesWithoutViews: ModelStats["attributesWithoutViews"] = [];
  entities.forEach((e) => {
    const visit = (a: AttributeRecord) => {
      if (a.usedInViews === 0) {
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

function parseEntityLinkages(domainId: string, raw: any): EntityLinkage[] {
  if (!raw || !Array.isArray(raw.linkages)) return [];
  const result: EntityLinkage[] = [];

  for (const l of raw.linkages) {
    if (!l || !l.id) continue;
    if (!l.side1 || !l.side2) continue;

    const side1Fqid = normalizeFqid(l.side1, domainId);
    const side2Fqid = normalizeFqid(l.side2, domainId);
    if (!side1Fqid || !side2Fqid) continue;

    result.push({
      id: String(l.id),
      domainId,
      side1Fqid,
      side2Fqid,
      name: String(l.name || l.id),
      type: String(l.type || "n_n"),
      symmetric: side1Fqid === side2Fqid,
    });
  }

  return result;
}

// ============ Главная функция ============

export function buildModelIndex(rawDomains: RawDomainEntry[]): ModelIndex {
  const rawDomainsById = new Map<string, RawDomainEntry>();
  rawDomains.forEach((d) => rawDomainsById.set(d.id, d));

  const entities: EntityRecord[] = [];
  const entitiesByFqid: Record<string, EntityRecord> = {};
  const mixins: MixinRecord[] = [];
  const dataTypes: DataTypeRecord[] = [];
  const sequences: SequenceRecord[] = [];
  const schemasByDomain: Record<string, DomainSchemaSummary> = {};

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

    // Mixins
    if (Array.isArray(raw.mixins)) {
      const parsed = parseMixins(d.id, raw.mixins);
      mixins.push(...parsed);
    }

    schemasByDomain[d.id] = buildDomainSchemaSummary(d.id, raw);
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

  // Stats
  const stats = computeStats(
    entities,
    mixins,
    entitiesByFqid,
    entityChildrenByFqid,
    mixinsByEntityFqid,
    dataTypes,
    sequences,
    rawDomains.map((d) => d.id),
    rawDomains,
  );

  const entityLinkages: EntityLinkage[] = [];
  const domains: DomainMeta[] = rawDomains.map((d) => {
    entityLinkages.push(...parseEntityLinkages(d.id, d.rawData));

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
    schemasByDomain,
    entityChildrenByFqid,
    attributesByNormalizedName,
    attributesByDataType,
    stats,
  } as ModelIndex;

  const lintReport = lintModel(partialIndex);
  const sonar = computeSonarScores(partialIndex, lintReport);
  const martin = computeMartinReport(partialIndex);
  const pii = detectPii(partialIndex);

  return {
    ...partialIndex,
    orphans,
    martin,
    pii,
    lint: { lintReport, sonar },
  };
}
