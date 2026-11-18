import { YamlDocument, getRql, type YamlPath } from "./document";
import type {
  DomainSchema,
  Metadata,
  EntitySchema,
  AttributeSchema,
  Constraint,
  EntitySortingRule,
  DataTypeSchema,
  SequenceSchema,
  CounterColorPatternSchema,
  LinkageSchema,
  ActionSchema,
  ViewSchema,
  MenuSchema,
  MediaSchema,
  DataRuleSchema,
  UiRuleSchema,
  UiPresetSchema,
  MixinSchema,
  ElementKey,
  PathMap,
  TreeSchema,
  TreeHierarchy,
  TreeHierarchyChild,
  TreeSorting,
  TransitiveLinkageSchema,
  TransitiveLinkageJoin,
  ExchangeSettingsSchema,
  ExchangeEntitySettings,
} from "../types";

// ============ Публичный API ============

export interface ParsedDomain {
  schema: DomainSchema;
  pathMap: PathMap;
  /** Ошибки структуры (не YAML): например, entities[3] без id. */
  structuralErrors: Array<{ key: string; message: string }>;
}

export function parseDomainSchema(doc: YamlDocument): ParsedDomain {
  const pathMap: PathMap = new Map();
  const structuralErrors: Array<{ key: string; message: string }> = [];

  const get = <T = unknown>(path: YamlPath): T | undefined =>
    doc.get(path) as T | undefined;

  const arr = <T>(path: YamlPath): T[] => {
    const v = get<T[]>(path);
    return Array.isArray(v) ? v : [];
  };

  // ---- Метаданные ----
  const metadataPath: YamlPath = [];
  const metadata = parseMetadata(get);
  if (!metadata) {
    structuralErrors.push({
      key: "metadata",
      message: "Отсутствует id / type / version",
    });
  }

  // ---- Сущности ----
  const entities: EntitySchema[] = [];
  arr<unknown>(["entities"]).forEach((_, i) => {
    const path: YamlPath = ["entities", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") {
      structuralErrors.push({
        key: `entity@${i}`,
        message: `entities[${i}] без id`,
      });
      return;
    }
    const entity = parseEntity(raw, path, pathMap);
    entities.push(entity);
  });

  // ---- DataTypes ----
  const dataTypes: DataTypeSchema[] = [];
  arr<unknown>(["dataTypes"]).forEach((_, i) => {
    const path: YamlPath = ["dataTypes", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    dataTypes.push(parseDataType(raw, path, pathMap));
  });

  // ---- Sequences ----
  const sequences: SequenceSchema[] = [];
  arr<unknown>(["sequences"]).forEach((_, i) => {
    const path: YamlPath = ["sequences", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    sequences.push({
      path,
      id: raw.id,
      startFrom: typeof raw.startFrom === "number" ? raw.startFrom : 1,
      description: str(raw.description),
    });
    pathMap.set(`sequence:${raw.id}`, path);
  });

  // ---- CounterColorPattern (YAML-ключ без 's') ----
  const counterColorPatterns: CounterColorPatternSchema[] = [];
  arr<unknown>(["counterColorPattern"]).forEach((_, i) => {
    const path: YamlPath = ["counterColorPattern", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    counterColorPatterns.push({
      path,
      id: raw.id,
      red: str(raw.red) ?? "",
      yellow: str(raw.yellow) ?? "",
    });
    pathMap.set(`counterColorPattern:${raw.id}`, path);
  });

  // ---- Linkages ----
  const linkages: LinkageSchema[] = [];
  arr<unknown>(["linkages"]).forEach((_, i) => {
    const path: YamlPath = ["linkages", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    linkages.push(parseLinkage(raw, path, pathMap));
  });

  // ---- Actions ----
  const actions: ActionSchema[] = [];
  arr<unknown>(["actions"]).forEach((_, i) => {
    const path: YamlPath = ["actions", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    actions.push(parseAction(raw, path, pathMap));
  });

  // ---- Views ----
  const views: ViewSchema[] = [];
  arr<unknown>(["views"]).forEach((_, i) => {
    const path: YamlPath = ["views", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    views.push(parseView(raw, path, pathMap));
  });

  // ---- Menus ----
  const menus: MenuSchema[] = [];
  arr<unknown>(["menus"]).forEach((_, i) => {
    const path: YamlPath = ["menus", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    menus.push(parseMenu(raw, path, pathMap));
  });

  // ---- Medias ----
  const medias: MediaSchema[] = [];
  arr<unknown>(["medias"]).forEach((_, i) => {
    const path: YamlPath = ["medias", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    medias.push({
      path,
      id: raw.id,
      type: raw.type === "data" ? "data" : "icon_name",
      iconName: str(raw.iconName),
      description: str(raw.description),
    });
    pathMap.set(`media:${raw.id}`, path);
  });

  // ---- DataRules ----
  const dataRules: DataRuleSchema[] = [];
  arr<unknown>(["dataRules"]).forEach((_, i) => {
    const path: YamlPath = ["dataRules", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    dataRules.push(parseDataRule(raw, path, pathMap));
  });

  // ---- UiRules / UiPresets ----
  const uiRules: UiRuleSchema[] = [];
  arr<unknown>(["uiRules"]).forEach((_, i) => {
    const path: YamlPath = ["uiRules", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    uiRules.push(parseUiRule(raw, path, pathMap));
  });

  const uiPresets: UiPresetSchema[] = [];
  arr<unknown>(["uiPresets"]).forEach((_, i) => {
    const path: YamlPath = ["uiPresets", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    uiPresets.push({
      path,
      id: raw.id,
      name: str(raw.name),
      description: str(raw.description),
      props:
        raw.props && typeof raw.props === "object"
          ? (raw.props as Record<string, string | number | boolean>)
          : {},
    });
    pathMap.set(`uiPreset:${raw.id}`, path);
  });

  // ---- Mixins ----
  const mixins: MixinSchema[] = [];
  arr<unknown>(["mixins"]).forEach((_, i) => {
    const path: YamlPath = ["mixins", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    mixins.push({
      path,
      id: raw.id,
      name: str(raw.name),
      description: str(raw.description),
      type: raw.type === "view" ? "view" : "linkage",
      weight: num(raw.weight),
      useForChild: bool(raw.useForChild),
      linkage: str(raw.linkage),
      entity: raw.entity,
      views: Array.isArray(raw.views) ? raw.views : undefined,
    });
    pathMap.set(`mixin:${raw.id}`, path);
  });

  // ---- Trees / TransitiveLinkages / ExchangeSettings — L2 ----
  // ---- Trees ----
  const trees: TreeSchema[] = [];
  arr<unknown>(["trees"]).forEach((_, i) => {
    const path: YamlPath = ["trees", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    trees.push(parseTree(raw, path, pathMap));
  });

  // ---- TransitiveLinkages ----
  const transitiveLinkages: TransitiveLinkageSchema[] = [];
  arr<unknown>(["transitiveLinkages"]).forEach((_, i) => {
    const path: YamlPath = ["transitiveLinkages", i];
    const raw = get<Record<string, unknown>>(path);
    if (!raw || typeof raw.id !== "string") return;
    transitiveLinkages.push(parseTransitiveLinkage(raw, path, pathMap));
  });

  // ---- ExchangeSettings ----
  const exchangeSettings = parseExchangeSettings(doc, pathMap);

  const schema: DomainSchema = {
    metadata: metadata ?? {
      id: "",
      type: "domain",
      version: "0.0.0",
      name: "",
    },
    metadataPath,
    entities,
    dataTypes,
    sequences,
    counterColorPatterns,
    linkages,
    trees,
    transitiveLinkages,
    actions,
    views,
    menus,
    medias,
    dataRules,
    uiRules,
    uiPresets,
    mixins,
    exchangeSettings,
  };

  return { schema, pathMap, structuralErrors };
}

// ============ Парсеры отдельных элементов ============

type Getter = <T = unknown>(path: YamlPath) => T | undefined;

function parseMetadata(get: Getter): Metadata | null {
  const id = get<string>(["id"]);
  const type = get<string>(["type"]);
  const version = get<string>(["version"]);
  if (
    typeof id !== "string" ||
    type !== "domain" ||
    typeof version !== "string"
  ) {
    return null;
  }
  return {
    id,
    type: "domain",
    version,
    name: get<string>(["name"]) ?? "",
    description: get<string>(["description"]),
    author: get<string>(["author"]),
    status: get<string>(["status"]),
    date: get<string>(["date"]),
    tags: get<string[]>(["tags"]),
  };
}

function parseEntity(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): EntitySchema {
  const id = String(raw.id);
  pathMap.set(`entity:${id}`, path);

  const attributes: AttributeSchema[] = [];
  const rawAttrs = Array.isArray(raw.attributes) ? raw.attributes : [];
  rawAttrs.forEach((a, i) => {
    if (!a || typeof (a as any).id !== "string") return;
    const attrPath: YamlPath = [...path, "attributes", i];
    const attr = parseAttribute(a as Record<string, unknown>, attrPath, id);
    attributes.push(attr);
    pathMap.set(`entity:${id}/attribute:${attr.id}`, attrPath);
  });

  const sorting: EntitySortingRule[] = [];
  const rawSorting = Array.isArray(raw.sorting) ? raw.sorting : [];
  rawSorting.forEach((s, i) => {
    if (!s || typeof (s as any).id !== "string") return;
    const sPath: YamlPath = [...path, "sorting", i];
    const by = Array.isArray((s as any).by)
      ? (s as any).by
          .filter((x: any) => x && typeof x.attribute === "string")
          .map((x: any) => ({
            attribute: x.attribute,
            direction: (x.direction === "desc" ? "desc" : "asc") as
              | "asc"
              | "desc",
          }))
      : [];
    sorting.push({
      id: (s as any).id,
      name: str((s as any).name),
      by,
      createIndex: bool((s as any).createIndex),
    });
    pathMap.set(`entity:${id}/sorting:${(s as any).id}`, sPath);
  });

  return {
    path,
    id,
    name: str(raw.name),
    description: str(raw.description),
    label: raw.label === null ? null : str(raw.label),
    inherits: raw.inherits === null ? null : str(raw.inherits),
    kind: raw.kind as EntitySchema["kind"],
    attributes,
    sorting: sorting.length ? sorting : undefined,
    projection: Array.isArray(raw.projection)
      ? (raw.projection as any[])
          .filter((p) => p && typeof p.attribute === "string")
          .map((p) => ({ attribute: p.attribute }))
      : undefined,
    searching: Array.isArray(raw.searching)
      ? (raw.searching as any[])
          .filter((s) => s && typeof s.attribute === "string")
          .map((s) => ({ attribute: s.attribute }))
      : undefined,
    icons: str(raw.icons),
    graphView:
      raw.graphView && typeof raw.graphView === "object"
        ? { iconColor: String((raw.graphView as any).iconColor ?? "") }
        : undefined,
    scanTarget: bool(raw.scanTarget),
    scanTargetGroup: bool(raw.scanTargetGroup),
  };
}

function parseAttribute(
  raw: Record<string, unknown>,
  path: YamlPath,
  _entityId: string,
): AttributeSchema {
  return {
    path,
    id: String(raw.id),
    name: str(raw.name),
    description: str(raw.description),
    dataType: (raw.dataType as any) ?? "String",
    constraints: Array.isArray(raw.constraints)
      ? (raw.constraints as Constraint[])
      : undefined,
    readonly: bool(raw.readonly),
    entity: str(raw.entity),
    item:
      raw.item && typeof raw.item === "object"
        ? {
            dataType: (raw.item as any).dataType ?? "String",
            entity: str((raw.item as any).entity),
            constraints: Array.isArray((raw.item as any).constraints)
              ? ((raw.item as any).constraints as Constraint[])
              : undefined,
          }
        : undefined,
    calculation:
      raw.calculation && typeof raw.calculation === "object"
        ? {
            schemaId: String((raw.calculation as any).schemaId ?? ""),
            id: String((raw.calculation as any).id ?? ""),
          }
        : undefined,
    comments: bool(raw.comments),
    sequence: str(raw.sequence),
    template: str(raw.template),
    segment: Array.isArray(raw.segment)
      ? (raw.segment as unknown[]).map(String)
      : undefined,
    defaultPrefix: str(raw.defaultPrefix),
    prefixRules: Array.isArray(raw.prefixRules)
      ? (raw.prefixRules as any[])
          .filter((p) => p && typeof p.id === "string")
          .map((p) => ({
            id: p.id,
            attribute: String(p.attribute ?? ""),
            source: {
              entity: String(p.source?.entity ?? ""),
              key: String(p.source?.key ?? ""),
              value: String(p.source?.value ?? ""),
            },
          }))
      : undefined,
    incrementTemplate: str(raw.incrementTemplate),
    searchable: bool(raw.searchable),
  };
}

function parseDataType(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): DataTypeSchema {
  const id = String(raw.id);
  pathMap.set(`dataType:${id}`, path);
  const kind = (
    raw.dataType === "Table"
      ? "Table"
      : raw.dataType === "Workflow"
        ? "Workflow"
        : "Enum"
  ) as DataTypeSchema["kind"];

  return {
    path,
    id,
    name: str(raw.name),
    description: str(raw.description),
    kind,
    values: Array.isArray(raw.values)
      ? (raw.values as any[])
          .filter((v) => v && typeof v.id === "string")
          .map((v) => ({
            id: v.id,
            name: str(v.name),
            description: str(v.description),
            hidden: bool(v.hidden),
            value: v.value,
          }))
      : undefined,
    statuses: Array.isArray(raw.statuses)
      ? (raw.statuses as any[])
          .filter((s) => s && typeof s.id === "string")
          .map((s) => ({
            id: s.id,
            name: str(s.name),
            description: str(s.description),
            hidden: bool(s.hidden),
          }))
      : undefined,
    initial: str(raw.initial),
    transitions: Array.isArray(raw.transitions)
      ? (raw.transitions as any[])
          .filter(
            (t) => t && typeof t.from === "string" && typeof t.to === "string",
          )
          .map((t) => ({ from: t.from, to: t.to }))
      : undefined,
    attributes: Array.isArray(raw.attributes)
      ? (raw.attributes as any[])
          .filter((a) => a && typeof a.id === "string")
          .map((a, i) => parseAttribute(a, [...path, "attributes", i], id))
      : undefined,
    maxRows: num(raw.maxRows),
    view: raw.view,
  };
}

function parseLinkage(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): LinkageSchema {
  const id = String(raw.id);
  pathMap.set(`linkage:${id}`, path);

  const attributes: AttributeSchema[] = [];
  if (Array.isArray(raw.attributes)) {
    (raw.attributes as any[]).forEach((a, i) => {
      if (a && typeof a.id === "string") {
        attributes.push(parseAttribute(a, [...path, "attributes", i], id));
      }
    });
  }

  return {
    path,
    id,
    name: str(raw.name),
    description: str(raw.description),
    side1: String(raw.side1 ?? ""),
    side2: String(raw.side2 ?? ""),
    type: raw.type === "1_1" ? "1_1" : raw.type === "n_n" ? "n_n" : "1_n",
    undirected: bool(raw.undirected),
    useForSearch: bool(raw.useForSearch),
    excludeOnGraph:
      raw.excludeOnGraph === "off" ? "off" : bool(raw.excludeOnGraph),
    nameFrom:
      raw.nameFrom && typeof raw.nameFrom === "object"
        ? {
            side1: str((raw.nameFrom as any).side1),
            side2: str((raw.nameFrom as any).side2),
          }
        : undefined,
    attributes: attributes.length ? attributes : undefined,
    view:
      raw.view && typeof raw.view === "object"
        ? { iconColor: str((raw.view as any).iconColor) }
        : undefined,
    searching: Array.isArray(raw.searching)
      ? (raw.searching as any[])
          .filter((s) => s && typeof s.attribute === "string")
          .map((s) => ({ attribute: s.attribute }))
      : undefined,
  };
}

function parseAction(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): ActionSchema {
  const id = String(raw.id);
  pathMap.set(`action:${id}`, path);

  const values = Array.isArray(raw.values)
    ? (raw.values as any[])
        .filter((v) => v && typeof v.attribute === "string")
        .map((v) => ({ attribute: v.attribute, value: v.value }))
    : undefined;

  return {
    path,
    id,
    name: str(raw.name),
    description: str(raw.description),
    type: raw.type as ActionSchema["type"],
    entity: str(raw.entity),
    operation: str(raw.operation),
    modal: str(raw.modal),
    panel: str(raw.panel),
    view: str(raw.view),
    page: raw.page as "blank" | "current" | undefined,
    pageView: str(raw.pageView),
    linkage: str(raw.linkage),
    attribute: str(raw.attribute),
    join: str(raw.join),
    side: raw.side === 1 || raw.side === 2 ? raw.side : undefined,
    scenario: str(raw.scenario),
    workerTag: str(raw.workerTag),
    automationId:
      typeof raw.automation === "object" && raw.automation
        ? str((raw.automation as any).id)
        : undefined,
    values,
    defaultViewMode: raw.defaultViewMode as ActionSchema["defaultViewMode"],
  };
}

function parseView(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): ViewSchema {
  const id = String(raw.id);
  pathMap.set(`view:${id}`, path);

  return {
    path,
    id,
    label: str(raw.label),
    description: str(raw.description),
    type: (raw.type as ViewSchema["type"]) ?? "list",
    entity: str(raw.entity),
    inherits: str(raw.inherits),
    source:
      raw.source && typeof raw.source === "object"
        ? {
            type: str((raw.source as any).type),
            entity: str((raw.source as any).entity),
            joins: Array.isArray((raw.source as any).joins)
              ? (raw.source as any).joins
              : undefined,
          }
        : undefined,
    table: raw.table,
    actionPanel: Array.isArray(raw.actionPanel) ? raw.actionPanel : undefined,
    isMixin: bool(raw.isMixin),
  };
}

function parseMenu(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): MenuSchema {
  const id = String(raw.id);
  pathMap.set(`menu:${id}`, path);

  const items = Array.isArray(raw.items)
    ? (raw.items as any[])
        .filter((it) => it && typeof it.id === "string")
        .map((it, i) => {
          const itemPath: YamlPath = [...path, "items", i];
          pathMap.set(`menu:${id}/item:${it.id}`, itemPath);
          return {
            path: itemPath,
            id: it.id,
            route: String(it.route ?? ""),
            label: String(it.label ?? ""),
            type: "menu" as const,
            view: String(it.view ?? ""),
            priority: num(it.priority),
            description: str(it.description),
          };
        })
    : undefined;

  return {
    path,
    id,
    route: String(raw.route ?? ""),
    label: String(raw.label ?? ""),
    type: raw.type === "root_menu" ? "root_menu" : "root_group",
    placement: raw.placement === "settings" ? "settings" : "top",
    icon: str(raw.icon),
    priority: num(raw.priority),
    view: str(raw.view),
    description: str(raw.description),
    items,
  };
}

function parseDataRule(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): DataRuleSchema {
  const id = String(raw.id);
  pathMap.set(`dataRule:${id}`, path);

  // condition: строка или boolean. Снимаем !rql через getRql?
  // raw уже получен из doc.get (без тега). Если тег был — value чистый.
  // Обрабатываем оба случая: raw.condition может быть строкой '...' или 'true'.
  const condRaw = raw.condition;
  let condition: string | null = null;
  if (typeof condRaw === "string") condition = condRaw.trim();
  else if (condRaw === true) condition = null; // «применять всегда»
  // если false / undefined — оставляем null

  const rule =
    raw.rule && typeof raw.rule === "object"
      ? (raw.rule as Record<string, unknown>)
      : {};

  const attributes = Array.isArray(rule.attributes)
    ? (rule.attributes as any[])
        .filter((a) => a && typeof a.attribute === "string")
        .map((a) => ({
          attribute: a.attribute,
          constraint:
            typeof a.constraint === "string" ? a.constraint : undefined,
          expression:
            typeof a.expression === "string" ? a.expression : undefined,
          value: a.value,
          message: str(a.message),
          help: str(a.help),
        }))
    : undefined;

  return {
    path,
    id,
    name: str(raw.name),
    description: str(raw.description),
    target: (raw.target as DataRuleSchema["target"]) ?? "entity",
    entity: str(raw.entity),
    attribute: str(raw.attribute),
    linkage: str(raw.linkage),
    condition,
    effect: (rule.effect as DataRuleSchema["effect"]) ?? "readonly",
    attributes,
    linkages: Array.isArray(rule.linkages) ? rule.linkages : undefined,
    nested: rule.nested,
    message: str(raw.message),
    help: str(raw.help),
  };
}

function parseUiRule(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): UiRuleSchema {
  const id = String(raw.id);
  pathMap.set(`uiRule:${id}`, path);

  const rule =
    raw.rule && typeof raw.rule === "object"
      ? (raw.rule as Record<string, unknown>)
      : {};

  const condition =
    typeof raw.condition === "string" ? raw.condition.trim() : null;

  return {
    path,
    id,
    name: str(raw.name),
    description: str(raw.description),
    target: (raw.target as UiRuleSchema["target"]) ?? "entity_view",
    view: String(raw.view ?? ""),
    contextViews: Array.isArray((raw.context as any)?.views)
      ? ((raw.context as any).views as unknown[]).map(String)
      : undefined,
    operations: Array.isArray(rule.operations)
      ? (rule.operations as unknown[]).filter(
          (o): o is "view" | "edit" | "create" =>
            o === "view" || o === "edit" || o === "create",
        )
      : undefined,
    condition,
    effect: (rule.effect as UiRuleSchema["effect"]) ?? "hidden",
    widgets: Array.isArray(rule.widgets)
      ? (rule.widgets as any[])
          .filter((w) => w && typeof w.widget === "string")
          .map((w) => ({
            widget: w.widget,
            nested: w.nested,
            presets: Array.isArray(w.presets)
              ? w.presets.map(String)
              : undefined,
          }))
      : undefined,
    groups: Array.isArray(rule.groups)
      ? (rule.groups as any[])
          .filter((g) => g && typeof g.group === "string")
          .map((g) => ({
            group: g.group,
            presets: Array.isArray(g.presets)
              ? g.presets.map(String)
              : undefined,
          }))
      : undefined,
    columns: Array.isArray(rule.columns)
      ? (rule.columns as any[])
          .filter((c) => c && typeof c.column === "string")
          .map((c) => ({
            column: c.column,
            presets: Array.isArray(c.presets)
              ? c.presets.map(String)
              : undefined,
          }))
      : undefined,
    presets: Array.isArray(rule.presets)
      ? (rule.presets as unknown[]).map(String)
      : undefined,
    message: str(raw.message),
    help: str(raw.help),
  };
}

// ============ Мелкие утилиты ============

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

// ============ Trees ============

function parseTree(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): TreeSchema {
  const id = String(raw.id);
  pathMap.set(`tree:${id}`, path);

  const rawHierarchy =
    raw.hierarchy && typeof raw.hierarchy === "object"
      ? (raw.hierarchy as Record<string, unknown>)
      : {};

  const hierarchy: TreeHierarchy = {
    entity: String(rawHierarchy.entity ?? ""),
    maxInstances: num(rawHierarchy.maxInstances),
    maxChildren: num(rawHierarchy.maxChildren),
    children: parseTreeChildren(rawHierarchy.children),
  };

  const sorting: TreeSorting[] | undefined = Array.isArray(raw.sorting)
    ? (raw.sorting as any[])
        .filter((s) => s && typeof s.id === "string")
        .map((s) => ({
          id: s.id,
          name: str(s.name),
          by: Array.isArray(s.by)
            ? (s.by as any[])
                .filter((b) => b && typeof b.entity === "string")
                .map((b) => ({
                  entity: b.entity,
                  by: Array.isArray(b.by)
                    ? (b.by as any[])
                        .filter((x) => x && typeof x.attribute === "string")
                        .map((x) => ({
                          attribute: x.attribute,
                          direction: (x.direction === "desc"
                            ? "desc"
                            : "asc") as "asc" | "desc",
                        }))
                    : [],
                }))
            : [],
        }))
    : undefined;

  return {
    path,
    id,
    name: str(raw.name),
    type: (raw.type === "orderable" || raw.type === "multiparent"
      ? raw.type
      : "ordinary") as TreeSchema["type"],
    maxDepth: num(raw.maxDepth),
    hierarchy,
    sorting,
  };
}

function parseTreeChildren(raw: unknown): TreeHierarchyChild[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === "object")
    .map((c: any) => ({
      linkage: String(c.linkage ?? ""),
      entity: String(c.entity ?? ""),
      side: c.side === 1 || c.side === 2 ? c.side : undefined,
      maxInstances: num(c.maxInstances),
      maxChildren: num(c.maxChildren),
      children: parseTreeChildren(c.children),
    }));
}

// ============ TransitiveLinkages ============

function parseTransitiveLinkage(
  raw: Record<string, unknown>,
  path: YamlPath,
  pathMap: PathMap,
): TransitiveLinkageSchema {
  const id = String(raw.id);
  pathMap.set(`transitive:${id}`, path);

  const joins = parseTransitiveJoins(raw.joins);

  return {
    path,
    id,
    entity: String(raw.entity ?? ""),
    description: str(raw.description),
    joins,
  };
}

function parseTransitiveJoins(raw: unknown): TransitiveLinkageJoin[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((j) => j && typeof j === "object")
    .map((j: any) => {
      const searchRaw =
        j.search && typeof j.search === "object"
          ? (j.search as Record<string, unknown>)
          : null;
      const search = searchRaw
        ? {
            enabled: bool(searchRaw.enabled),
            mode: (searchRaw.mode === "entity" ||
            searchRaw.mode === "linkage" ||
            searchRaw.mode === "both"
              ? searchRaw.mode
              : undefined) as "entity" | "linkage" | "both" | undefined,
          }
        : undefined;

      return {
        id: String(j.id ?? ""),
        linkage: String(j.linkage ?? ""),
        side: j.side === 1 || j.side === 2 ? j.side : undefined,
        search,
        joins: parseTransitiveJoins(j.joins),
      };
    });
}

// ============ ExchangeSettings ============

function parseExchangeSettings(
  doc: YamlDocument,
  pathMap: PathMap,
): ExchangeSettingsSchema | undefined {
  const raw = doc.get(["exchangeSettings"]) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== "object") return undefined;

  pathMap.set("exchangeSettings", ["exchangeSettings"]);

  const attributeFormats =
    raw.attributeFormats && typeof raw.attributeFormats === "object"
      ? (raw.attributeFormats as Record<string, string>)
      : undefined;

  const entities: Record<string, ExchangeEntitySettings> = {};
  if (raw.entities && typeof raw.entities === "object") {
    for (const [entityIdRaw, eRaw] of Object.entries(
      raw.entities as Record<string, unknown>,
    )) {
      if (!eRaw || typeof eRaw !== "object") continue;
      const e = eRaw as Record<string, unknown>;
      entities[entityIdRaw] = {
        entityIdRaw,
        domainLabel: str(e.domainLabel),
        enable: bool(e.enable),
        label: str(e.label),
        forExport: str(e.forExport),
        upsertWith: str(e.upsertWith),
        ignoreAttributes: str(e.ignoreAttributes),
        exportSystemAttributes:
          e.exportSystemAttributes === "all"
            ? "all"
            : Array.isArray(e.exportSystemAttributes)
              ? (e.exportSystemAttributes as unknown[]).map(String)
              : str(e.exportSystemAttributes),
        noCmsSync: bool(e.noCmsSync),
      };
    }
  }

  return {
    path: ["exchangeSettings"],
    enable: bool(raw.enable),
    description: str(raw.description),
    label: str(raw.label),
    noCmsSync: bool(raw.noCmsSync),
    attributeFormats,
    entities: Object.keys(entities).length > 0 ? entities : undefined,
  };
}
