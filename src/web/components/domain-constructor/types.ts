// ============ FieldState: наследование ============

export type FieldOrigin = "own" | "inherited" | "overridden";

export interface FieldState<T> {
  value: T;
  origin: FieldOrigin;
  /** FQID / ID источника, если origin !== 'own'. */
  from?: string;
}

// ============ Общее ============

export type YamlPath = readonly (string | number)[];

/** Уникальный ключ элемента модели. Стабилен между парсингами. */
export type ElementKey = string;

/** pathMap: elementKey → путь в YAML-документе. */
export type PathMap = Map<ElementKey, YamlPath>;

// ============ Метаданные ============

export interface Metadata {
  id: string;
  type: 'domain';
  version: string;
  name: string;
  description?: string;
  author?: string;
  status?: string;
  date?: string;
  tags?: string[];
}

// ============ Атрибут ============

export type AttributeDataType =
  | 'Uuid' | 'Timestamp' | 'Date' | 'Time' | 'TimestampRange'
  | 'String' | 'Text' | 'MAC' | 'Integer' | 'Decimal' | 'Float'
  | 'Bool' | 'Enum' | 'IpAddress' | 'CIDR' | 'Reference'
  | 'Workflow' | 'Array' | 'Table' | 'Calculation' | 'Configuration'
  | 'Variable' | 'URL' | 'Identifier' | 'Attachment' | 'Counter'
  | 'RQL' | 'Automation'
  // пользовательский тип данных — строка вида 'enumIocTypes'
  | (string & {});

export interface Constraint {
  kind: string; // 'required' | 'range' | 'length' | 'regexp' | 'size' | 'mime_types' | 'unique'
  min?: number | string;
  max?: number | string;
  regexp?: string;
  mimeTypes?: string[];
  message?: string;
}

export interface AttributeItem {
  dataType: AttributeDataType;
  entity?: string;
  constraints?: Constraint[];
}

export interface PrefixRule {
  id: string;
  attribute: string;
  source: { entity: string; key: string; value: string };
}

export interface AttributeSchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  dataType: AttributeDataType;
  constraints?: Constraint[];
  readonly?: boolean;
  // Reference
  entity?: string;
  // Array
  item?: AttributeItem;
  // Calculation
  calculation?: { schemaId: string; id: string };
  // Text
  comments?: boolean;
  // Identifier
  sequence?: string;
  template?: string;
  segment?: string[];
  defaultPrefix?: string;
  prefixRules?: PrefixRule[];
  incrementTemplate?: string;
  // Table (maxRows) — для пользовательских Table-типов, не для attribute-таблиц
  // searchable (только для атрибутов связи, но иногда всплывает)
  searchable?: boolean;
}

// ============ Сущность ============

export interface EntitySortingRule {
  id: string;
  name?: string;
  by: Array<{ attribute: string; direction: 'asc' | 'desc' }>;
  createIndex?: boolean;
}

export interface EntitySchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  label?: string | null;
  inherits?: string | null;
  kind?: 'regular' | 'abstract' | 'static';
  attributes: AttributeSchema[];
  sorting?: EntitySortingRule[];
  // Всё остальное — по мере необходимости (L2+):
  identification?: unknown[];
  reconciliation?: unknown[];
  projection?: Array<{ attribute: string }>;
  searching?: Array<{ attribute: string }>;
  icons?: string | null;
  graphView?: { iconColor: string };
  scanTarget?: boolean;
  scanTargetGroup?: boolean;
}

// ============ DataType ============

export interface EnumValue {
  id: string;
  name?: string;
  description?: string;
  hidden?: boolean;
  value?: string | number;
}

export interface WorkflowStatus {
  id: string;
  name?: string;
  description?: string;
  hidden?: boolean;
}

export interface WorkflowTransition {
  from: string;
  to: string;
}

export interface TableAttribute extends AttributeSchema {
  control?: string;
}

export interface DataTypeSchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  kind: 'Enum' | 'Table' | 'Workflow';
  // Enum
  values?: EnumValue[];
  // Workflow
  statuses?: WorkflowStatus[];
  initial?: string;
  transitions?: WorkflowTransition[];
  // Table
  attributes?: TableAttribute[];
  maxRows?: number;
  // view (общая для всех)
  view?: unknown; // L2 — раскроем, когда будем делать форму
}

// ============ Sequences ============

export interface SequenceSchema {
  path: YamlPath;
  id: string;
  startFrom: number;
  description?: string;
}

// ============ CounterColorPattern ============

export interface CounterColorPatternSchema {
  path: YamlPath;
  id: string;
  red: string;
  yellow: string;
}

// ============ Linkage ============

export interface LinkageSchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  side1: string;
  side2: string;
  type: '1_1' | '1_n' | 'n_n';
  undirected?: boolean;
  useForSearch?: boolean;
  excludeOnGraph?: boolean | 'off';
  nameFrom?: { side1?: string; side2?: string };
  attributes?: AttributeSchema[];
  view?: { iconColor?: string };
  sorting?: EntitySortingRule[];
  searching?: Array<{ attribute: string }>;
}

// ============ Action ============

export type ActionType =
  | "open_panel"
  | "open_modal"
  | "open_page"
  | "opengraphview"
  | "openboardview"
  | "open_list"
  | "open_tree"
  | "open_view"
  | "remove"
  | "bulk"
  | "tree_bulk"
  | "setattributevalue"
  | "automation"
  | "scenario"
  | "generateqrcode"
  | "copyentitylink"
  | "open_external_widget_modal";

export interface ActionSchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  type: ActionType;
  entity?: string;
  operation?: string;
  modal?: string;
  panel?: string;
  view?: string;
  page?: "blank" | "current";
  pageView?: string;
  linkage?: string;
  attribute?: string;
  join?: string;
  side?: 1 | 2;
  scenario?: string;
  workerTag?: string;
  automationId?: string;
  values?: Array<{ attribute: string; value?: unknown }>;
  defaultViewMode?: "cola" | "vertical" | "horizontal";
  contextPin?: boolean;
  widgetParams?: Record<string, unknown>;
  // остальное — L2
}

// ============ View ============

export type ViewType =
  | 'entity' | 'list' | 'tabs_list' | 'dashboard' | 'tree' | 'dashboard_tree';

export interface ViewSchema {
  path: YamlPath;
  id: string;
  label?: string;
  description?: string;
  type: ViewType;
  entity?: string;
  inherits?: string;
  source?: { type?: string; entity?: string; joins?: unknown[] };
  table?: unknown;
  actionPanel?: unknown[];
  isMixin?: boolean;
  // вложенные views/widgets/groups — L2
}

// ============ Menu / Media ============

export interface MenuSchema {
  path: YamlPath;
  id: string;
  route: string;
  label: string;
  type: 'root_group' | 'root_menu';
  placement: 'top' | 'settings';
  icon?: string;
  priority?: number;
  view?: string;
  description?: string;
  items?: Array<{
    path: YamlPath;
    id: string;
    route: string;
    label: string;
    type: 'menu';
    view: string;
    priority?: number;
    description?: string;
  }>;
}

export interface MediaSchema {
  path: YamlPath;
  id: string;
  type: 'icon_name' | 'data';
  iconName?: string;
  description?: string;
}

// ============ DataRules / UiRules / UiPresets ============

export interface DataRuleAttributeAction {
  attribute: string;
  constraint?: string; // чистый RQL
  expression?: string; // чистый RQL
  value?: unknown;
  message?: string;
  help?: string;
}

export interface DataRuleSchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  target: 'entity' | 'entityAttribute' | 'linkage';
  entity?: string;
  attribute?: string;
  linkage?: string;
  /** null = «применять всегда»; строка = чистый RQL (без !rql) */
  condition: string | null;
  effect: 'hidden' | 'readonly' | 'required' | 'default' | 'allowed';
  attributes?: DataRuleAttributeAction[];
  linkages?: unknown[]; // L2
  nested?: unknown;     // L2
  message?: string;
  help?: string;
}

export type UiRuleTarget = 'list_view' | 'entity_view' | 'entity_attribute';
export type UiRuleEffect =
  | 'hidden' | 'show' | 'hiddenEmpty' | 'readonly' | 'editable' | 'variant';

export interface UiRuleWidgetRef {
  widget: string;
  nested?: unknown;
  presets?: string[];
}
export interface UiRuleGroupRef { group: string; presets?: string[] }
export interface UiRuleColumnRef { column: string; presets?: string[] }

export interface UiRuleSchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  target: UiRuleTarget;
  view: string;
  contextViews?: string[];
  operations?: Array<'view' | 'edit' | 'create'>;
  condition: string | null;
  effect: UiRuleEffect;
  widgets?: UiRuleWidgetRef[];
  groups?: UiRuleGroupRef[];
  columns?: UiRuleColumnRef[];
  presets?: string[];
  message?: string;
  help?: string;
}

export interface UiPresetSchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  props: Record<string, string | number | boolean>;
}

// ============ Trees / Transitive ============

// ============ Trees ============

export interface TreeHierarchyChild {
  linkage: string;
  entity: string;
  side?: 1 | 2;
  maxInstances?: number;
  maxChildren?: number;
  children?: TreeHierarchyChild[];
}

export interface TreeHierarchy {
  entity: string;
  maxInstances?: number;
  maxChildren?: number;
  children?: TreeHierarchyChild[];
}

export interface TreeSortingBy {
  entity: string;
  by: Array<{ attribute: string; direction: 'asc' | 'desc' }>;
}

export interface TreeSorting {
  id: string;
  name?: string;
  by: TreeSortingBy[];
}

export interface TreeSchema {
  path: YamlPath;
  id: string;
  name?: string;
  type: 'ordinary' | 'orderable' | 'multiparent';
  maxDepth?: number;
  hierarchy: TreeHierarchy;
  sorting?: TreeSorting[];
}

// ============ TransitiveLinkages ============

export interface TransitiveLinkageJoin {
  id: string;
  linkage: string;
  side?: 1 | 2;
  search?: { enabled?: boolean; mode?: 'entity' | 'linkage' | 'both' };
  joins?: TransitiveLinkageJoin[];
}

export interface TransitiveLinkageSchema {
  path: YamlPath;
  id: string;
  entity: string;
  description?: string;
  joins: TransitiveLinkageJoin[];
}

// ============ ExchangeSettings ============

export interface ExchangeEntitySettings {
  /** Оригинальный ключ из YAML (entityId). */
  entityIdRaw: string;
  domainLabel?: string;
  enable?: boolean;
  label?: string;
  forExport?: string;
  upsertWith?: string;
  ignoreAttributes?: string;
  exportSystemAttributes?: string | string[];
  noCmsSync?: boolean;
}

// ============ Mixin ============

export interface MixinSchema {
  path: YamlPath;
  id: string;
  name?: string;
  description?: string;
  type: 'linkage' | 'view';
  weight?: number;
  useForChild?: boolean;
  // L2 — раскроем, когда будем делать формы
  linkage?: string;
  entity?: unknown;
  views?: unknown[];
}

// ============ ExchangeSettings ============

export interface ExchangeSettingsSchema {
  path: YamlPath;
  enable?: boolean;
  description?: string;
  label?: string;
  noCmsSync?: boolean;
  attributeFormats?: Record<string, string>;
  entities?: Record<string, ExchangeEntitySettings>;
}

// ============ DomainSchema (корень) ============

export interface DomainSchema {
  metadata: Metadata;
  metadataPath: YamlPath;
  entities: EntitySchema[];
  dataTypes: DataTypeSchema[];
  sequences: SequenceSchema[];
  counterColorPatterns: CounterColorPatternSchema[];
  linkages: LinkageSchema[];
  trees: TreeSchema[];
  transitiveLinkages: TransitiveLinkageSchema[];
  actions: ActionSchema[];
  views: ViewSchema[];
  menus: MenuSchema[];
  medias: MediaSchema[];
  dataRules: DataRuleSchema[];
  uiRules: UiRuleSchema[];
  uiPresets: UiPresetSchema[];
  mixins: MixinSchema[];
  exchangeSettings?: ExchangeSettingsSchema;
}