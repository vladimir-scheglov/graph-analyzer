import { KNOWN_ACTION_TYPES } from "../../shared/action-types";
import type { ModelIndex } from "../../shared/model-types";

// ============ Local recheck ============
// Локальная (без пересборки индекса) проверка lint-issue по текущему
// содержимому YAML. Используется в YamlViewerModal для classifyIssue.
//
// Каждая функция отвечает: "still" | "resolved" | "unknown".
//   - still     — проблема точно осталась
//   - resolved  — проблема исправлена
//   - unknown   — мы не умеем проверить правило локально

export type RecheckState = "still" | "resolved" | "unknown";

export interface RecheckIssue {
  ruleId: string;
  entityFqid?: string;
  attributeId?: string;
  propertyPath?: string;
  message?: string;
  __clientOnly?: boolean;
}

// ============ Промежуточные структуры ============

interface LocalAttr {
  id: string;
  line: number; // 1-based
  endLine: number; // exclusive
  fields: Record<string, string>;
}

interface LocalEntity {
  id: string; // original case
  idLower: string;
  line: number;
  endLine: number;
  fields: Record<string, string>;
  attrIds: string[]; // с дублями (для duplicate check)
  attrs: Map<string, LocalAttr>; // id → record (первый)
}

interface LocalLinkage {
  id: string;
  line: number;
  endLine: number;
  fields: Record<string, string>; // side1, side2, type, undirected, excludeOnGraph, view.iconColor
  nameFrom: { side1: string | null; side2: string | null };
}

interface LocalAction {
  id: string;
  line: number;
  endLine: number;
  fields: Record<string, string>; // type, entity, linkage, operation, automation.id
}

interface LocalCounterColor {
  id: string;
  red: string;
  yellow: string;
}

export interface RecheckModel {
  lines: string[];
  entities: LocalEntity[]; // все (с дублями)
  entityByLowerId: Map<string, LocalEntity>; // первый по lowercased id
  linkages: Map<string, LocalLinkage>;
  actions: Map<string, LocalAction>;
  counterColors: Map<string, LocalCounterColor>;
}

const GRAPH_COLORS = new Set([
  "red",
  "pink",
  "lightpink",
  "orange",
  "peach",
  "yellow",
  "green",
  "lightgreen",
  "turquoise",
  "lightblue",
  "blue",
  "violet",
  "purple",
  "grey",
]);

const SYSTEM_ATTRS = new Set([
  "id",
  "label",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "organizationId",
  "tenantId",
  "domainId",
  "entityId",
  "entityName",
  "version",
]);

const COUNTER_TIME_RE = /^([1-9][0-9]*[wdhm])+$/;
const COUNTER_PERCENT_RE = /^(?!0%)([1-9][0-9]?|100)%$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============ Utils ============

function unq(s: string): string {
  const t = String(s || "")
    .replace(/\s+#.*$/, "")
    .trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  )
    return t.slice(1, -1);
  return t;
}

function indentOf(l: string): number {
  return (l.match(/^(\s*)/) || ["", ""])[1].length;
}

function findBlockEnd(
  lines: string[],
  start: number,
  baseIndent: number,
): number {
  for (let j = start + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim()) continue;
    const ind = indentOf(l);
    if (ind <= baseIndent && /^\s*-\s+/.test(l)) return j;
    if (ind === 0) return j;
  }
  return lines.length;
}

// ============ Parser ============

export function buildRecheckModel(content: string): RecheckModel {
  const lines = content.split("\n");
  const entities: LocalEntity[] = [];
  const entityByLowerId = new Map<string, LocalEntity>();
  const linkages = new Map<string, LocalLinkage>();
  const actions = new Map<string, LocalAction>();
  const counterColors = new Map<string, LocalCounterColor>();

  let section = "";
  let entityDashIndent = -1;
  let attrDashIndent = -1;
  let currentEntity: LocalEntity | null = null;
  let currentAttr: LocalAttr | null = null;

  const fieldRegex = /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.+?)\s*(?:#.*)?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const ind = indentOf(line);

    if (ind === 0) {
      const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      section = sm?.[1] || "";
      entityDashIndent = -1;
      attrDashIndent = -1;
      currentEntity = null;
      currentAttr = null;
      continue;
    }

    // ============ entities ============
    if (section === "entities") {
      if (entityDashIndent === -1) {
        const dm = line.match(/^(\s*)-\s+\S/);
        if (dm) entityDashIndent = dm[1].length;
      }
      const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
      if (
        idm &&
        idm[1].length === entityDashIndent &&
        (!currentEntity ||
          attrDashIndent === -1 ||
          idm[1].length <= entityDashIndent)
      ) {
        // Heuristic: entity-id — на уровне entityDashIndent, а НЕ внутри attributes.
        // Проверим: если текущий атрибут и его indent < entity id's indent — это не entity.
        const isInsideAttributes =
          currentAttr !== null && idm[1].length > entityDashIndent;
        if (!isInsideAttributes) {
          // закрываем предыдущий
          if (currentEntity) {
            currentEntity.endLine = i;
            if (currentAttr) currentAttr.endLine = i;
            currentAttr = null;
          }
          const id = unq(idm[2]);
          const e: LocalEntity = {
            id,
            idLower: id.toLowerCase(),
            line: i,
            endLine: lines.length,
            fields: {},
            attrIds: [],
            attrs: new Map(),
          };
          entities.push(e);
          if (!entityByLowerId.has(e.idLower))
            entityByLowerId.set(e.idLower, e);
          currentEntity = e;
          entityDashIndent = idm[1].length;
          attrDashIndent = -1;
          continue;
        }
      }
      // атрибуты
      if (currentEntity) {
        if (attrDashIndent === -1) {
          const dm = line.match(/^(\s*)-\s+\S/);
          if (dm && dm[1].length > entityDashIndent)
            attrDashIndent = dm[1].length;
        }
        const am = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (am && am[1].length === attrDashIndent && attrDashIndent > -1) {
          if (currentAttr) currentAttr.endLine = i;
          const id = unq(am[2]);
          const a: LocalAttr = {
            id,
            line: i,
            endLine: lines.length,
            fields: {},
          };
          currentEntity.attrIds.push(id);
          if (!currentEntity.attrs.has(id.toLowerCase()))
            currentEntity.attrs.set(id.toLowerCase(), a);
          currentAttr = a;
          continue;
        }
        const fm = line.match(fieldRegex);
        if (fm) {
          const key = fm[2];
          const value = unq(fm[3]);
          if (currentAttr && ind > attrDashIndent) {
            // Поля атрибута. Защита от перезаписи нужна, чтобы `item.dataType`
            // (вложенный) не затирал верхнеуровневый `dataType`. Пишем первое
            // встреченное значение — для скалярных YAML-полей это корректно
            // (дубликат ключа в одном mapping'е — уже ошибка парсера).
            if (
              (key === "entity" ||
                key === "dataType" ||
                key === "template" ||
                key === "sequence" ||
                key === "defaultPrefix" ||
                key === "incrementTemplate" ||
                key === "description" ||
                key === "name") &&
              !(key in currentAttr.fields)
            ) {
              currentAttr.fields[key] = value;
            }
          } else if (!currentAttr || ind <= attrDashIndent) {
            // поля сущности
            if (
              key === "inherits" ||
              key === "label" ||
              key === "description" ||
              key === "name"
            )
              currentEntity.fields[key] = value;
          }
        }
        // item.entity — упрощённо: если текущая строка "entity: X" и предыдущие
        // строки содержат "item:" на меньшем indent (без закрытия)
        const itemEm = line.match(/^(\s*)entity\s*:\s*([^\s#]+)/);
        if (itemEm && currentAttr) {
          // ищем `item:` выше на меньшем indent
          const itemInd = itemEm[1].length;
          for (let j = i - 1; j >= Math.max(0, currentAttr.line); j--) {
            const l2 = lines[j];
            const ind2 = indentOf(l2);
            if (ind2 < itemInd && /^\s*item\s*:\s*$/.test(l2)) {
              currentAttr.fields["item.entity"] = unq(itemEm[2]);
              break;
            }
            if (
              ind2 < itemInd &&
              l2.trim() &&
              !l2.trim().startsWith("-") &&
              !l2.trim().startsWith("item")
            )
              break;
          }
        }
      }
      continue;
    }

    // ============ linkages ============
    if (section === "linkages") {
      if (entityDashIndent === -1) {
        const dm = line.match(/^(\s*)-\s+\S/);
        if (dm) entityDashIndent = dm[1].length;
      }
      const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
      if (idm && idm[1].length === entityDashIndent) {
        const id = unq(idm[2]);
        const lk: LocalLinkage = {
          id,
          line: i,
          endLine: lines.length,
          fields: {},
          nameFrom: { side1: null, side2: null },
        };
        linkages.set(id, lk);
        entityDashIndent = idm[1].length;
        // сохраним ссылку на «текущий» linkage через currentEntity-поле
        // (переиспользуем переменную с другим смыслом)
        currentEntity = null;
        currentAttr = null;
        // @ts-ignore
        (linkages as any)._current = lk;
        continue;
      }
      const lk = (linkages as any)._current as LocalLinkage | undefined;
      if (lk) {
        const fm = line.match(fieldRegex);
        if (fm) {
          const key = fm[2];
          const value = unq(fm[3]);
          if (
            key === "side1" ||
            key === "side2" ||
            key === "type" ||
            key === "undirected" ||
            key === "excludeOnGraph"
          )
            lk.fields[key] = value;
        }
        // nameFrom.side1/side2
        const nm = line.match(/^\s*side([12])\s*:\s*([^\s#]+)/);
        if (
          nm &&
          /nameFrom/.test(lines.slice(Math.max(0, i - 3), i).join("\n"))
        ) {
          lk.nameFrom[("side" + nm[1]) as "side1" | "side2"] = unq(nm[2]);
        }
        const im = line.match(/^\s*iconColor\s*:\s*([^\s#]+)/);
        if (
          im &&
          /view\s*:/.test(lines.slice(Math.max(0, i - 3), i).join("\n"))
        ) {
          lk.fields["view.iconColor"] = unq(im[1]);
        }
      }
      continue;
    }

    // ============ actions ============
    if (section === "actions") {
      if (entityDashIndent === -1) {
        const dm = line.match(/^(\s*)-\s+\S/);
        if (dm) entityDashIndent = dm[1].length;
      }
      const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
      if (idm && idm[1].length === entityDashIndent) {
        const id = unq(idm[2]);
        const act: LocalAction = {
          id,
          line: i,
          endLine: lines.length,
          fields: {},
        };
        actions.set(id, act);
        (actions as any)._current = act;
        continue;
      }
      const act = (actions as any)._current as LocalAction | undefined;
      if (act) {
        const fm = line.match(fieldRegex);
        if (fm) {
          const key = fm[2];
          const value = unq(fm[3]);
          if (
            key === "type" ||
            key === "entity" ||
            key === "linkage" ||
            key === "operation" ||
            key === "join"
          )
            act.fields[key] = value;
        }
        const am = line.match(/^\s*automation\s*:\s*$/);
        if (am) (act.fields as any).__inAutomation = "1";
        const aidm = line.match(/^\s*id\s*:\s*([^\s#]+)/);
        if (
          aidm &&
          (act.fields as any).__inAutomation === "1" &&
          !/^\s*-\s+id\s*:/.test(line)
        ) {
          act.fields["automation.id"] = unq(aidm[1]);
        }
      }
      continue;
    }

    // ============ counterColorPattern(s) ============
    if (
      section === "counterColorPattern" ||
      section === "counterColorPatterns"
    ) {
      if (entityDashIndent === -1) {
        const dm = line.match(/^(\s*)-\s+\S/);
        if (dm) entityDashIndent = dm[1].length;
      }
      const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
      if (idm && idm[1].length === entityDashIndent) {
        const id = unq(idm[2]);
        counterColors.set(id, { id, red: "", yellow: "" });
        (counterColors as any)._current = id;
        continue;
      }
      const curId = (counterColors as any)._current as string | undefined;
      if (curId) {
        const rm = line.match(/^\s*red\s*:\s*([^\s#]+)/);
        if (rm) counterColors.get(curId)!.red = unq(rm[1]);
        const ym = line.match(/^\s*yellow\s*:\s*([^\s#]+)/);
        if (ym) counterColors.get(curId)!.yellow = unq(ym[1]);
      }
      continue;
    }
  }

  // финализация endLine
  if (currentEntity) currentEntity.endLine = lines.length;

  return {
    lines,
    entities,
    entityByLowerId,
    linkages,
    actions,
    counterColors,
  };
}

// ============ Resolver ============

function localEntityExists(model: RecheckModel, id: string): boolean {
  return model.entityByLowerId.has(id.trim().toLowerCase());
}

// ============ Rules ============

function hasAttributeInChain(
  model: RecheckModel,
  entity: LocalEntity,
  attrId: string,
  depth = 0,
): boolean {
  if (depth > 10) return false;
  if (entity.attrs.has(attrId.toLowerCase())) return true;
  const inh = entity.fields["inherits"];
  if (!inh) return false;
  if (inh.includes("/")) return true; // cross-domain — не проверяем
  const parent = model.entityByLowerId.get(inh.toLowerCase());
  if (!parent) return false;
  return hasAttributeInChain(model, parent, attrId, depth + 1);
}

function findLinkageByPath(
  model: RecheckModel,
  propertyPath: string,
): LocalLinkage | null {
  const m = propertyPath.match(/linkages\[([^\]]+)\]\./);
  if (!m) return null;
  return model.linkages.get(m[1]) || null;
}

function findActionById(model: RecheckModel, id: string): LocalAction | null {
  return model.actions.get(id) || null;
}

function getActionTypeFromModel(
  model: RecheckModel,
  actionId: string,
): string | null {
  return findActionById(model, actionId)?.fields["type"] ?? null;
}

// ============ Public recheck ============

export function recheck(
  issue: RecheckIssue,
  model: RecheckModel,
  _index?: ModelIndex | null,
): RecheckState {
  if (issue.__clientOnly) return "still";
  const ruleId = String(issue.ruleId || "").toLowerCase();

  // ============ duplicate-id/<section> ============
  // propertyPath вида `<section>[<id>]` или `<section>[..].<sub>[<id>]`.
  // Берём последний [] — это и есть id. Считаем `- id: <id>` по тексту;
  // > 1 — дубликат остался, 1 — resolved, 0 — element удалён → resolved.
  //
  // Ограничение: если один и тот же id используется в разных секциях
  // (например, entity "Foo" и attribute "Foo"), счётчик даст ложный still.
  // На практике сущности CamelCase, атрибуты camelCase — коллизии редки.
  if (ruleId.startsWith("duplicate-id/")) {
    const all = [...(issue.propertyPath || "").matchAll(/\[([^\]]+)\]/g)];
    if (all.length === 0) return "unknown";
    const id = all[all.length - 1][1].trim();
    if (!id || id === "..") return "unknown";

    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `^\\s*-\\s+id\\s*:\\s*["']?${escaped}["']?\\s*(?:#.*)?$`,
      "gm",
    );
    const count = (model.lines.join("\n").match(re) || []).length;
    return count > 1 ? "still" : "resolved";
  }

  // ============ view/widget-linkage-side-on-undirected ============
  // `side` не должно быть у виджета, если linkage ненаправленная.
  // Из propertyPath берём id виджета; если `side:` нет в блоке — resolved.
  if (ruleId === "view/widget-linkage-side-on-undirected") {
    const m = issue.propertyPath?.match(/widgets\[([^\]]+)\]/);
    if (!m) return "unknown";
    return fieldExistsInItemBlock(model, m[1], "side") as RecheckState;
  }

  // ============ identifier ============
  // Все правила работают только с полями атрибута — резолвим сущность
  // в текущем файле, без обращения к ModelIndex.
  if (ruleId.startsWith("identifier/")) {
    if (!issue.entityFqid || !issue.attributeId) return "unknown";
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const attr = entity.attrs.get(issue.attributeId.toLowerCase());
    if (!attr) return "resolved";

    const template = attr.fields["template"] || "";
    const sequence = attr.fields["sequence"] || "";
    const defaultPrefix = attr.fields["defaultPrefix"] || "";
    const incrementTemplate = attr.fields["incrementTemplate"] || "";

    if (ruleId === "identifier/template-and-sequence") {
      return template && sequence ? "still" : "resolved";
    }

    if (ruleId === "identifier/segment-and-sequence") {
      // segment — массив, парсер его не собирает. Если sequence убрали —
      // правило точно не актуально. Если оставили — не проверить.
      return sequence ? "unknown" : "resolved";
    }

    if (ruleId === "identifier/no-spec") {
      if (attr.fields["dataType"] !== "Identifier") return "resolved";
      return template || sequence ? "resolved" : "still";
    }

    if (ruleId === "identifier/no-inc") {
      if (!template) return "resolved";
      const segments = [...template.matchAll(/{(.*?)}/g)].map((m) =>
        m[1].trim(),
      );
      return segments.includes("@inc") ? "resolved" : "still";
    }

    if (ruleId === "identifier/unknown-segment") {
      if (!template) return "resolved";
      const KNOWN = new Set(["@inc", "@prefix", "@YYYY", "@YY", "@MM", "@DD"]);
      const segments = [...template.matchAll(/{(.*?)}/g)].map((m) =>
        m[1].trim(),
      );
      return segments.every((s) => KNOWN.has(s)) ? "resolved" : "still";
    }

    if (ruleId === "identifier/prefix-no-default") {
      return template.includes("{@prefix}") && !defaultPrefix
        ? "still"
        : "resolved";
    }

    if (ruleId === "identifier/bad-increment-template") {
      if (!incrementTemplate) return "resolved";
      return /^0{2,10}$/.test(incrementTemplate) ? "resolved" : "still";
    }

    // prefix-attribute-unknown / prefix-source-* / segment-token-* —
    // требуют парсинга prefixRules[] и/или segment[] + резолва через
    // ModelIndex. Отложено (см. бэклог PR-3).
    return "unknown";
  }

  // ============ reference ============
  if (
    ruleId === "reference/entity-unknown" ||
    ruleId === "reference/array-entity-unknown"
  ) {
    if (!issue.entityFqid || !issue.attributeId) return "unknown";
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const attr = entity.attrs.get(issue.attributeId.toLowerCase());
    if (!attr) return "resolved";
    const target =
      ruleId === "reference/array-entity-unknown"
        ? attr.fields["item.entity"]
        : attr.fields["entity"];
    if (!target) return "resolved";
    if (target.includes("/")) return "unknown";
    return localEntityExists(model, target) ? "resolved" : "still";
  }
  if (
    ruleId === "reference/attribute-entity-missing" ||
    ruleId === "reference/array-reference-entity-missing"
  ) {
    if (!issue.entityFqid || !issue.attributeId) return "unknown";
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const attr = entity.attrs.get(issue.attributeId.toLowerCase());
    if (!attr) return "resolved";
    const target =
      ruleId === "reference/array-reference-entity-missing"
        ? attr.fields["item.entity"]
        : attr.fields["entity"];
    return target ? "resolved" : "still";
  }

  // ============ semantic ============
  if (ruleId === "semantic/label-attribute-unknown" && issue.entityFqid) {
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const label = entity.fields["label"];
    if (!label) return "resolved";
    const placeholders = [...label.matchAll(/{(.+?)}/g)]
      .map((m) => m[1].trim())
      .filter(
        (p) =>
          p && !SYSTEM_ATTRS.has(p) && !p.includes(".") && !p.includes("/"),
      );
    for (const ph of placeholders) {
      if (!hasAttributeInChain(model, entity, ph)) return "still";
    }
    return "resolved";
  }
  if (ruleId === "semantic/self-inheritance" && issue.entityFqid) {
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const inh = entity.fields["inherits"];
    if (!inh) return "resolved";
    return inh.toLowerCase() === entityId.toLowerCase() ? "still" : "resolved";
  }
  if (
    ruleId === "semantic/duplicate-attribute" &&
    issue.entityFqid &&
    issue.attributeId
  ) {
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const count = entity.attrIds.filter(
      (id) => id.toLowerCase() === issue.attributeId!.toLowerCase(),
    ).length;
    return count > 1 ? "still" : "resolved";
  }

  // ============ duplicate-id ============
  if (ruleId === "duplicate-id/entities") {
    const id = issue.propertyPath?.match(/entities\[([^\]]+)\]/)?.[1];
    if (!id) return "unknown";
    const count = model.entities.filter(
      (e) => e.idLower === id.toLowerCase(),
    ).length;
    return count > 1 ? "still" : "resolved";
  }

  // ============ naming ============
  if (ruleId === "naming/entity-camelcase" && issue.entityFqid) {
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    return /^[A-Z][a-zA-Z0-9]*$/.test(entity.id) ? "resolved" : "still";
  }
  if (ruleId === "naming/attribute-camelcase" && issue.attributeId) {
    const entityId = issue.entityFqid?.split("/").pop();
    if (!entityId) return "unknown";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const attr = entity.attrs.get(issue.attributeId.toLowerCase());
    if (!attr) return "resolved";
    return /^[a-z][a-zA-Z0-9]*$/.test(attr.id) ? "resolved" : "still";
  }
  if (
    ruleId === "naming/system-id-attribute" &&
    issue.entityFqid &&
    issue.attributeId
  ) {
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    return entity.attrs.has(issue.attributeId.toLowerCase())
      ? "still"
      : "resolved";
  }

  // ============ recommended/required ============
  if (ruleId === "recommended/entity-description" && issue.entityFqid) {
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    return (entity.fields["description"] || "").trim() ? "resolved" : "still";
  }
  if (ruleId === "recommended/entity-label" && issue.entityFqid) {
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    return (entity.fields["label"] || "").trim() ? "resolved" : "still";
  }
  if (ruleId === "recommended/attribute-description" && issue.attributeId) {
    const entityId = issue.entityFqid?.split("/").pop();
    if (!entityId) return "unknown";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const attr = entity.attrs.get(issue.attributeId.toLowerCase());
    if (!attr) return "resolved";
    return (attr.fields["description"] || "").trim() ? "resolved" : "still";
  }
  if (ruleId === "required/entity-name" && issue.entityFqid) {
    const entityId = issue.entityFqid.split("/").pop() || "";
    const entity = model.entityByLowerId.get(entityId.toLowerCase());
    if (!entity) return "resolved";
    const name = entity.fields["name"];
    return name && name !== entity.id ? "resolved" : "still";
  }

  // ============ linkage ============
  if (ruleId === "linkage/undirected-only-nn" && issue.propertyPath) {
    const lk = findLinkageByPath(model, issue.propertyPath);
    if (!lk) return "resolved";
    const type = (lk.fields["type"] || "").trim();
    const und = (lk.fields["undirected"] || "").toLowerCase();
    if (!type) return "resolved";
    if (und !== "true") return "resolved";
    return type === "n_n" ? "resolved" : "still";
  }
  if (ruleId === "linkage/exclude-on-graph-invalid" && issue.propertyPath) {
    const lk = findLinkageByPath(model, issue.propertyPath);
    if (!lk) return "resolved";
    const v = (lk.fields["excludeOnGraph"] || "").toLowerCase();
    if (!v) return "resolved";
    return v === "true" || v === "false" || v === "off" ? "resolved" : "still";
  }
  if (ruleId === "linkage/name-from-missing" && issue.propertyPath) {
    const lk = findLinkageByPath(model, issue.propertyPath);
    if (!lk) return "resolved";
    const msg = (issue.message || "").toLowerCase();
    if (msg.includes("side1")) return lk.nameFrom.side1 ? "resolved" : "still";
    if (msg.includes("side2")) return lk.nameFrom.side2 ? "resolved" : "still";
    return lk.nameFrom.side1 && lk.nameFrom.side2 ? "resolved" : "still";
  }
  if (ruleId === "linkage/view-iconColor-invalid" && issue.propertyPath) {
    const lk = findLinkageByPath(model, issue.propertyPath);
    if (!lk) return "resolved";
    const c = lk.fields["view.iconColor"];
    if (!c) return "resolved";
    return GRAPH_COLORS.has(c) ? "resolved" : "still";
  }
  if (
    (ruleId === "linkage/side1-unknown" ||
      ruleId === "linkage/side2-unknown") &&
    issue.propertyPath
  ) {
    const lk = findLinkageByPath(model, issue.propertyPath);
    if (!lk) return "resolved";
    const sideKey = ruleId === "linkage/side1-unknown" ? "side1" : "side2";
    const v = lk.fields[sideKey];
    if (!v) return "resolved";
    if (v.includes("/")) return "unknown";
    return localEntityExists(model, v) ? "resolved" : "still";
  }

  // ============ action ============
  if (ruleId === "action/unknown-type" && issue.propertyPath) {
    const m = issue.propertyPath.match(/^actions\[(.+?)\]\.type$/);
    if (!m) return "unknown";
    const t = getActionTypeFromModel(model, m[1]);
    if (!t) return "resolved";
    return KNOWN_ACTION_TYPES.has(t) ? "resolved" : "still";
  }
  if (ruleId === "action/automation-id-invalid" && issue.propertyPath) {
    const m = issue.propertyPath.match(/^actions\[(.+?)\]\./);
    if (!m) return "unknown";
    const act = findActionById(model, m[1]);
    if (!act) return "resolved";
    const id = act.fields["automation.id"];
    if (!id) return "resolved";
    return UUID_RE.test(id) ? "resolved" : "still";
  }

  // ============ counterColorPattern ============
  if (ruleId.startsWith("countercolorpattern/")) {
    const m = issue.propertyPath?.match(/counterColorPatterns\[([^\]]+)\]/);
    if (!m) return "unknown";
    const cc = model.counterColors.get(m[1]);
    if (!cc) return "resolved";

    const validRed =
      COUNTER_TIME_RE.test(cc.red) || COUNTER_PERCENT_RE.test(cc.red);
    const validYellow =
      COUNTER_TIME_RE.test(cc.yellow) || COUNTER_PERCENT_RE.test(cc.yellow);

    if (ruleId === "countercolorpattern/red-format")
      return validRed ? "resolved" : "still";
    if (ruleId === "countercolorpattern/yellow-format")
      return validYellow ? "resolved" : "still";
    if (ruleId === "countercolorpattern/format-mismatch") {
      if (!validRed || !validYellow) return "resolved";
      return cc.red.includes("%") === cc.yellow.includes("%")
        ? "resolved"
        : "still";
    }
    if (ruleId === "countercolorpattern/yellow-gt-red") {
      if (!validRed || !validYellow) return "resolved";
      if (cc.red.includes("%") !== cc.yellow.includes("%")) return "resolved";
      if (cc.red.includes("%")) {
        const r = parseInt(cc.red.replace("%", ""), 10);
        const y = parseInt(cc.yellow.replace("%", ""), 10);
        return y <= r ? "resolved" : "still";
      }
      // время → в минутах
      const parseT = (s: string) => {
        let total = 0;
        for (const mm of s.matchAll(/([1-9][0-9]*)([wdhm])/g)) {
          const n = parseInt(mm[1], 10);
          if (mm[2] === "w") total += n * 10080;
          else if (mm[2] === "d") total += n * 1440;
          else if (mm[2] === "h") total += n * 60;
          else total += n;
        }
        return total;
      };
      return parseT(cc.yellow) <= parseT(cc.red) ? "resolved" : "still";
    }
  }

  return "unknown";
}

/**
 * Проверяет наличие поля `fieldName:` в YAML-блоке item'а с данным `itemId`.
 * Используется для правил вида «поля X не должно быть» — например,
 * `side` у ненаправленной связи, `description` у атрибута.
 *
 * Логика:
 *  1. Находит строку `- id: <itemId>` (или `id: <itemId>` на indent + 2).
 *  2. Считает, что id уникален в файле (View ID / Data ID уникальны в домене —
 *     это требование R-Vision; при дубликате линтер всё равно ругнётся).
 *  3. Идёт до конца блока и ищет `^\s+<fieldName>\s*:`.
 *
 * Возврат:
 *  - "still"    — поле есть в блоке;
 *  - "resolved" — блока нет (элемент удалён) или поля нет;
 *  - "unknown"  — невалидные входные данные.
 */
function fieldExistsInItemBlock(
  model: RecheckModel,
  itemId: string,
  fieldName: string,
): "still" | "resolved" | "unknown" {
  if (!itemId || !fieldName) return "unknown";
  const lines = model.lines;

  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idRe = new RegExp(
    `^(\\s*)(-\\s+)?id\\s*:\\s*["']?${escapedId}["']?\\s*(?:#.*)?$`,
  );

  let startLine = -1;
  let startIndent = -1;
  let isListItem = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(idRe);
    if (!m) continue;
    startLine = i;
    startIndent = m[1].length;
    isListItem = !!m[2];
    break;
  }
  if (startLine < 0) return "resolved"; // элемент удалён

  const fieldRe = new RegExp(`^\\s*${fieldName}\\s*:`);

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // Следующий item на том же уровне → блок закончился
    if (isListItem && ind === startIndent && /^\s*-\s+/.test(line)) {
      return "resolved";
    }
    // Выход на верхний уровень секции → блок закончился
    if (ind <= startIndent && !/^\s*-/.test(line)) {
      return "resolved";
    }

    if (fieldRe.test(line)) return "still";
  }
  return "resolved";
}