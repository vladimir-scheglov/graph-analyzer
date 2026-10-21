import type {
  DomainSchemaSummary,
  DomainSchemaEntityItem,
  DomainSchemaLinkageItem,
  DomainSchemaDataTypeItem,
  DomainSchemaSequenceItem,
  DomainSchemaActionItem,
  DomainSchemaViewItem,
  DomainSchemaMenuItem,
  DomainSchemaMixinItem,
  DomainSchemaDataRuleItem,
  DomainSchemaCounterColorItem,
  DomainSchemaUiPresetItem,
  DomainSchemaUiRuleItem,
  DomainSchemaTransitiveItem,
  DomainSchemaTreeNode,
  DomainSchemaScenarioItem,
  DomainSchemaAllViewItem,
} from "../../shared/model-types";

function asArray(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

function asString(x: any, fallback = ""): string {
  if (x === null || x === undefined) return fallback;
  return String(x);
}

/**
 * Собирает компактный обзор схемы домена из rawData.
 * Не парсит глубоко — только верхний уровень каждой секции.
 */
export function buildDomainSchemaSummary(
  domainId: string,
  rawData: any,
): DomainSchemaSummary {
  const raw = rawData || {};

  // ============ Metadata ============
  const metadata = {
    id: domainId,
    name: asString(raw.name || domainId),
    version: asString(raw.version || ""),
    author: asString(raw.author || ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    description: asString(raw.description || ""),
    status: raw.status ? String(raw.status) : undefined,
    date: raw.date ? String(raw.date) : undefined,
  };

  // ============ Entities ============
  const entitiesRaw = asArray(raw.entities);
  const entities: DomainSchemaEntityItem[] = entitiesRaw
    .map((e: any) => ({
      id: asString(e?.id),
      name: asString(e?.name || e?.id),
      attributesCount: Array.isArray(e?.attributes) ? e.attributes.length : 0,
      inherits: e?.inherits ? String(e.inherits) : null,
    }))
    .filter((x) => x.id);

  // ============ Linkages ============
  const linkagesRaw = asArray(raw.linkages);
  const linkages: DomainSchemaLinkageItem[] = linkagesRaw
    .map((l: any) => ({
      id: asString(l?.id),
      name: asString(l?.name || l?.id),
      type: asString(l?.type || "n_n"),
      side1: asString(l?.side1),
      side2: asString(l?.side2),
      undirected: l?.undirected === true,
    }))
    .filter((x) => x.id);

  // ============ DataTypes ============
  const dtsRaw = asArray(raw.dataTypes);
  const dataTypes: DomainSchemaDataTypeItem[] = dtsRaw
    .map((d: any) => {
      const item: DomainSchemaDataTypeItem = {
        id: asString(d?.id),
        name: asString(d?.name || d?.id),
        kind: asString(d?.dataType || ""),
      };
      if (Array.isArray(d?.values)) item.valuesCount = d.values.length;
      if (Array.isArray(d?.statuses)) item.statusesCount = d.statuses.length;
      if (Array.isArray(d?.attributes))
        item.attributesCount = d.attributes.length;
      return item;
    })
    .filter((x) => x.id);

  // ============ Sequences ============
  const seqRaw = asArray(raw.sequences);
  const sequences: DomainSchemaSequenceItem[] = seqRaw
    .map((s: any) => {
      const n = Number(s?.startFrom);
      return {
        id: asString(s?.id),
        startFrom: Number.isFinite(n) && n > 0 ? n : 1,
      };
    })
    .filter((x) => x.id);

  // ============ Actions ============
  const actionsRaw = asArray(raw.actions);
  const actions: DomainSchemaActionItem[] = actionsRaw
    .map((a: any) => ({
      id: asString(a?.id),
      name: asString(a?.name || a?.id),
      type: asString(a?.type || ""),
    }))
    .filter((x) => x.id);

  // ============ Views (top-level) ============
  const viewsRaw = asArray(raw.views);
  const views: DomainSchemaViewItem[] = viewsRaw
    .map((v: any) => ({
      id: asString(v?.id),
      type: asString(v?.type || ""),
      entity: v?.entity ? String(v.entity) : undefined,
      label: v?.label ? String(v.label) : undefined,
      isMixin: v?.isMixin === true,
    }))
    .filter((x) => x.id);

  // ============ Menus ============
  const menusRaw = asArray(raw.menus);
  const menus: DomainSchemaMenuItem[] = [];
  menusRaw.forEach((m: any) => {
    if (!m?.id) return;
    menus.push({
      id: asString(m.id),
      route: asString(m.route || ""),
      label: asString(m.label || m.id),
      type: asString(m.type || ""),
      view: m.view ? String(m.view) : undefined,
    });
    // Вложенные items
    if (Array.isArray(m.items)) {
      m.items.forEach((child: any) => {
        if (!child?.id) return;
        menus.push({
          id: asString(child.id),
          route: asString(child.route || ""),
          label: asString(child.label || child.id),
          type: asString(child.type || "menu"),
          view: child.view ? String(child.view) : undefined,
        });
      });
    }
  });

  // ============ Mixins ============
  const mixinsRaw = asArray(raw.mixins);
  const mixins: DomainSchemaMixinItem[] = mixinsRaw
    .map((m: any) => ({
      id: asString(m?.id),
      type: asString(m?.type || "view"),
      entity: asString(m?.entity),
      viewsCount: Array.isArray(m?.views) ? m.views.length : 0,
    }))
    .filter((x) => x.id);

  // ============ DataRules ============
  const rulesRaw = asArray(raw.dataRules);
  const dataRules: DomainSchemaDataRuleItem[] = rulesRaw
    .map((r: any) => ({
      id: asString(r?.id),
      name: asString(r?.name || r?.id),
      entity: r?.entity ? String(r.entity) : undefined,
      effect: r?.rule?.effect ? String(r.rule.effect) : undefined,
    }))
    .filter((x) => x.id);

  // ============ Medias ============
  const mediasRaw = asArray(raw.medias);
  const medias = mediasRaw
    .map((m: any) => ({
      id: asString(m?.id),
      type: asString(m?.type || ""),
      iconName: m?.iconName ? String(m.iconName) : undefined,
    }))
    .filter((x) => x.id);

  // ============ Trees ============
  const treesRaw = asArray(raw.trees);
  const trees: DomainSchemaTreeNode[] = treesRaw
    .map((t: any) => {
      const item: DomainSchemaTreeNode = {
        id: asString(t?.id),
        name: asString(t?.name || t?.id),
        type: asString(t?.type || "ordinary"),
      };
      if (t?.maxDepth != null) item.maxDepth = Number(t.maxDepth);
      if (t?.hierarchy?.entity) item.rootEntity = String(t.hierarchy.entity);
      return item;
    })
    .filter((x) => x.id);

  // ============ Transitive Linkages ============
  const transitiveRaw = asArray(raw.transitiveLinkages);
  const transitiveLinkages: DomainSchemaTransitiveItem[] = transitiveRaw
    .map((t: any) => ({
      id: asString(t?.id),
      name: asString(t?.name || t?.id),
      entity: t?.entity ? String(t.entity) : undefined,
      joinsCount: Array.isArray(t?.joins) ? t.joins.length : 0,
    }))
    .filter((x) => x.id);

  // ============ UI Rules ============
  const uiRulesRaw = asArray(raw.uiRules);
  const uiRules: DomainSchemaUiRuleItem[] = uiRulesRaw
    .map((r: any) => ({
      id: asString(r?.id),
      name: asString(r?.name || r?.id),
      target: asString(r?.target || ""),
      view: r?.view ? String(r.view) : undefined,
      effect: r?.rule?.effect ? String(r.rule.effect) : undefined,
    }))
    .filter((x) => x.id);

  // ============ UI Presets ============
  const uiPresetsRaw = asArray(raw.uiPresets);
  const uiPresets: DomainSchemaUiPresetItem[] = uiPresetsRaw
    .map((p: any) => ({
      id: asString(p?.id),
      name: asString(p?.name || p?.id),
      description: asString(p?.description || ""),
    }))
    .filter((x) => x.id);

  // ============ Counter Color Pattern ============
  const counterColorRaw = asArray(raw.counterColorPattern);
  const counterColorPattern: DomainSchemaCounterColorItem[] = counterColorRaw
    .map((c: any) => ({
      id: asString(c?.id),
      red: asString(c?.red || ""),
      yellow: asString(c?.yellow || ""),
    }))
    .filter((x) => x.id);

  // ============ Scenarios ============
  const scenariosRaw = asArray(raw.actions).filter(
    (a: any) => a?.type === "scenario" && a?.scenario,
  );
  const scenarioMap = new Map<string, DomainSchemaScenarioItem>();
  scenariosRaw.forEach((a: any) => {
    const id = String(a.scenario).trim();
    if (!id) return;
    if (!scenarioMap.has(id)) {
      scenarioMap.set(id, {
        id,
        actionsCount: 0,
        domainsCount: 1, // считается в ModelIndex, здесь ставим текущий домен
        actions: [],
      });
    }
    const item = scenarioMap.get(id)!;
    item.actions.push({
      domainId,
      actionId: String(a.id || ""),
      actionName: String(a.name || a.id || ""),
      workerTag: a.workerTag ? String(a.workerTag) : undefined,
    });
    item.actionsCount++;
  });
  const scenarios: DomainSchemaScenarioItem[] = Array.from(
    scenarioMap.values(),
  );

  // ============ allViews: top-level + nested ============
  const allViews: DomainSchemaAllViewItem[] = [];

  const visitNested = (parent: any, parentViewId: string): void => {
    if (!Array.isArray(parent?.views)) return;
    for (const nv of parent.views) {
      if (!nv?.id) continue;
      allViews.push({
        id: String(nv.id),
        type: String(nv.type || ""),
        parentViewId,
        entity: nv.entity ? String(nv.entity) : undefined,
      });
      visitNested(nv, String(nv.id));
    }
  };

  (viewsRaw || []).forEach((v: any) => {
    if (!v?.id) return;
    allViews.push({
      id: String(v.id),
      type: String(v.type || ""),
      entity: v.entity ? String(v.entity) : undefined,
    });
    visitNested(v, String(v.id));
  });

  return {
    domainId,
    metadata,
    sections: {
      entities: { count: entities.length, items: entities },
      linkages: { count: linkages.length, items: linkages },
      dataTypes: { count: dataTypes.length, items: dataTypes },
      sequences: { count: sequences.length, items: sequences },
      actions: { count: actions.length, items: actions },
      views: { count: views.length, items: views },
      menus: { count: menus.length, items: menus },
      mixins: { count: mixins.length, items: mixins },
      dataRules: { count: dataRules.length, items: dataRules },
      medias: { count: medias.length, items: medias },
      trees: { count: trees.length, items: trees },
      transitiveLinkages: {
        count: transitiveLinkages.length,
        items: transitiveLinkages,
      },
      uiRules: { count: uiRules.length, items: uiRules },
      uiPresets: { count: uiPresets.length, items: uiPresets },
      counterColorPattern: {
        count: counterColorPattern.length,
        items: counterColorPattern,
      },
      scenarios: { count: scenarios.length, items: scenarios },
    },
    flags: {
      hasExchangeSettings: raw.exchangeSettings != null,
      hasCounterColorPattern: raw.counterColorPattern != null,
    },
    allViews,
  };
}
