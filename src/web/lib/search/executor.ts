import type { ModelIndex } from "../../../shared/model-types";
import type { RFNode } from "../types";
import type {
  ModelSearchResult,
  ParsedFilter,
  ParsedQuery,
  SearchOutcome,
} from "./types";
import { globMatch, globContains } from "./glob";
import { parseQuery } from "./parser";

const DEFAULT_LIMIT = 200;

// ============ score ============

function scoreText(haystack: string[], needle: string): number {
  const q = needle.toLowerCase();
  let best = 0;
  for (const s of haystack) {
    const h = s.toLowerCase();
    if (!h) continue;
    if (h === q) best = Math.max(best, 1000);
    else if (h.startsWith(q)) best = Math.max(best, 700);
    else if (h.includes(q)) best = Math.max(best, 400);
  }
  return best;
}

// ============ helpers для отдельных kinds ============

function entityResult(
  e: ModelIndex["entities"][number],
  score: number,
  sublabel?: string,
): ModelSearchResult {
  return {
    kind: "entity",
    key: `entity:${e.fqid}`,
    label: e.entityId,
    sublabel: sublabel ?? `${e.name} · ${e.domainId}`,
    domainId: e.domainId,
    fqid: e.fqid,
    entity: e,
    score,
  };
}

function attributeResult(
  e: ModelIndex["entities"][number],
  a: any,
  score: number,
  sublabel?: string,
): ModelSearchResult {
  return {
    kind: "attribute",
    key: `attribute:${e.fqid}#${a.id}`,
    label: `${e.entityId}.${a.id}`,
    sublabel: sublabel ?? `${a.dataType} · ${e.domainId}`,
    domainId: e.domainId,
    fqid: e.fqid,
    attributeId: a.id,
    entity: e,
    attribute: a,
    score,
  };
}

// ============ Scope ============

function scopeDomains(
  index: ModelIndex,
  filters: ParsedFilter[],
): Set<string> | null {
  const domainFilters = filters.filter(
    (f) => f.field === "domain" || f.field === "namespace",
  );
  if (domainFilters.length === 0) return null;

  const included = new Set<string>();
  const excluded = new Set<string>();
  const domainIds = index.domains.map((d) => d.id);

  for (const f of domainFilters) {
    for (const id of domainIds) {
      const target =
        f.field === "namespace" ? id.split(".").slice(0, 2).join(".") : id;
      if (globMatch(target, f.value) || globContains(id, f.value)) {
        if (f.negate) excluded.add(id);
        else included.add(id);
      }
    }
  }

  const result = new Set<string>();
  if (included.size > 0) {
    for (const d of included) if (!excluded.has(d)) result.add(d);
  } else if (excluded.size > 0) {
    for (const d of domainIds) if (!excluded.has(d)) result.add(d);
  }
  return result;
}

function applyScope(
  results: ModelSearchResult[],
  scope: Set<string> | null,
): ModelSearchResult[] {
  if (!scope) return results;
  return results.filter((r) => r.domainId && scope.has(r.domainId));
}

// ============ Selector handlers ============

type Selector = (f: ParsedFilter, index: ModelIndex) => ModelSearchResult[];

const selectEntity: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const e of index.entities) {
    const score = scoreText([e.entityId, e.name, e.description], f.value);
    if (score > 0) out.push(entityResult(e, score));
  }
  return out;
};

const selectAttribute: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const e of index.entities) {
    for (const a of e.attributes) {
      const score = scoreText([a.id, a.name, a.description], f.value);
      if (score > 0) out.push(attributeResult(e, a, score));
    }
  }
  return out;
};

const selectType: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const want = f.value.toLowerCase();
  for (const e of index.entities) {
    for (const a of e.attributes) {
      if (a.dataType.toLowerCase() !== want) continue;
      out.push(attributeResult(e, a, 500, `${a.dataType} · ${e.domainId}`));
    }
  }
  return out;
};

const selectConstraint: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const want = f.value.toLowerCase();
  for (const e of index.entities) {
    for (const a of e.attributes) {
      if (!a.constraints.some((c) => c.toLowerCase() === want)) continue;
      out.push(
        attributeResult(
          e,
          a,
          500,
          `${a.constraints.join(", ")} · ${e.domainId}`,
        ),
      );
    }
  }
  return out;
};

const selectHas: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const flag = f.value.toLowerCase();

  const entityHas = (e: ModelIndex["entities"][number]): boolean => {
    switch (flag) {
      case "mixin":
      case "mixins":
        return (index.mixinsByEntityFqid[e.fqid] || []).length > 0;
      case "children":
        return (index.entityChildrenByFqid[e.fqid] || []).length > 0;
      case "inherits":
      case "parent":
        return !!e.inherits;
      case "pii":
        return index.pii.hits.some((h) => h.entityFqid === e.fqid);
      case "issues":
        return index.lint.lintReport.issues.some(
          (i) => i.entityFqid === e.fqid,
        );
      case "views": {
        const fqidLower = e.fqid.toLowerCase();
        return Object.values(index.viewElementsByDomain).some(
          (byView) =>
            Object.keys(byView).length > 0 &&
            Object.entries(index.schemasByDomain).some(
              ([domId, schema]) =>
                domId.toLowerCase() === e.domainId.toLowerCase() &&
                (schema.allViews || []).some(
                  (v) =>
                    (v.type === "entity" &&
                      (v.entity || "").toLowerCase() === fqidLower) ||
                    (v.type === "list" &&
                      (v.sourceEntity || "").toLowerCase() === fqidLower),
                ),
            ),
        );
      }
      case "rules":
        return index.dataRules.some((r) => r.entity === e.fqid);
      case "linkages":
        return index.entityLinkages.some(
          (l) => l.side1Fqid === e.fqid || l.side2Fqid === e.fqid,
        );
      case "table":
      case "workflow":
      case "enum":
      case "identifier":
      case "counter":
      case "reference":
      case "attachment": {
        const kind =
          flag === "table"
            ? "Table"
            : flag === "workflow"
              ? "Workflow"
              : flag === "enum"
                ? "Enum"
                : flag === "identifier"
                  ? "Identifier"
                  : flag === "counter"
                    ? "Counter"
                    : flag === "reference"
                      ? "Reference"
                      : "Attachment";
        return e.attributes.some((a) => {
          if (a.dataType === kind) return true;
          if (a.itemDataType === kind) return true;
          if (a.dataTypeKind === "custom") {
            const dt = index.dataTypes.find(
              (d) => d.domainId === e.domainId && d.id === a.dataType,
            );
            if (dt && dt.kind === kind) return true;
          }
          return false;
        });
      }
      case "readonly":
        return e.attributes.some((a) => a.readonly);
      default:
        return false;
    }
  };

  for (const e of index.entities) {
    if (entityHas(e)) out.push(entityResult(e, 300));
  }
  return out;
};

const selectWithout: Selector = (f, index) => {
  const flag = f.value.toLowerCase();
  const out: ModelSearchResult[] = [];
  for (const e of index.entities) {
    let matches = false;
    if (flag === "description") matches = !e.description;
    else if (flag === "label") matches = !e.label;
    else if (
      flag === "views" ||
      flag === "rules" ||
      flag === "issues" ||
      flag === "pii"
    ) {
      // Инверсия has
      const inverted = selectHas(
        { field: "has", value: flag, negate: false },
        index,
      );
      const set = new Set(inverted.map((r) => r.fqid));
      matches = !set.has(e.fqid);
    }
    if (matches) out.push(entityResult(e, 250));
  }
  return out;
};

const selectInherits: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const e of index.entities) {
    if (!e.inherits) continue;
    if (globMatch(e.inherits, f.value) || globContains(e.inherits, f.value)) {
      out.push(entityResult(e, 500));
    }
  }
  return out;
};

const selectRef: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const e of index.entities) {
    for (const a of e.attributes) {
      const t = a.referenceEntity || a.itemReferenceEntity;
      if (!t) continue;
      if (globMatch(t, f.value) || globContains(t, f.value)) {
        out.push(attributeResult(e, a, 500, `→ ${t} · ${e.domainId}`));
      }
    }
  }
  return out;
};

const selectTag: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const e of index.entities) {
    if (e.domainTags.some((t) => globMatch(t, f.value))) {
      out.push(entityResult(e, 300, `тег: ${f.value}`));
    }
  }
  return out;
};

const selectView: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const [domainId, schema] of Object.entries(index.schemasByDomain)) {
    for (const v of schema.allViews || []) {
      const score = scoreText([v.id, v.label || ""], f.value);
      if (score === 0) continue;
      out.push({
        kind: "view",
        key: `view:${domainId}#${v.id}`,
        label: v.id,
        sublabel: `${v.type}${v.parentViewId ? " · nested" : ""} · ${domainId}`,
        domainId,
        viewItem: v,
        score,
      });
    }
  }
  return out;
};

const selectViewType: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const want = f.value.toLowerCase();
  for (const [domainId, schema] of Object.entries(index.schemasByDomain)) {
    for (const v of schema.allViews || []) {
      if ((v.type || "").toLowerCase() !== want) continue;
      out.push({
        kind: "view",
        key: `view:${domainId}#${v.id}`,
        label: v.id,
        sublabel: `${v.type} · ${domainId}`,
        domainId,
        viewItem: v,
        score: 500,
      });
    }
  }
  return out;
};

const selectAction: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const a of index.actions || []) {
    const score = scoreText([a.id, a.name], f.value);
    if (score === 0) continue;
    out.push({
      kind: "action",
      key: `action:${a.domainId}#${a.id}`,
      label: a.id,
      sublabel: `${a.type}${a.entity ? " · " + a.entity.split("/")[1] : ""} · ${a.domainId}`,
      domainId: a.domainId,
      actionRecord: a,
      score,
    });
  }
  return out;
};

const selectActionType: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const want = f.value.toLowerCase();
  for (const a of index.actions || []) {
    if ((a.type || "").toLowerCase() !== want) continue;
    out.push({
      kind: "action",
      key: `action:${a.domainId}#${a.id}`,
      label: a.id,
      sublabel: `${a.type} · ${a.domainId}`,
      domainId: a.domainId,
      actionRecord: a,
      score: 500,
    });
  }
  return out;
};

const selectLinkage: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const l of index.entityLinkages) {
    const score = scoreText([l.id, l.name], f.value);
    if (score === 0) continue;
    out.push({
      kind: "linkage",
      key: `linkage:${l.domainId}#${l.id}`,
      label: l.id,
      sublabel: `${l.type} · ${l.side1Fqid.split("/")[1]} → ${l.side2Fqid.split("/")[1]} · ${l.domainId}`,
      domainId: l.domainId,
      linkage: l,
      score,
    });
  }
  return out;
};

const selectDataType: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const want = f.value.toLowerCase();
  const kinds = new Set(["enum", "workflow", "table"]);
  for (const dt of index.dataTypes) {
    const kindMatch = kinds.has(want) && dt.kind.toLowerCase() === want;
    const score = kindMatch ? 500 : scoreText([dt.id, dt.name], f.value);
    if (score === 0) continue;
    out.push({
      kind: "dataType",
      key: `dataType:${dt.domainId}#${dt.id}`,
      label: dt.id,
      sublabel: `${dt.kind} · ${dt.domainId}`,
      domainId: dt.domainId,
      dataTypeRecord: dt,
      score,
    });
  }
  return out;
};

const selectDataRule: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const r of index.dataRules) {
    const score = scoreText([r.id, r.name], f.value);
    if (score === 0) continue;
    out.push({
      kind: "dataRule",
      key: `dataRule:${r.domainId}#${r.id}`,
      label: r.id,
      sublabel: `${r.effect} · ${r.domainId}`,
      domainId: r.domainId,
      dataRule: r,
      score,
    });
  }
  return out;
};

const selectEffect: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const want = f.value.toLowerCase();
  for (const r of index.dataRules) {
    if (r.effect !== want) continue;
    out.push({
      kind: "dataRule",
      key: `dataRule:${r.domainId}#${r.id}`,
      label: r.id,
      sublabel: `dataRule · ${r.effect} · ${r.domainId}`,
      domainId: r.domainId,
      dataRule: r,
      score: 500,
    });
  }
  for (const r of index.uiRules) {
    if (r.effect !== want) continue;
    out.push({
      kind: "dataRule",
      key: `uiRule:${r.domainId}#${r.id}`,
      label: r.id,
      sublabel: `uiRule · ${r.effect} · ${r.domainId}`,
      domainId: r.domainId,
      score: 500,
    });
  }
  return out;
};

const selectMixin: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const m of index.mixins) {
    const score = scoreText([m.id], f.value);
    if (score === 0) continue;
    out.push({
      kind: "mixin",
      key: `mixin:${m.domainId}#${m.id}`,
      label: m.id,
      sublabel: `${m.type} · ${m.domainId}`,
      domainId: m.domainId,
      mixin: m,
      score,
    });
  }
  return out;
};

const selectMenu: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  for (const m of index.menus) {
    const score = scoreText([m.id, m.label, m.route], f.value);
    if (score > 0) {
      out.push({
        kind: "menu",
        key: `menu:${m.domainId}#${m.id}`,
        label: m.label || m.id,
        sublabel: `${m.route} · ${m.domainId}`,
        domainId: m.domainId,
        menuItem: {
          id: m.id,
          route: m.route,
          label: m.label,
          domainId: m.domainId,
        },
        score,
      });
    }
    for (const it of m.items || []) {
      const s2 = scoreText([it.id, it.label, it.route], f.value);
      if (s2 > 0) {
        out.push({
          kind: "menu",
          key: `menuItem:${m.domainId}#${it.id}`,
          label: it.label || it.id,
          sublabel: `${it.route} · ${m.domainId}`,
          domainId: m.domainId,
          menuItem: {
            id: it.id,
            route: it.route,
            label: it.label,
            domainId: m.domainId,
          },
          score: s2,
        });
      }
    }
  }
  return out;
};

const selectPii: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const want = f.value.toLowerCase();
  const severities = new Set(["critical", "high", "medium", "low"]);
  for (const h of index.pii.hits) {
    if (severities.has(want) && h.severity !== want) continue;
    if (!severities.has(want) && !h.attributeId.toLowerCase().includes(want))
      continue;
    out.push({
      kind: "pii",
      key: `pii:${h.key}`,
      label: `${h.entityFqid.split("/")[1]}.${h.attributeId}`,
      sublabel: `${h.severity} · ${h.category} · ${h.entityFqid.split("/")[0]}`,
      domainId: h.entityFqid.split("/")[0],
      fqid: h.entityFqid,
      attributeId: h.attributeId,
      piiHit: h,
      score:
        h.severity === "critical" ? 900 : h.severity === "high" ? 700 : 400,
    });
  }
  return out;
};

const selectLint: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const want = f.value.toLowerCase();
  const severities = new Set(["error", "warning", "info"]);
  for (const issue of index.lint.lintReport.issues) {
    const sevMatch = severities.has(want) && issue.severity === want;
    const ruleMatch =
      !severities.has(want) &&
      (issue.ruleId.toLowerCase().includes(want) ||
        issue.rule.toLowerCase().includes(want));
    if (!sevMatch && !ruleMatch) continue;
    out.push({
      kind: "lint",
      key: `lint:${issue.domainId}#${issue.ruleId}#${issue.message.slice(0, 40)}`,
      label: issue.rule,
      sublabel: `${issue.severity} · ${issue.domainId}${issue.entityFqid ? " · " + issue.entityFqid.split("/")[1] : ""}`,
      domainId: issue.domainId,
      lintIssue: issue,
      score:
        issue.severity === "error"
          ? 900
          : issue.severity === "warning"
            ? 600
            : 300,
    });
  }
  return out;
};

const selectFqid: Selector = (f, index) => {
  const out: ModelSearchResult[] = [];
  const raw = f.value.toLowerCase();
  if (raw.includes("/")) {
    // Прямой FQID — возвращаем сущность целиком.
    const e = index.entitiesByFqid[raw];
    if (e) out.push(entityResult(e, 1000));
  } else {
    // Просто id — по всем доменам
    for (const e of index.entities) {
      if (globMatch(e.fqid, f.value) || globContains(e.fqid, f.value)) {
        out.push(entityResult(e, 800));
      }
    }
  }
  return out;
};

const SELECTORS: Record<string, Selector> = {
  entity: selectEntity,
  attr: selectAttribute,
  attribute: selectAttribute,
  type: selectType,
  constraint: selectConstraint,
  has: selectHas,
  without: selectWithout,
  inherits: selectInherits,
  ref: selectRef,
  tag: selectTag,
  view: selectView,
  viewtype: selectViewType,
  action: selectAction,
  actiontype: selectActionType,
  linkage: selectLinkage,
  datatype: selectDataType,
  datarule: selectDataRule,
  effect: selectEffect,
  mixin: selectMixin,
  menu: selectMenu,
  pii: selectPii,
  lint: selectLint,
  fqid: selectFqid,
};

// ============ Plain search ============

function plainSearch(
  tokens: string[],
  index: ModelIndex,
  nodes: RFNode[],
): ModelSearchResult[] {
  if (tokens.length === 0) return [];
  const out: ModelSearchResult[] = [];

  // Домены
  for (const node of nodes) {
    if (node.data.nodeType !== "domain") continue;
    const score = scoreText(
      [
        node.data.domainId,
        node.data.name || "",
        node.data.description || "",
        ...(node.data.tags || []),
      ],
      tokens[0],
    );
    if (score === 0) continue;
    // Все токены — AND
    const allMatch = tokens.every(
      (t) =>
        scoreText(
          [
            node.data.domainId,
            node.data.name || "",
            node.data.description || "",
            ...(node.data.tags || []),
          ],
          t,
        ) > 0,
    );
    if (!allMatch) continue;
    out.push({
      kind: "domain",
      key: `domain:${node.data.domainId}`,
      label: node.data.domainId,
      sublabel: node.data.name,
      domainId: node.data.domainId,
      node,
      score,
    });
  }

  // Сущности и атрибуты
  for (const e of index.entities) {
    const eScore = tokens.reduce(
      (s, t) => Math.min(s, scoreText([e.entityId, e.name, e.description], t)),
      Infinity,
    );
    if (eScore > 0 && Number.isFinite(eScore)) {
      out.push(entityResult(e, eScore));
    }
    for (const a of e.attributes) {
      const aScore = tokens.reduce(
        (s, t) => Math.min(s, scoreText([a.id, a.name, a.description], t)),
        Infinity,
      );
      if (aScore > 0 && Number.isFinite(aScore)) {
        out.push(attributeResult(e, a, Math.min(aScore, 300)));
      }
    }
  }

  // Views
  for (const [domainId, schema] of Object.entries(index.schemasByDomain)) {
    for (const v of schema.allViews || []) {
      const score = tokens.reduce(
        (s, t) => Math.min(s, scoreText([v.id, v.label || ""], t)),
        Infinity,
      );
      if (score > 0 && Number.isFinite(score)) {
        out.push({
          kind: "view",
          key: `view:${domainId}#${v.id}`,
          label: v.id,
          sublabel: `${v.type} · ${domainId}`,
          domainId,
          viewItem: v,
          score: Math.min(score, 300),
        });
      }
    }
  }

  return out;
}

// ============ Intersect / filter ============

function entitySetOf(list: ModelSearchResult[]): Set<string> {
  const s = new Set<string>();
  for (const r of list) if (r.fqid) s.add(r.fqid.toLowerCase());
  return s;
}

function intersect(a: ModelSearchResult[], b: ModelSearchResult[]) {
  const aAttr = a.some((r) => r.kind === "attribute");
  const bAttr = b.some((r) => r.kind === "attribute");

  // обе стороны — entity-уровня → обычное пересечение по ключу
  if (!aAttr && !bAttr) {
    const bMap = new Map(b.map((r) => [r.key, r]));
    return a
      .filter((ra) => bMap.has(ra.key))
      .map((ra) => ({
        ...ra,
        score: Math.max(ra.score, bMap.get(ra.key)!.score),
      }));
  }

  // одна сторона — attributes, другая — entities:
  // сохраняем attributes, фильтруем по fqid-множеству entity-результатов
  const attrSide = aAttr ? a : b;
  const entSide = aAttr ? b : a;
  const allowed = entitySetOf(entSide);
  return attrSide.filter((r) => r.fqid && allowed.has(r.fqid.toLowerCase()));
}

function applyPlainFilter(
  results: ModelSearchResult[],
  tokens: string[],
): ModelSearchResult[] {
  if (tokens.length === 0) return results;
  return results.filter((r) =>
    tokens.every((t) => scoreText([r.label, r.sublabel || ""], t) > 0),
  );
}

// ============ Executor ============

const SCOPE_FIELDS = new Set(["domain", "namespace"]);

export function executeSearch(
  rawQuery: string,
  index: ModelIndex,
  nodes: RFNode[],
  limit: number = DEFAULT_LIMIT,
): SearchOutcome {
  const parsed = parseQuery(rawQuery);
  const scopeFilters = parsed.filters.filter((f) => SCOPE_FIELDS.has(f.field));
  const selectorFilters = parsed.filters.filter(
    (f) => !SCOPE_FIELDS.has(f.field),
  );

  if (
    parsed.plainTokens.length === 0 &&
    selectorFilters.length === 0 &&
    scopeFilters.length === 0
  ) {
    return { results: [], total: 0, truncated: false, error: null, parsed, ready: true };
  }

  const scope = scopeDomains(index, scopeFilters);

  // Только domain:foo → показать домены.
  if (
    selectorFilters.length === 0 &&
    parsed.plainTokens.length === 0 &&
    scopeFilters.length > 0
  ) {
    const results: ModelSearchResult[] = [];
    for (const node of nodes) {
      if (node.data.nodeType !== "domain") continue;
      if (scope && !scope.has(node.data.domainId)) continue;
      results.push({
        kind: "domain",
        key: `domain:${node.data.domainId}`,
        label: node.data.domainId,
        sublabel: node.data.name,
        domainId: node.data.domainId,
        node,
        score: 500,
      });
    }
    return {
      results: results.slice(0, limit),
      total: results.length,
      truncated: results.length > limit,
      error: null,
      parsed,
      ready: true,
    };
  }

  // Обычный путь
  let candidates: ModelSearchResult[] | null = null;
  for (const f of selectorFilters) {
    const selector = SELECTORS[f.field];
    if (!selector) continue;
    const results = selector(f, index);
    const filtered = f.negate
      ? // Отрицание: берём базовый набор («все X») и вычитаем
        selector({ ...f, negate: false }, index).length > 0
        ? // уже отсортировано; инверсия — все, кроме этого
          buildNegative(f, index)
        : []
      : results;
    candidates =
      candidates === null ? filtered : intersect(candidates, filtered);
    if (candidates.length === 0) break;
  }

  if (candidates === null) {
    candidates = plainSearch(parsed.plainTokens, index, nodes);
  } else if (parsed.plainTokens.length > 0) {
    candidates = applyPlainFilter(candidates, parsed.plainTokens);
  }

  candidates = applyScope(candidates, scope);

  // Дедупликация (на случай overlap entity/attr из разных фильтров)
  const seen = new Set<string>();
  const deduped: ModelSearchResult[] = [];
  for (const r of candidates) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    deduped.push(r);
  }

  deduped.sort((a, b) => b.score - a.score);
  return {
    results: deduped.slice(0, limit),
    total: deduped.length,
    truncated: deduped.length > limit,
    error: null,
    parsed,
    ready: true,
  };
}

/** Отрицание: все объекты типа, кроме совпавших. */
function buildNegative(
  f: ParsedFilter,
  index: ModelIndex,
): ModelSearchResult[] {
  const positive = SELECTORS[f.field]({ ...f, negate: false }, index);
  const excludeKeys = new Set(positive.map((r) => r.key));

  // Определяем базовый набор по полю
  const base: ModelSearchResult[] = [];
  switch (f.field) {
    case "entity":
    case "inherits":
    case "has":
    case "without":
    case "tag":
      for (const e of index.entities) {
        if (!excludeKeys.has(`entity:${e.fqid}`))
          base.push(entityResult(e, 200));
      }
      break;
    case "attr":
    case "attribute":
    case "type":
    case "constraint":
      for (const e of index.entities) {
        for (const a of e.attributes) {
          const key = `attribute:${e.fqid}#${a.id}`;
          if (!excludeKeys.has(key)) base.push(attributeResult(e, a, 200));
        }
      }
      break;
    default:
      break;
  }
  return base;
}
