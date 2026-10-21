// ============ Атрибут сущности ============

import { LintExtension } from "./lint-types";
import { MartinReport } from "./martin-types";
import { PiiReport } from "./pii-types";

export type DataTypeKind = "base" | "custom" | "unknown";

// ============ Generic sections (dataRules, uiRules, views, …) ============

export interface GenericSnapshotEntry {
  id: string;
  domainId: string;
  /** FNV-1a hash от JSON.stringify(rawItem) — для диффа. */
  hash: string;
  /** Для UI. */
  label?: string;
  /** Для UI (type/kind/target). */
  type?: string;
}

export interface GenericDiffEntry {
  id: string;
  domainId: string;
  label?: string;
  type?: string;
}

export interface GenericSectionDiff {
  added: GenericDiffEntry[];
  removed: GenericDiffEntry[];
  changed: GenericDiffEntry[];
}

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

  /** readonly (в схеме) */
  readonly?: boolean;
  /** searchable (по умолчанию true; только для linkage-атрибутов) */
  searchable?: boolean;
  /** Для Calculation — обязательные schemaId/id. */
  calculation?: { schemaId: string; id: string };
  /** Для Text — разрешить комментарии. */
  comments?: boolean;
  /** Для Table — максимальное число строк. */
  maxRows?: number;
  /** Для Array<...> — constraint-виды элемента. */
  itemConstraints?: string[];

  /** Для Identifier — сегментированный идентификатор. */
  template?: string;
  segment?: string[];
  defaultPrefix?: string;
  prefixRules?: PrefixRuleRecord[];
  incrementTemplate?: string;
  /** Для Identifier — несегментированный (FQID sequences[]). */
  sequence?: string;
}

export interface PrefixRuleRecord {
  id: string;
  attribute: string;
  source: { entity: string; key: string; value: string };
}

// ============ Сущность ============

export interface EntitySortingRecord {
  id: string;
  by: Array<{ attribute: string; direction: "asc" | "desc" }>;
}

export interface EntityIdentificationRule {
  attribute?: string;
  and?: EntityIdentificationRule[];
  or?: EntityIdentificationRule[];
}

export interface EntityIdentificationRecord {
  id: string;
  rule: EntityIdentificationRule[];
  filter?: string[];
}

export interface EntityReconciliationRecord {
  attribute?: string;
  sourcePriority?: string[];
  default?: string[];
  mergeStrategy?: string;
}

export interface EntityBindRecord {
  external: string;
  internal: string;
  aliases?: Array<{ external: string; internal: string }>;
}

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

  sorting?: EntitySortingRecord[];
  identification?: EntityIdentificationRecord[];
  reconciliation?: EntityReconciliationRecord[];
  projection?: Array<{ attribute: string }>;
  searching?: Array<{ attribute: string }>;
  treeNode?: { types: Array<{ type: string; of?: string[] }> };
  externals?: { entities: string[]; type: "composition" | "selection" };
  elementOf?: string | null;
  extends?: string | null;
  partOf?: string | null;
  bind?: EntityBindRecord;
  overrides?: Array<{
    ancestors: string[];
    attributes: Array<{ attribute: string; value?: any }>;
  }>;
  scanTarget?: boolean;
  scanTargetGroup?: boolean;
  createZeroRecord?: boolean;
  icons?: string | null;
  graphView?: { iconColor: string };
  kind?: "regular" | "abstract" | "static";
}

// ============ Миксин ============

export interface MixinRecord {
  id: string;
  /** Домен, где объявлен миксин. */
  domainId: string;
  type: "linkage" | "view";

  /** FQID сущности, к которой применяется. */
  targetEntityFqid: string;

  /** Для type: "linkage" — FQID источника (entity.from). */
  sourceEntityFqid?: string;
  /** Для type: "linkage" — FQID связи, на основе которой строится примесь. */
  linkageFqid?: string;

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
  /** Наследовать примесь дочерним сущностям (по умолчанию true). */
  useForChild: boolean;
  /** Показывать историю примешанного объекта в целевом (по умолчанию false). */
  showMixinInHistory: boolean;
  /** Приоритет примеси (меньше — выше). undefined = «наименьший». */
  weight?: number;

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

// ============ Сценарии (playbooks / scripts) ============

export interface ScenarioActionRef {
  domainId: string;
  actionId: string;
  actionName: string;
  workerTag?: string;
}

export interface ScenarioRecord {
  id: string;
  /** Экшены (во всех доменах), которые запускают этот сценарий. */
  actions: ScenarioActionRef[];
  /** Домены, в которых используется. */
  domains: string[];
}

// ============ UI Rules ============

export type UiRuleTarget = "list_view" | "entity_view" | "entity_attribute";

export type UiRuleEffect =
  | "hidden"
  | "show"
  | "hiddenEmpty"
  | "readonly"
  | "editable"
  | "inherit"
  | "variant";

export interface UiRuleNested {
  type: "array" | "table";
  attributes?: string[];
  items?: string[];
}

export interface UiRuleWidgetRef {
  widget: string;
  nested?: UiRuleNested;
  presets?: string[];
}

export interface UiRuleGroupRef {
  group: string;
  presets?: string[];
}

export interface UiRuleColumnRef {
  column: string;
  presets?: string[];
}

export interface UiRuleRecord {
  id: string;
  domainId: string;
  name: string;
  description: string;
  target: UiRuleTarget | string;
  view: string;
  contextViews: string[];
  /** Контекст данных правила (entity | linkage). */
  contextData?: {
    type: "entity" | "linkage";
    entity?: string;
    linkage?: string;
  };
  condition: string;
  effect: UiRuleEffect | string;
  widgets: UiRuleWidgetRef[];
  groups: UiRuleGroupRef[];
  columns: UiRuleColumnRef[];
  presets: string[];
  message: string;
  help: string;
}

export interface UiPresetRecord {
  id: string;
  domainId: string;
  name: string;
  description: string;
  props: Record<string, string | number | boolean>;
}

export type UiRuleOperation = "view" | "edit" | "create";

export interface UiRuleRecord {
  id: string;
  domainId: string;
  name: string;
  description: string;
  target: UiRuleTarget | string;
  view: string;
  contextViews: string[];

  /** Операции, в которых применяется правило (modal/page). Пусто = везде. */
  operations?: UiRuleOperation[];

  contextData?: {
    type: "entity" | "linkage";
    entity?: string;
    linkage?: string;
  };
  condition: string;
  effect: UiRuleEffect | string;
  widgets: UiRuleWidgetRef[];
  groups: UiRuleGroupRef[];
  columns: UiRuleColumnRef[];
  presets: string[];
  message: string;
  help: string;
}

// ============ Элементы view (для валидации UI Rules) ============

export interface ViewElementsRecord {
  widgets: string[];
  groups: string[];
  columns: string[];
}

// ============ Статистика и валидация ============

export interface ModelStats {
  entityCount: number;
  attributeCount: number;
  mixinCount: number;
  dataTypeCount: number;
  sequenceCount: number;
  scenarioCount: number;
  uiRuleCount: number;
  uiPresetCount: number;

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
  /** Атрибуты, не упомянутые ни в views, ни в dataRules (мёртвый код). */
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

// ============ Плоские мета-записи view-структуры ============

export interface ViewGroupRecord {
  id: string;
  domainId: string;
  /** id top-level view, в которой объявлена группа (включая вложенные). */
  parentViewId: string;
  type: string;
}

export interface ViewWidgetRecord {
  id: string;
  domainId: string;
  parentViewId: string;
  type: string;
  controlType?: string;
  attribute?: string;
}

export interface ViewActionPanelRecord {
  id: string;
  domainId: string;
  viewId: string;
  widget: string;
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
  scenarios: ScenarioRecord[];
  scenariosById: Record<string, ScenarioRecord>;
  uiRules: UiRuleRecord[];
  uiRulesById: Record<string, UiRuleRecord>;
  uiPresets: UiPresetRecord[];
  uiPresetsByDomain: Record<string, string[]>;
  viewElementsByDomain: Record<string, Record<string, ViewElementsRecord>>;

  /** Правила данных (dataRules). */
  dataRules: DataRuleRecord[];
  dataRulesById: Record<string, DataRuleRecord>;
  /** Деревья связей (trees). */
  trees: TreeRecord[];
  /** Транзитивные связи (transitiveLinkages). */
  transitiveLinkages: TransitiveLinkageRecord[];
  /** Меню домена (menus, только root-уровень). */
  menus: MenuRecord[];
  /** Иконки (medias). */
  medias: MediaRecord[];

  permissions: PermissionRecord[];
  accessRules: AccessRuleRecord[];
  localizations: LocalizationRecord[];

  /** Условия окраски счётчиков (counterColorPatterns). */
  counterColorPatterns: CounterColorPatternRecord[];
  /** Быстрый lookup: domainId → Set<id>. */
  counterColorPatternsByDomain: Record<string, string[]>;

  /**
   * Минимальные снимки прочих секций YAML (dataRules, uiRules, uiPresets,
   * views, menus, medias, trees, transitiveLinkages, permissions, localizations)
   * для semantic-diff.
   */
  genericSections: Record<string, GenericSnapshotEntry[]>;

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
  actions: ActionRecord[];
  actionsById: Record<string, ActionRecord>;
  /** PR 6: все группы всех view домена. */
  viewGroups: ViewGroupRecord[];
  /** PR 6: все виджеты всех view домена. */
  viewWidgets: ViewWidgetRecord[];
  /** PR 6: все ссылки actionPanel[].widget. */
  viewActionPanels: ViewActionPanelRecord[];
  /** PR 6b: все колонки всех table-представлений домена. */
  viewColumns: ViewColumnRecord[];
  /** PR 6c: filter-конфиги table-представлений. */
  viewTableFilters: ViewTableFilterRecord[];
  /** PR 6c: sortingBy-конфиги table-представлений. */
  viewTableSortings: ViewTableSortingRecord[];
  /** PR 6d: paging-конфиги table-представлений. */
  viewTablePagings: ViewTablePagingRecord[];
  /** PR 6d: actions[] таблицы (row_click и т.п.). */
  viewTableActions: ViewTableActionRecord[];
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

  /**
   * Опционально: старые снапшоты (до апгрейда) этого поля не имеют.
   * При первом запуске новой версии все записи будут помечены как `added`.
   */
  genericSections?: Record<string, GenericSnapshotEntry[]>;
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
  /**
   * Diff по прочим секциям. Ключ — sectionKey (dataRules, uiRules, …).
   * Секции с пустым diff не включаются.
   */
  genericSections?: Record<string, GenericSectionDiff>;
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
    /** Суммарные счётчики по genericSections (для hasAnyChanges). */
    genericAdded?: number;
    genericRemoved?: number;
    genericChanged?: number;
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

  /** Diff по generic-секциям в разрезе домена. */
  generic?: Record<string, GenericSectionDiff>;

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

  /** Атрибуты связи (свои). */
  attributes?: AttributeRecord[];
  /** searching-атрибуты связи. */
  searching?: Array<{ attribute: string }>;
  sorting?: EntitySortingRecord[];
  nameFrom?: { side1?: string; side2?: string };
  view?: { iconColor?: string };
  excludeOnGraph?: boolean | "off";
  useForSearch?: boolean;
  /** auto-only, если заданы — ругаемся. */
  side1Descendants?: string[];
  side2Descendants?: string[];
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
  sourceEntity?: string;
  tree?: string;
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

export interface DomainSchemaScenarioActionItem {
  domainId: string;
  actionId: string;
  actionName: string;
  workerTag?: string;
}

export interface DomainSchemaScenarioItem {
  id: string;
  actionsCount: number;
  domainsCount: number;
  actions: DomainSchemaScenarioActionItem[];
}

export interface DomainSchemaSection<T> {
  count: number;
  items: T[];
}

export interface DomainSchemaTreeNode {
  id: string;
  name: string;
  type: string;
  maxDepth?: number;
  rootEntity?: string;
}

export interface DomainSchemaTransitiveItem {
  id: string;
  name: string;
  entity?: string;
  joinsCount: number;
}

export interface DomainSchemaUiRuleItem {
  id: string;
  name: string;
  target: string;
  view?: string;
  effect?: string;
  operations?: string[];
}

export interface DomainSchemaUiPresetItem {
  id: string;
  name: string;
  description: string;
}

export interface DomainSchemaCounterColorItem {
  id: string;
  red: string;
  yellow: string;
}

export interface DomainSchemaAllViewItem {
  id: string;
  /** 'entity' | 'list' | 'tree' | 'tabs_list' | 'dashboard' | 'dashboard_tree'
   *  | 'panel' | 'modal' | 'page' */
  type: string;
  /** Для nested: id top-level view-родителя. */
  parentViewId?: string;
  /** Сущность, к которой относится view (если задана). */
  entity?: string;

  /** PR 6 — для nested modal: id группы-формы. */
  form?: string;
  /** PR 6 — для nested page: id блока (взаимоисключение с tabs). */
  block?: string;
  /** PR 6 — для nested page: id вкладок. */
  tabs?: string[];
  /** PR 6 — для nested page: pinnedView.block. */
  pinnedBlock?: string;

  /** PR 6 — для top-level list: source.entity. */
  sourceEntity?: string;
  /** PR 6 — для list/page/tree: id виджетов из actionPanel. */
  actionPanelWidgets?: string[];
}

export interface DomainSchemaPermissionItem {
  id: string;
  name?: string;
  description?: string;
}

export interface DomainSchemaAccessRuleItem {
  /** Синтетический id вида `accessRules[0]` — у accessRules своего id нет. */
  id: string;
  target: string;
  entity?: string;
  linkage?: string;
  actionId?: string;
}

export interface DomainSchemaLocalizationItem {
  /** Совпадает с language. */
  id: string;
  language: string;
  keysCount: number;
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
    trees: DomainSchemaSection<DomainSchemaTreeNode>;
    transitiveLinkages: DomainSchemaSection<DomainSchemaTransitiveItem>;
    uiRules: DomainSchemaSection<DomainSchemaUiRuleItem>;
    uiPresets: DomainSchemaSection<DomainSchemaUiPresetItem>;
    counterColorPattern: DomainSchemaSection<DomainSchemaCounterColorItem>;
    scenarios: DomainSchemaSection<DomainSchemaScenarioItem>;
    permissions: DomainSchemaSection<DomainSchemaPermissionItem>;
    accessRules: DomainSchemaSection<DomainSchemaAccessRuleItem>;
    localizations: DomainSchemaSection<DomainSchemaLocalizationItem>;
  };
  flags: {
    hasExchangeSettings: boolean;
    hasCounterColorPattern: boolean;
  };
  allViews?: DomainSchemaAllViewItem[];
}

export type SectionKey = keyof DomainSchemaSummary["sections"];

export interface ViewElementRef {
  id: string;
  type: string;
  description?: string;
  counterColorPattern?: string;
  attributeDataType?: string;
  attributeNestedColumns?: string[];
  attribute?: string;
  controlType?: string;
}

export interface ViewElementsRecord {
  widgets: string[];
  groups: string[];
  columns: string[];
  /** id + type — для точной фильтрации в автокомплите. */
  widgetsWithType?: ViewElementRef[];
  groupsWithType?: ViewElementRef[];
  columnsWithType?: ViewElementRef[];
}

// ============ DataRules ============

export type DataRuleTarget = "entity" | "entityAttribute" | "linkage";
export type DataRuleEffect =
  | "hidden"
  | "readonly"
  | "required"
  | "default"
  | "allowed";

export interface DataRuleAttributeAction {
  attribute: string;
  constraint?: string;
  expression?: string;
  value?: any;
  message?: string;
  help?: string;
}

export interface DataRuleLinkageAction {
  linkage: string;
  side?: 1 | 2;
  constraint?: string;
  expression?: string;
  min_count?: number;
  max_count?: number;
  message?: string;
  help?: string;
}

export interface DataRuleNestedAttribute {
  attribute: string;
  constraint?: string;
  expression?: string;
  value?: any;
  message?: string;
  help?: string;
}

export interface DataRuleNestedItem {
  item: number | "*";
  constraint?: string;
  expression?: string;
  value?: any;
  message?: string;
  help?: string;
}

export type DataRuleNested =
  | { type: "table"; attributes: DataRuleNestedAttribute[] }
  | { type: "array"; items: DataRuleNestedItem[] };

export interface DataRuleRecord {
  id: string;
  domainId: string;
  name: string;
  description: string;
  target: DataRuleTarget;
  /** FQID сущности для target: entity / entityAttribute. */
  entity?: string;
  /** Локальный id attribute-таблицы (для target: entityAttribute). */
  attribute?: string;
  /** FQID связи для target: linkage. */
  linkage?: string;
  /** true → «применять всегда», иначе RQL-строка. */
  condition: string | boolean;
  effect: DataRuleEffect;
  attributes?: DataRuleAttributeAction[];
  linkages?: DataRuleLinkageAction[];
  nested?: DataRuleNested;
  message?: string;
  help?: string;
}

// ============ Trees ============

export interface TreeHierarchyChild {
  linkage: string;
  entity: string;
  side?: 1 | 2;
  maxInstances?: number;
  maxChildren?: number;
  children?: TreeHierarchyChild[];
}

export interface TreeSortingBy {
  entity: string;
  by: Array<{ attribute: string; direction: "asc" | "desc" }>;
}

export interface TreeSortingRecord {
  id: string;
  name?: string;
  by: TreeSortingBy[];
}

export interface TreeRecord {
  id: string;
  domainId: string;
  name?: string;
  type: "ordinary" | "orderable" | "multiparent";
  maxDepth?: number;
  hierarchy: {
    entity: string;
    maxInstances?: number;
    maxChildren?: number;
    children?: TreeHierarchyChild[];
  };
  sorting?: TreeSortingRecord[];
}

// ============ TransitiveLinkages ============

export interface TransitiveLinkageJoin {
  id: string;
  linkage: string;
  side?: 1 | 2;
  search?: { enabled?: boolean; mode?: "entity" | "linkage" | "both" };
  joins?: TransitiveLinkageJoin[];
}

export interface TransitiveLinkageRecord {
  id: string;
  domainId: string;
  entity: string;
  description: string;
  joins: TransitiveLinkageJoin[];
}

// ============ Menus ============

export interface MenuItemRecord {
  id: string;
  route: string;
  label: string;
  type: "menu";
  view: string;
  priority?: number;
}

export interface MenuRecord {
  id: string;
  domainId: string;
  type: "root_group" | "root_menu";
  route: string;
  label: string;
  icon?: string;
  placement: "top" | "settings";
  priority?: number;
  /** Только для root_menu. */
  view?: string;
  /** Только для root_group. */
  items?: MenuItemRecord[];
  defaultItem?: string;
  description?: string;
}

// ============ Medias ============

export interface MediaRecord {
  id: string;
  domainId: string;
  type: "icon_name" | "data";
  iconName?: string;
  data?: string;
  description: string;
}

// ============ Permissions ============

export interface PermissionRecord {
  id: string;
  domainId: string;
  name?: string;
  description?: string;
}

// ============ AccessRules ============

export type AccessRuleTarget =
  | "entity"
  | "action"
  | "linkage"
  | "any_entity"
  | "any_action"
  | "any_linkage";

export type AccessRuleScope = "create" | "delete" | "edit" | "view" | "launch";

export interface AccessRuleException {
  attribute: string;
  condition?: string | boolean;
}

export type AccessRuleItemKind = "permission" | "pass" | "condition";

export interface AccessRuleItem {
  kind: AccessRuleItemKind;
  /** Для kind: permission. */
  permission?: string;
  /** Для kind: condition. */
  condition?: string | boolean;
  /** Для permission/pass/condition. */
  except?: AccessRuleException[];
}

export interface AccessRuleRecord {
  domainId: string;
  target: AccessRuleTarget;
  /** Для target: entity (FQID). */
  entity?: string;
  /** Для target: linkage (FQID). */
  linkage?: string;
  /** Для target: action — id и name встроенного действия из Zod
   *  (`{target:"action"}.merge(Action)`). Парсим, но не валидируем как ref. */
  actionId?: string;
  /** Правила по scope; только те, что заданы. */
  create?: AccessRuleItem[];
  delete?: AccessRuleItem[];
  edit?: AccessRuleItem[];
  view?: AccessRuleItem[];
  launch?: AccessRuleItem[];
}

// ============ Localizations ============

export interface LocalizationKeyRecord {
  key: string;
  to: string;
  ordinal?: {
    zero?: string;
    one?: string;
    two?: string;
    few?: string;
    many?: string;
    other?: string;
  };
}

export interface LocalizationRecord {
  domainId: string;
  language: string;
  keys: LocalizationKeyRecord[];
}

// ============ CounterColorPatterns ============

export interface CounterColorPatternRecord {
  id: string;
  domainId: string;
  red: string;
  yellow: string;
}

// ============ Actions ============

export interface ActionValueRecord {
  attribute: string;
  value?: any;
}

export interface ActionBulkAttributeUse {
  attribute: string;
}

export interface ActionBulkLinkageUse {
  widget: string;
}

export interface ActionBulkSettings {
  /** FQID (lowercase). */
  entity?: string;
  attributes?: {
    type: "specific" | "all";
    use?: ActionBulkAttributeUse[];
  };
  linkages?: {
    type: "specific";
    use?: ActionBulkLinkageUse[];
  };
}

export interface ActionRecord {
  id: string;
  domainId: string;
  name: string;
  description: string;
  type: string;

  /** FQID (lowercase) — общий для всех типов, где указана сущность. */
  entity?: string;

  /** Для open_modal. */
  modal?: string;
  /** Для open_panel. */
  panel?: string;
  /** Для open_page / open_list / open_tree / open_view / open_board_view. */
  view?: string;
  /** create | edit | view | remove | edit_attribute | import | export. */
  operation?: string;
  contextPin?: boolean;
  /** Для open_list — транзитивная связь. */
  join?: string;
  /** Для open_list — связь. */
  linkage?: string;
  /** Для open_list — сторона связи. */
  side?: 1 | 2;
  /** blank | current. */
  page?: "blank" | "current";

  /** Для automation. */
  automationId?: string;
  /** Для scenario. */
  scenario?: string;
  /** Для scenario — worker tag. */
  workerTag?: string;

  /** Для set_attribute_value. */
  values?: ActionValueRecord[];

  /** Для tree_bulk. */
  bulkSettings?: ActionBulkSettings[];

  /** Для open_graph_view — переход к доскам. */
  openBoards?: boolean;
  openBoardsName?: string;

  /** Для open_list — атрибут-ссылка. */
  attribute?: string;
  /** Для open_list — виджет-ссылка. */
  widgetId?: string;
}

// ============ PR 6c: filter / sortingBy ============

export interface ViewTableFilterAttribute {
  /** id колонки-атрибута (attribute из use[]). */
  attribute: string;
}

export interface ViewTableFilterLinkage {
  /** FQID (lowercase) — нормализован. */
  linkage?: string;
  /** id транзитивной связи (join). */
  join?: string;
  /** Атрибуты связи. */
  linkAttributes?: string[];
  /** Атрибуты связанной сущности. */
  linkedEntity?: string[];
}

export interface ViewTableFilterRecord {
  domainId: string;
  viewId: string;
  /** Только то, что явно перечислено (type: specific). */
  attributes: ViewTableFilterAttribute[];
  linkages: ViewTableFilterLinkage[];
}

export interface ViewTableSortingColumn {
  column: string;
  sorting: string;
}

export interface ViewTableSortingRecord {
  domainId: string;
  viewId: string;
  columns: ViewTableSortingColumn[];
  /** Сортировка по умолчанию. */
  defaultColumn?: string;
  defaultDirection?: "asc" | "desc";
}

export interface ViewTablePagingRecord {
  domainId: string;
  viewId: string;
  /** sizes[] как пришли — для проверки типа. */
  rawSizes: any[];
  /** sizes[], приведённые к number (только валидные). */
  sizes: number[];
  /** defaultSize как пришло. */
  rawDefaultSize?: any;
  /** defaultSize как number (только если валидно). */
  defaultSize?: number;
}

export interface ViewTableActionItemRef {
  action: string;
  label?: string;
  icon?: string;
}

export interface ViewTableActionRecord {
  domainId: string;
  viewId: string;
  /** row_click | row_double_click | row_context_menu */
  type: string;
  /** Для row_click / row_double_click. */
  action?: string;
  /** Для row_context_menu. */
  items: ViewTableActionItemRef[];
}

export interface ViewColumnRecord {
  id: string;
  domainId: string;
  /** id top-level view (list / tree / entity). */
  viewId: string;
  /** attribute / join / linkageAttribute — как в zod-колонке. */
  attribute?: string;
  join?: string;
  linkageAttribute?: string;
  /** control.type — нужен для tree_path. */
  controlType?: string;
  /** control.tree — id дерева (для tree_path). */
  controlTree?: string;
}