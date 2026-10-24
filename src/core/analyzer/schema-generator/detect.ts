import type { EntityRecord, ModelIndex } from "../../../shared/model-types";
import type { RawDomainEntry } from "../model-builder";

export type LinkageWidgetKind = "linkage" | "linkage_list";

export interface LinkageRole {
  linkageId: string;
  side: 1 | 2;
  isSymmetric: boolean;
  isDirected: boolean;
  peerFqid: string;
  peerEntityId: string;
  peerInCurrentDomain: boolean;
  widgetKind: LinkageWidgetKind;
  label: string;
  widgetId: string;
  blockId: string;
  tabId: string;
}

export interface EntityGenerationContext {
  domainId: string;
  entityId: string;
  entity: EntityRecord;

  existing: {
    actions: Set<string>;
    views: Set<string>;
    widgets: Set<string>;
    groups: Set<string>;
    columns: Set<string>;
    menus: Set<string>;
    menuItems: Set<string>;
    medias: Set<string>;
  };

  menuRoots: Array<{ id: string; route: string; type: string }>;
  menuRoot: { id: string; route: string; type: string } | null;

  linkages: LinkageRole[];

  flags: {
    hasPage: boolean;
    isReadonly: boolean;
    hasListUi: boolean;
    isDictionary: boolean;
    hasPanelUi: boolean;
  };
}

function findRawEntityUi(
  rawDomain: RawDomainEntry | undefined,
  entityId: string,
): any {
  const entities = rawDomain?.rawData?.entities;
  if (!Array.isArray(entities)) return null;
  const e = entities.find((x: any) => x?.id === entityId);
  return e?.ui && typeof e.ui === "object" ? e.ui : null;
}

function chooseWidgetKind(
  linkageType: string,
  undirected: boolean | undefined,
  side: 1 | 2,
): LinkageWidgetKind {
  if (linkageType === "n_n") return "linkage_list";
  if (linkageType === "1_n") return side === 1 ? "linkage_list" : "linkage";
  return "linkage";
}

export function detectEntityContext(
  index: ModelIndex,
  allDomains: RawDomainEntry[],
  domainId: string,
  entityId: string,
  menuRootIdOverride?: string,
): EntityGenerationContext | null {
  const fqid = `${domainId}/${entityId}`.toLowerCase();
  const entity = index.entitiesByFqid[fqid];
  if (!entity) return null;

  const domainEntities = index.entities.filter((e) => e.domainId === domainId);
  const existingActions = new Set<string>();
  for (const a of index.actions || []) {
    if (a.domainId === domainId) existingActions.add(a.id);
  }
  const existingViews = new Set<string>();
  const schema = index.schemasByDomain?.[domainId];
  if (schema?.allViews)
    for (const v of schema.allViews) existingViews.add(String(v.id));
  if (schema?.sections?.views?.items)
    for (const v of schema.sections.views.items)
      existingViews.add(String(v.id));

  const existingWidgets = new Set<string>();
  const existingGroups = new Set<string>();
  const existingColumns = new Set<string>();
  for (const w of index.viewWidgets || [])
    if (w.domainId === domainId) existingWidgets.add(w.id);
  for (const g of index.viewGroups || [])
    if (g.domainId === domainId) existingGroups.add(g.id);
  for (const c of index.viewColumns || [])
    if (c.domainId === domainId) existingColumns.add(c.id);

  const existingMenus = new Set<string>();
  const existingMenuItems = new Set<string>();
  const menuRoots: Array<{ id: string; route: string; type: string }> = [];
  for (const m of index.menus || []) {
    if (m.domainId !== domainId) continue;
    existingMenus.add(m.id);
    for (const it of m.items || []) {
      existingMenuItems.add(it.id);
      existingMenus.add(it.id);
    }
    if (m.type === "root_group") {
      menuRoots.push({ id: m.id, route: m.route || "", type: "root_group" });
    }
  }
  const menuRoot =
    menuRoots.find((r) => r.id === menuRootIdOverride) || menuRoots[0] || null;

  const existingMedias = new Set<string>();
  for (const m of index.medias || [])
    if (m.domainId === domainId) existingMedias.add(m.id);

  // linkages
  const linkages: LinkageRole[] = [];
  const fqidLower = entity.fqid.toLowerCase();
  for (const lk of index.entityLinkages || []) {
    let side: 1 | 2 | null = null;
    if (lk.side1Fqid === fqidLower) side = 1;
    else if (lk.side2Fqid === fqidLower) side = 2;
    if (side == null) continue;

    const widgetKind = chooseWidgetKind(lk.type, lk.undirected === true, side);
    const peerFqid = side === 1 ? lk.side2Fqid : lk.side1Fqid;
    const peerEntity = index.entitiesByFqid[peerFqid];
    const peerEntityId =
      peerEntity?.entityId || peerFqid.split("/")[1] || peerFqid;
    const peerInCurrentDomain = peerEntity?.domainId === domainId;

    const rawLabel = side === 1 ? lk.nameFrom?.side1 : lk.nameFrom?.side2;
    const label = rawLabel || lk.name || lk.id;

    linkages.push({
      linkageId: lk.id,
      side,
      isSymmetric: lk.side1Fqid === lk.side2Fqid,
      isDirected: !(lk.type === "n_n" && lk.undirected === true),
      peerFqid,
      peerEntityId,
      peerInCurrentDomain,
      widgetKind,
      label,
      widgetId: `editors_link_${entity.entityId}_${lk.id}`,
      blockId: `blocks_editors_link_${entity.entityId}_${lk.id}`,
      tabId: `tabs_editors_link_${entity.entityId}_${lk.id}`,
    });
  }

  const rawDomain = allDomains.find((d) => d.id === domainId);
  const ui = findRawEntityUi(rawDomain, entity.entityId);
  const isReadonly = ui?.modals === false;
  const hasListUi = ui?.list !== false;
  const hasPage = ui?.page === true;
  const isDictionary = !hasListUi && isReadonly;
  const hasPanelUi = ui?.panel !== false;

  return {
    domainId,
    entityId: entity.entityId,
    entity,
    existing: {
      actions: existingActions,
      views: existingViews,
      widgets: existingWidgets,
      groups: existingGroups,
      columns: existingColumns,
      menus: existingMenus,
      menuItems: existingMenuItems,
      medias: existingMedias,
    },
    menuRoots,
    menuRoot,
    linkages,
    flags: { hasPage, isReadonly, hasListUi, isDictionary, hasPanelUi },
  };
}
