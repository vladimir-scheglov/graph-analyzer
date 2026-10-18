// ============ Атрибут сущности ============

import { LintExtension } from "./lint-types";
import { MartinReport } from "./martin-types";
import { PiiReport } from "./pii-types";

export type DataTypeKind = "base" | "custom" | "unknown";

export interface AttributeRecord {
  /** Локальный id атрибута (в рамках сущности). */
  id: string;
  /** FQID сущности-владельца: "domain.tld/entityid" (lowercase). */
  entityFqid: string;

  /** Отображаемое имя. */
  name: string;
  description: string;

  /** Имя типа данных: "String" | "Reference" | "enumIocTypes" | ... */
  dataType: string;
  /** Классификация: базовый / кастомный / неизвестный. */
  dataTypeKind: DataTypeKind;

  /** Для Array — тип элемента. */
  itemDataType?: string;
  /** Для Array<Reference> — FQID целевой сущности. */
  itemReferenceEntity?: string;
  /** Для Table — вложенные атрибуты (один уровень вглубь). */
  nestedAttributes?: AttributeRecord[];

  /** Для Reference — FQID целевой сущности. */
  referenceEntity?: string;

  /** Виды ограничений: ['required', 'length', 'regexp', ...]. */
  constraints: string[];

  /** Сколько раз атрибут упомянут в views[].widgets[].attribute. */
  usedInViews: number;
  /** Сколько раз атрибут упомянут в dataRules[]. */
  usedInRules: number;
}

// ============ Сущность ============

export interface EntityRecord {
  /** "domain.tld/entityid" — lowercase, ключ. */
  fqid: string;
  /** Домен-владелец. */
  domainId: string;
  /** Оригинальный entityId, как в схеме. */
  entityId: string;

  name: string;
  description: string;
  /** Шаблон лейбла, например "{type}: {value}". */
  label: string | null;

  /** FQID родителя (lowercase) или null. */
  inherits: string | null;

  attributes: AttributeRecord[];

  // ===== Обратные ссылки (заполняются после парсинга всех доменов) =====
  /** FQID сущностей, которые наследуют эту. */
  referencedByInheritance: string[];
  /** id linkages, где сущность участвует (в текущем домене). */
  linkedViaLinkages: string[];
  /** Домены-миксины, которые её расширяют. */
  mixinSources: string[];

  // ===== Метаданные домена-владельца =====
  domainTags: string[];
  domainVersion: string;
  domainAuthor: string;
}

// ============ Миксин ============

export interface MixinRecord {
  id: string;
  /** Домен, где объявлен миксин. */
  domainId: string;
  type: "linkage" | "view";

  /** FQID сущности, к которой применяется. */
  targetEntityFqid: string;

  /** ID view, из которого берутся компоненты (fromView). */
  sourceViewId: string;

  /** Куда применяется: панель/таб/форма/список/страница. */
  targetPanel?: string;
  targetTab?: string;
  targetForm?: string;
  targetList?: string;
  targetPage?: string;

  changeAction: "add" | "replace";

  /** Что добавляется. */
  addedTabs: string[];
  addedComponents: string[];
  addedBlocks: string[];

  description: string;
}

// ============ Кастомный тип данных ============

export interface DataTypeRecord {
  id: string;
  domainId: string;
  name: string;
  description: string;
  kind: "Enum" | "Table" | "Workflow";
  /** Для Enum. */
  valuesCount?: number;
  /** Для Workflow. */
  statusesCount?: number;
  /** Для Table. */
  attributesCount?: number;
  values?: string[]; // id'ы значений Enum
  statuses?: string[]; // id'ы статусов Workflow
  columns?: string[]; // id'ы колонок Table
}

// ============ Последовательность ============

export interface SequenceRecord {
  id: string;
  domainId: string;
  startFrom: number;
  description: string;
  /** Кто использует: ['domain.tld/entityid#attrId']. */
  usedByAttributes: string[];
}

// ============ Статистика и валидация ============

export interface ModelStats {
  entityCount: number;
  attributeCount: number;
  mixinCount: number;
  dataTypeCount: number;
  sequenceCount: number;

  /** Сущности, у которых нет ни родителей, ни наследников, ни ссылок. */
  orphanEntities: string[];
  /** FQID в цикле наследования. */
  circularInheritance: string[];
  /** Одинаковый entityId в разных доменах. */
  duplicateEntityIds: Array<{ entityId: string; domains: string[] }>;
  /** Миксины, добавляющие одни и те же вкладки в одну сущность. */
  mixinConflicts: Array<{
    targetFqid: string;
    source: string;
    conflictsWith: string[];
    addedTabs: string[];
  }>;
  /** FQID-ссылки на несуществующие сущности (inherits, Reference, mixin target). */
  unknownReferences: Array<{
    from: string;
    ref: string;
    kind:
      | "inherits"
      | "attribute-reference"
      | "array-item-reference"
      | "mixin-target"
      | "mixin-source";
  }>;
  attributesWithoutViews: Array<{
    key: string;
    entityFqid: string;
    attributeId: string;
    name: string;
    dataType: string;
  }>;

  /** Домены без собственных сущностей (только миксины, dataTypes, etc). */
  emptyDomains: string[];

  /** Сущности без собственных атрибутов (все от родителя). */
  entitiesWithoutAttributes: string[];
}

// ============ Главный индекс ============
export interface ModelOrphans {
  views: Array<{ domainId: string; id: string; type: string; entity?: string }>;
  actions: Array<{ domainId: string; id: string; name: string; type: string }>;
  dataTypes: Array<{
    domainId: string;
    id: string;
    kind: string;
    name: string;
  }>;
  sequences: Array<{ domainId: string; id: string; startFrom: number }>;
  medias: Array<{ domainId: string; id: string; iconName?: string }>;
}

export interface ModelIndex {
  generatedAt: string;

  entities: EntityRecord[];
  /** Быстрый доступ по FQID. */
  entitiesByFqid: Record<string, EntityRecord>;

  mixins: MixinRecord[];
  /** Миксины по FQID целевой сущности. */
  mixinsByEntityFqid: Record<string, MixinRecord[]>;

  dataTypes: DataTypeRecord[];
  sequences: SequenceRecord[];

  // ===== Предвычисленные обратные индексы =====
  /** parentFqid → [childFqid]. */
  entityChildrenByFqid: Record<string, string[]>;
  /** "email" (lowercase) → ["domain.tld/entityid#attrId"]. */
  attributesByNormalizedName: Record<string, string[]>;
  /** "Reference" → ["domain.tld/entityid#attrId"]. */
  attributesByDataType: Record<string, string[]>;

  stats: ModelStats;
  domains: DomainMeta[];
  entityLinkages: EntityLinkage[];
  schemasByDomain: Record<string, DomainSchemaSummary>;
  lint: LintExtension;
  orphans: ModelOrphans;
  martin: MartinReport;
  pii: PiiReport;
}

// ============ Snapshot ============

export interface SnapshotAttribute {
  id: string;
  name: string;
  dataType: string;
  referenceEntity?: string;
  itemDataType?: string;
  itemReferenceEntity?: string;
  constraints: string[];
}

export interface SnapshotEntity {
  fqid: string;
  name: string;
  inherits: string | null;
  attributes: SnapshotAttribute[];
}

export interface SnapshotMixin {
  id: string;
  domainId: string;
  targetEntityFqid: string;
  addedTabs: string[];
}

export interface SnapshotDataType {
  id: string;
  domainId: string;
  kind: string;
  valuesCount?: number;
}

export interface SnapshotSequence {
  id: string;
  domainId: string;
}

export interface ModelSnapshot {
  generatedAt: string;
  entities: SnapshotEntity[];
  mixins: SnapshotMixin[];
  dataTypes: SnapshotDataType[];
  sequences: SnapshotSequence[];
}

// ============ Semantic diff ============

export interface DiffEntityRef {
  fqid: string;
  entityId: string;
  domainId: string;
  name: string;
}

export interface DiffAttributeChange {
  id: string;
  name: string;
  changes: Record<string, { from: any; to: any }>;
}

export interface DiffEntityChange {
  fqid: string;
  entityId: string;
  domainId: string;
  name: string;
  inheritsChange?: { from: string | null; to: string | null };
  nameChange?: { from: string; to: string };
  attributesAdded: SnapshotAttribute[];
  attributesRemoved: SnapshotAttribute[];
  attributesChanged: DiffAttributeChange[];
}

export interface DiffMixinRef {
  id: string;
  domainId: string;
  targetEntityFqid: string;
}

export interface DiffDataTypeRef {
  id: string;
  domainId: string;
  kind: string;
}

export interface SemanticDiff {
  previousGeneratedAt: string;
  currentGeneratedAt: string;

  // Плоские списки (для совместимости и для фильтров)
  entities: {
    added: DiffEntityRef[];
    removed: DiffEntityRef[];
    changed: DiffEntityChange[];
  };
  mixins: { added: DiffMixinRef[]; removed: DiffMixinRef[] };
  dataTypes: { added: DiffDataTypeRef[]; removed: DiffDataTypeRef[] };
  domains: {
    added: DiffDomainRef[];
    removed: DiffDomainRef[];
    changed: DomainChange[];
  };
  /**
   * Индекс: domainId → сводка. Порядок — по убыванию totalChanges.
   * Содержит ВСЕ домены, где что-то изменилось, включая только метаданные.
   */
  byDomain: DomainChangesSummary[];
  stats: {
    entitiesAdded: number;
    entitiesRemoved: number;
    entitiesChanged: number;
    attributesAdded: number;
    attributesRemoved: number;
    attributesChanged: number;
    inheritanceChanged: number;
    mixinsAdded: number;
    mixinsRemoved: number;
    dataTypesAdded: number;
    dataTypesRemoved: number;
    domainsAdded: number;
    domainsRemoved: number;
    domainsChanged: number;
  };
}

export interface SnapshotDomain {
  id: string;
  name: string;
  version: string;
  author: string;
  tags: string[];
  description: string;
}

// В ModelSnapshot добавить:
export interface ModelSnapshot {
  generatedAt: string;
  domains: SnapshotDomain[]; // ← новое
  entities: SnapshotEntity[];
  mixins: SnapshotMixin[];
  dataTypes: SnapshotDataType[];
  sequences: SnapshotSequence[];
}

export interface DiffDomainRef {
  domainId: string;
  name: string;
  version: string;
}

export interface DomainMetadataChange {
  field: "name" | "version" | "author" | "tags" | "description";
  from: any;
  to: any;
}

export interface DomainChange {
  domainId: string;
  name: string;
  changes: DomainMetadataChange[];
}

/**
 * Сводка изменений по одному домену: используется UI для группировки.
 */
export interface DomainChangesSummary {
  domainId: string;
  name: string;
  version: string;

  metadataChanges: DomainMetadataChange[];

  entitiesAdded: DiffEntityRef[];
  entitiesRemoved: DiffEntityRef[];
  entitiesChanged: DiffEntityChange[];

  mixinsAdded: DiffMixinRef[];
  mixinsRemoved: DiffMixinRef[];

  dataTypesAdded: DiffDataTypeRef[];
  dataTypesRemoved: DiffDataTypeRef[];

  totalChanges: number;
}

export interface DomainMeta {
  id: string;
  name: string;
  version: string;
  author: string;
  tags: string[];
  description: string;
}
export interface EntityLinkage {
  id: string;
  domainId: string;
  /** FQID стороны 1 (lowercase). */
  side1Fqid: string;
  /** FQID стороны 2 (lowercase). */
  side2Fqid: string;
  name: string;
  type: string;
  /** true — связь симметричная (side1 === side2). */
  symmetric: boolean;
  /** true — ненаправленная связь (только для type: n_n). */
  undirected?: boolean;
}
export interface DomainSchemaMetadata {
  id: string;
  name: string;
  version: string;
  author: string;
  tags: string[];
  description: string;
  status?: string;
  date?: string;
}

export interface DomainSchemaEntityItem {
  id: string;
  name: string;
  attributesCount: number;
  inherits?: string | null;
}

export interface DomainSchemaLinkageItem {
  id: string;
  name: string;
  type: string;
  side1: string;
  side2: string;
  undirected: boolean;
}

export interface DomainSchemaDataTypeItem {
  id: string;
  name: string;
  kind: string;
  valuesCount?: number;
  statusesCount?: number;
  attributesCount?: number;
}

export interface DomainSchemaSequenceItem {
  id: string;
  startFrom: number;
}

export interface DomainSchemaActionItem {
  id: string;
  name: string;
  type: string;
}

export interface DomainSchemaViewItem {
  id: string;
  type: string;
  entity?: string;
  label?: string;
  isMixin?: boolean;
}

export interface DomainSchemaMenuItem {
  id: string;
  route: string;
  label: string;
  type: string;
  view?: string;
}

export interface DomainSchemaMixinItem {
  id: string;
  type: string;
  entity: string;
  viewsCount: number;
}

export interface DomainSchemaDataRuleItem {
  id: string;
  name: string;
  entity?: string;
  effect?: string;
}

export interface DomainSchemaSection<T> {
  count: number;
  items: T[];
}

export interface DomainSchemaSummary {
  domainId: string;
  metadata: DomainSchemaMetadata;
  sections: {
    entities: DomainSchemaSection<DomainSchemaEntityItem>;
    linkages: DomainSchemaSection<DomainSchemaLinkageItem>;
    dataTypes: DomainSchemaSection<DomainSchemaDataTypeItem>;
    sequences: DomainSchemaSection<DomainSchemaSequenceItem>;
    actions: DomainSchemaSection<DomainSchemaActionItem>;
    views: DomainSchemaSection<DomainSchemaViewItem>;
    menus: DomainSchemaSection<DomainSchemaMenuItem>;
    mixins: DomainSchemaSection<DomainSchemaMixinItem>;
    dataRules: DomainSchemaSection<DomainSchemaDataRuleItem>;
    medias: DomainSchemaSection<{
      id: string;
      type: string;
      iconName?: string;
    }>;
  };
  flags: {
    hasExchangeSettings: boolean;
    hasCounterColorPattern: boolean;
  };
}