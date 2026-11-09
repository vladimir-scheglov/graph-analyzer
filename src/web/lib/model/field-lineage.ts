import type {
  ActionRecord,
  DataRuleRecord,
  EntityRecord,
  ModelIndex,
  UiRuleRecord,
  ViewWidgetRecord,
  ViewColumnRecord,
} from "../../../shared/model-types";

import type { DomainSchemaAllViewItem } from "../../../shared/model-types";

export interface FieldUsage {
  kind:
    | "widget"
    | "column"
    | "filter"
    | "sorting"
    | "searching"
    | "dataRule"
    | "uiRule"
    | "action"
    | "projection"
    | "identification"
    | "reconciliation"
    | "prefixRule"
    | "treeSorting";
  domainId: string;
  /** Что именно — viewId, ruleId, actionId, или FQID родителя. */
  containerId: string;
  /** Строка объявления (если известна по LineMap — заполняется в UI). */
  line?: number;
  label: string;
  detail?: string;
}

export interface FieldLineage {
  entityFqid: string;
  attributeId: string;
  usages: FieldUsage[];
  byKind: Record<FieldUsage["kind"], FieldUsage[]>;
  /** «Сколько всего» — для бейджа. */
  total: number;
}

const EMPTY_BY_KIND = (): Record<FieldUsage["kind"], FieldUsage[]> => ({
  widget: [],
  column: [],
  filter: [],
  sorting: [],
  searching: [],
  dataRule: [],
  uiRule: [],
  action: [],
  projection: [],
  identification: [],
  reconciliation: [],
  prefixRule: [],
  treeSorting: [],
});

/**
 * Возвращает резолвер (domainId, viewId) → entityFqid (lowercase).
 * Резолвит nested views (panel/modal/page) через parentViewId.
 * Кэшируется per-ModelIndex.
 */
const owningEntityCache = new WeakMap<
  ModelIndex,
  (domainId: string, viewId: string) => string | null
>();

function getOwningEntityResolver(index: ModelIndex) {
  const cached = owningEntityCache.get(index);
  if (cached) return cached;

  const byDomain = new Map<string, Map<string, DomainSchemaAllViewItem>>();
  for (const [domId, schema] of Object.entries(index.schemasByDomain || {})) {
    const m = new Map<string, DomainSchemaAllViewItem>();
    for (const v of schema.allViews || []) {
      if (v.id) m.set(v.id, v);
    }
    byDomain.set(domId.toLowerCase(), m);
  }

  const memo = new Map<string, string | null>();
  const resolver = (domainId: string, viewId: string): string | null => {
    if (!domainId || !viewId) return null;
    const key = `${domainId.toLowerCase()}#${viewId}`;
    if (memo.has(key)) return memo.get(key)!;

    const views = byDomain.get(domainId.toLowerCase());
    if (!views) {
      memo.set(key, null);
      return null;
    }

    let curId: string | undefined = viewId;
    const seen = new Set<string>();
    while (curId && !seen.has(curId)) {
      seen.add(curId);
      const v = views.get(curId);
      if (!v) break;
      const ent = v.entity || v.sourceEntity;
      if (ent) {
        const result = ent.includes("/")
          ? ent.toLowerCase()
          : `${domainId.toLowerCase()}/${ent.toLowerCase()}`;
        memo.set(key, result);
        return result;
      }
      curId = v.parentViewId;
    }
    memo.set(key, null);
    return null;
  };

  owningEntityCache.set(index, resolver);
  return resolver;
}

/**
 * Собирает все места, где атрибут реально используется. Дополняет
 * `attribute.usedInViews / usedInRules`, показывая КОНКРЕТНЫЕ места.
 */
export function computeFieldLineage(
  entityFqid: string,
  attributeId: string,
  index: ModelIndex,
): FieldLineage {
  const entity = index.entitiesByFqid[entityFqid.toLowerCase()];
  if (!entity) {
    return {
      entityFqid,
      attributeId,
      usages: [],
      byKind: EMPTY_BY_KIND(),
      total: 0,
    };
  }

  const usages: FieldUsage[] = [];
  const entityIdLower = entity.fqid.toLowerCase();
  const attrLower = attributeId.toLowerCase();

  const matchesEntity = (raw: string | null | undefined): boolean => {
    if (!raw) return false;
    const s = String(raw).toLowerCase();
    return s === entityIdLower || s === entity.entityId.toLowerCase();
  };

  // ── widgets / columns / filters / sorting ──
  const resolveOwner = getOwningEntityResolver(index);
  const targetFqid = entity.fqid.toLowerCase();

  for (const w of index.viewWidgets || []) {
    if (!w.attribute || w.attribute.toLowerCase() !== attrLower) continue;
    const ownerFqid = resolveOwner(w.domainId, w.parentViewId);
    if (ownerFqid !== targetFqid) continue;
    usages.push({
      kind: "widget",
      domainId: w.domainId,
      containerId: w.parentViewId,
      label: `view ${w.parentViewId} › widget ${w.id}`,
      detail: w.type,
    });
  }

  for (const c of index.viewColumns || []) {
    if (!c.attribute || c.attribute.toLowerCase() !== attrLower) continue;
    const ownerFqid = resolveOwner(c.domainId, c.viewId);
    if (ownerFqid !== targetFqid) continue;
    usages.push({
      kind: "column",
      domainId: c.domainId,
      containerId: c.viewId,
      label: `view ${c.viewId} › column ${c.id}`,
    });
  }

  for (const f of index.viewTableFilters || []) {
    if (!f.attributes.some((a) => a.attribute.toLowerCase() === attrLower))
      continue;
    const ownerFqid = resolveOwner(f.domainId, f.viewId);
    if (ownerFqid !== targetFqid) continue;
    usages.push({
      kind: "filter",
      domainId: f.domainId,
      containerId: f.viewId,
      label: `view ${f.viewId} › filter`,
    });
  }

  // sorting / searching / projection / identification / reconciliation
  // лежат внутри EntityRecord — они уже «про эту» сущность
  for (const s of entity.sorting || []) {
    if (s.by.some((b) => b.attribute.toLowerCase() === attrLower)) {
      usages.push({
        kind: "sorting",
        domainId: entity.domainId,
        containerId: entity.fqid,
        label: `sorting ${s.id}`,
      });
    }
  }
  for (const s of entity.searching || []) {
    if (s.attribute.toLowerCase() === attrLower) {
      usages.push({
        kind: "searching",
        domainId: entity.domainId,
        containerId: entity.fqid,
        label: `searching › ${s.attribute}`,
      });
    }
  }
  for (const p of entity.projection || []) {
    if (p.attribute.toLowerCase() === attrLower) {
      usages.push({
        kind: "projection",
        domainId: entity.domainId,
        containerId: entity.fqid,
        label: `projection › ${p.attribute}`,
      });
    }
  }

  // ── dataRules ──
  for (const r of index.dataRules || []) {
    if (!matchesEntity(r.entity)) continue;
    const hit =
      r.attribute?.toLowerCase() === attrLower ||
      (r.attributes || []).some(
        (a) => a.attribute.toLowerCase() === attrLower,
      ) ||
      (r.nested?.type === "table" &&
        (r.nested.attributes || []).some(
          (a) => a.attribute.toLowerCase() === attrLower,
        ));
    if (hit) {
      usages.push({
        kind: "dataRule",
        domainId: r.domainId,
        containerId: r.id,
        label: `dataRule ${r.id}`,
        detail: r.effect,
      });
    }
  }

  // ── uiRules ──
  for (const r of index.uiRules || []) {
    const inCondition = new RegExp(`@doc\\.${attrLower}\\b`, "i").test(
      r.condition || "",
    );
    const inWidgets = r.widgets.some((w) =>
      w.widget.toLowerCase().endsWith(`_${attrLower}`),
    );
    if (inCondition || inWidgets) {
      usages.push({
        kind: "uiRule",
        domainId: r.domainId,
        containerId: r.id,
        label: `uiRule ${r.id}`,
        detail: inCondition ? "condition" : "widgets",
      });
    }
  }

  // ── actions ──
  for (const a of index.actions || []) {
    if (!matchesEntity(a.entity)) continue;
    const hit = (a.values || []).some(
      (v) => v.attribute.toLowerCase() === attrLower,
    );
    if (hit) {
      usages.push({
        kind: "action",
        domainId: a.domainId,
        containerId: a.id,
        label: `action ${a.id}`,
        detail: a.type,
      });
    }
  }

  // ── группировка ──
  const byKind = EMPTY_BY_KIND();
  for (const u of usages) byKind[u.kind].push(u);

  return {
    entityFqid: entity.fqid,
    attributeId,
    usages,
    byKind,
    total: usages.length,
  };
}
