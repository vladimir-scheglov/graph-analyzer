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
  DomainSchemaLocalizationItem,
  DomainSchemaAccessRuleItem,
  DomainSchemaPermissionItem,
  DomainSchemaWidgetItem,
  DomainSchemaExchangeSettingsItem,
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
    .map((v: any) => {
      const item: DomainSchemaViewItem = {
        id: asString(v?.id),
        type: asString(v?.type || ""),
        entity: v?.entity ? String(v.entity) : undefined,
        label: v?.label ? String(v.label) : undefined,
        isMixin: v?.isMixin === true,
      };
      if (v?.type === "list") {
        if (!v?.source || typeof v.source !== "object") {
          item.sourceMissing = true;
        } else {
          if (v.source.entity) {
            item.sourceEntity = String(v.source.entity);
          } else {
            item.sourceEntityMissing = true;
          }
          if (v.source.type) {
            item.sourceType = String(v.source.type);
          } else {
            item.sourceTypeMissing = true;
          }
        }
      }
      if (v?.label) item.label = String(v.label);
      if (v?.type === "tree" && typeof v?.tree === "string" && v.tree) {
        item.tree = String(v.tree);
      }

      // ============ tree-view (chunk size / ordering / variant) ============
      if (v?.type === "tree") {
        if (typeof v.nodeChunkSize === "number") {
          item.nodeChunkSize = v.nodeChunkSize;
        }
        if (typeof v.ordering === "boolean") {
          item.ordering = v.ordering;
        }
        if (typeof v.variant === "string" && v.variant) {
          item.variant = v.variant;
        }
      }

      // ============ tabs_list ============
      if (v?.type === "tabs_list") {
        if (Array.isArray(v.tabs)) {
          const tabs: string[] = [];
          for (const t of v.tabs) {
            if (typeof t === "string") tabs.push(t);
            else if (t && typeof t === "object" && typeof t.view === "string") {
              tabs.push(t.view);
            }
          }
          if (tabs.length > 0) item.tabs = tabs;
        }
        if (typeof v.defaultTab === "string" && v.defaultTab) {
          item.defaultTab = v.defaultTab;
        }
      }

      // ============ dashboard ============
      if (v?.type === "dashboard") {
        if (Array.isArray(v.widgets)) {
          const ws: string[] = [];
          for (const w of v.widgets) {
            if (typeof w === "string") {
              ws.push(w);
            } else if (w && typeof w === "object") {
              const ref = (w as any).widget;
              if (typeof ref === "string") ws.push(ref);
              else if (
                ref &&
                typeof ref === "object" &&
                typeof ref.id === "string"
              ) {
                ws.push(ref.id);
              }
            }
          }
          if (ws.length > 0) item.dashboardWidgets = ws;
        }
        if (v.layout && typeof v.layout === "object") {
          const layout: { type: string; columns?: number } = {
            type: asString(v.layout.type || "grid"),
          };
          if (typeof v.layout.columns === "number") {
            layout.columns = v.layout.columns;
          }
          item.layout = layout;
        }
      }

      // ============ dashboard_tree ============
      if (v?.type === "dashboard_tree") {
        if (Array.isArray(v.tree)) {
          const collectTree = (
            nodes: any[],
          ): {
            views: string[];
            autoTrees: string[];
            hasAutoTree: boolean;
            hasChildren: boolean;
          } => {
            const out: string[] = [];
            const autoTrees: string[] = [];
            let hasAutoTree = false;
            let hasChildren = false;
            for (const n of nodes) {
              if (!n || typeof n !== "object") continue;
              if (typeof n.view === "string") out.push(n.view);
              if (n.autoTree && typeof n.autoTree.entity === "string") {
                hasAutoTree = true;
                const fqid = n.autoTree.entity;
                autoTrees.push(fqid.includes("/") ? fqid.toLowerCase() : fqid);
              }
              if (Array.isArray(n.children) && n.children.length > 0) {
                hasChildren = true;
                const sub = collectTree(n.children);
                out.push(...sub.views);
                autoTrees.push(...sub.autoTrees);
                if (sub.hasAutoTree) hasAutoTree = true;
                if (sub.hasChildren) hasChildren = true;
              }
            }
            return { views: out, autoTrees, hasAutoTree, hasChildren };
          };
          const {
            views: treeViews,
            autoTrees,
            hasAutoTree,
            hasChildren,
          } = collectTree(v.tree);
          if (treeViews.length > 0) item.dashboardTreeViews = treeViews;
          if (autoTrees.length > 0) {
            item.dashboardTreeAutoTreeEntities = autoTrees;
          }
          if (hasAutoTree) item.dashboardTreeHasAutoTree = true;
          if (hasChildren) item.dashboardTreeHasChildren = true;
        }
        if (typeof v.defaultItem === "string" && v.defaultItem) {
          item.defaultItem = v.defaultItem;
        }
      }

      return item;
    })
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
    .map((r: any) => {
      const item: DomainSchemaUiRuleItem = {
        id: asString(r?.id),
        name: asString(r?.name || r?.id),
        target: asString(r?.target || ""),
        view: r?.view ? String(r.view) : undefined,
        effect: r?.rule?.effect ? String(r.rule.effect) : undefined,
      };
      if (Array.isArray(r?.operations) && r.operations.length > 0) {
        item.operations = r.operations.map(String);
      }
      return item;
    })
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
  // Zod ожидает `counterColorPatterns`, docs — `counterColorPattern`.
  // Поддерживаем оба варианта, чтобы analyzer не терял данные в любом случае.
  const counterColorRaw = asArray(
    (raw as any).counterColorPattern ?? (raw as any).counterColorPatterns,
  );
  const counterColorPattern: DomainSchemaCounterColorItem[] = counterColorRaw
    .map((c: any) => ({
      id: asString(c?.id),
      red: asString(c?.red || ""),
      yellow: asString(c?.yellow || ""),
    }))
    .filter((x) => x.id);

  // ============ Permissions ============
  const permissionsRaw = asArray(raw.permissions);
  const permissions: DomainSchemaPermissionItem[] = permissionsRaw
    .map((p: any) => {
      const item: DomainSchemaPermissionItem = { id: asString(p?.id) };
      if (p?.name) item.name = String(p.name);
      if (p?.description) item.description = String(p.description);
      return item;
    })
    .filter((x) => x.id);

  // ============ AccessRules ============
  // У accessRules нет своего id — генерируем синтетический по индексу.
  const accessRulesRaw = asArray(raw.accessRules);
  const accessRules: DomainSchemaAccessRuleItem[] = accessRulesRaw.map(
    (r: any, idx: number) => {
      const item: DomainSchemaAccessRuleItem = {
        id: `accessRules[${idx}]`,
        target: asString(r?.target || ""),
      };
      if (r?.entity) item.entity = String(r.entity);
      if (r?.linkage) item.linkage = String(r.linkage);
      if (r?.id) item.actionId = String(r.id);
      return item;
    },
  );

  // ============ Localizations ============
  const localizationsRaw = asArray(raw.localizations);
  const localizations: DomainSchemaLocalizationItem[] = localizationsRaw
    .map((loc: any) => {
      const language = asString(loc?.language || "");
      if (!language) return null;
      return {
        id: language,
        language,
        keysCount: Array.isArray(loc?.keys) ? loc.keys.length : 0,
      } as DomainSchemaLocalizationItem;
    })
    .filter((x): x is DomainSchemaLocalizationItem => x !== null);

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

  // ============ Domain Widgets ============
  // Может быть массивом (плоский список доменных виджетов).
  const widgetsRaw = asArray(raw.widgets);
  const widgets: DomainSchemaWidgetItem[] = widgetsRaw
    .map((w: any) => ({
      id: asString(w?.id),
      type: asString(w?.type || ""),
      description: asString(w?.description || ""),
      label: typeof w?.label === "string" ? w.label : undefined,
    }))
    .filter((x) => x.id);

  // ============ exchangeSettings ============
  const esRaw = raw.exchangeSettings;
  const exchangeSettingsItems: DomainSchemaExchangeSettingsItem[] = [];
  if (esRaw && typeof esRaw === "object") {
    const entitiesRaw = esRaw.entities;
    const entitiesCount =
      entitiesRaw && typeof entitiesRaw === "object"
        ? Object.keys(entitiesRaw).length
        : 0;
    const item: DomainSchemaExchangeSettingsItem = {
      enable: esRaw.enable !== false,
      entitiesCount,
      noCmsSync: esRaw.noCmsSync === true,
    };
    if (typeof esRaw.label === "string" && esRaw.label) {
      item.label = esRaw.label;
    }
    if (esRaw.attributeFormats && typeof esRaw.attributeFormats === "object") {
      const af: Record<string, string> = {};
      for (const k of ["Date", "Time", "Timestamp", "TimestampRange"]) {
        const v = (esRaw.attributeFormats as any)[k];
        if (typeof v === "string" && v) af[k] = v;
      }
      if (Object.keys(af).length > 0) {
        item.attributeFormats = af as any;
      }
    }
    // Секция имеет смысл как «есть одна запись», а не массив.
    exchangeSettingsItems.push(item);
  }

  // ============ allViews: top-level + nested ============
  const allViews: DomainSchemaAllViewItem[] = [];

  const extractActionPanelWidgets = (view: any): string[] => {
    if (!Array.isArray(view?.actionPanel)) return [];
    const out: string[] = [];
    for (const ap of view.actionPanel) {
      if (typeof ap === "string" && ap) {
        out.push(ap);
        continue;
      }
      if (ap && typeof ap === "object" && typeof ap.widget === "string") {
        out.push(ap.widget);
      }
    }
    return out;
  };

  const visitNested = (parent: any, parentViewId: string): void => {
    if (!Array.isArray(parent?.views)) return;
    for (const nv of parent.views) {
      if (!nv?.id) continue;

      const item: DomainSchemaAllViewItem = {
        id: String(nv.id),
        type: String(nv.type || ""),
        parentViewId,
        entity: nv.entity ? String(nv.entity) : undefined,
      };

      if (nv.type === "modal" && typeof nv.form === "string" && nv.form) {
        item.form = nv.form;
      }

      if (nv.label) item.label = String(nv.label);
      if (
        nv.type === "page" &&
        typeof nv.menuItem === "string" &&
        nv.menuItem
      ) {
        item.menuItem = nv.menuItem;
      }

      if (nv.type === "page") {
        if (typeof nv.block === "string" && nv.block) item.block = nv.block;
        if (Array.isArray(nv.tabs)) {
          const tabs = nv.tabs
            .map((t: any) =>
              t && typeof t === "object" && typeof t.tab === "string"
                ? t.tab
                : null,
            )
            .filter((x: string | null): x is string => !!x);
          if (tabs.length > 0) item.tabs = tabs;
        }
        if (nv.pinnedView?.block) {
          item.pinnedBlock = String(nv.pinnedView.block);
        }
      }

      const apWidgets = extractActionPanelWidgets(nv);
      if (apWidgets.length > 0) item.actionPanelWidgets = apWidgets;

      allViews.push(item);
      visitNested(nv, String(nv.id));
    }
  };

  (viewsRaw || []).forEach((v: any) => {
    if (!v?.id) return;

    const item: DomainSchemaAllViewItem = {
      id: String(v.id),
      type: String(v.type || ""),
      entity: v.entity ? String(v.entity) : undefined,
    };

    if (v.type === "list" && v?.source?.entity) {
      item.sourceEntity = String(v.source.entity);
    }

    const apWidgets = extractActionPanelWidgets(v);
    if (apWidgets.length > 0) item.actionPanelWidgets = apWidgets;

    allViews.push(item);
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
      permissions: { count: permissions.length, items: permissions },
      accessRules: { count: accessRules.length, items: accessRules },
      localizations: { count: localizations.length, items: localizations },
      widgets: { count: widgets.length, items: widgets },
      exchangeSettings: {
        count: exchangeSettingsItems.length,
        items: exchangeSettingsItems,
      },
    },
    flags: {
      hasExchangeSettings: raw.exchangeSettings != null,
      hasCounterColorPattern: raw.counterColorPattern != null,
    },
    allViews,
  };
}
