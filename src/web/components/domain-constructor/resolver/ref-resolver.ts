/**
 * Резолвер ссылок по ModelIndex.
 *
 * ModelIndex приходит из shared/model-types.ts — здесь используем
 * минимальный интерфейс, чтобы не тянуть весь пакет типов.
 */

export interface ModelIndexLike {
  generatedAt: string;
  domains: Array<{ id: string; name: string; version: string }>;
  entitiesByFqid: Record<string, unknown>;
  entityChildrenByFqid: Record<string, string[]>;
  mixinsByEntityFqid: Record<string, unknown[]>;
  entityLinkages: Array<{
    id: string;
    domainId: string;
    side1Fqid: string;
    side2Fqid: string;
    type: string;
    undirected?: boolean;
    attributes?: Array<{ id: string; dataType: string }>;
  }>;
  dataTypes: Array<{ id: string; domainId: string; kind: string }>;
  actionsById: Record<string, unknown>;
  viewElementsByDomain: Record<string, Record<string, unknown>>;
  schemasByDomain: Record<
    string,
    {
      sections: {
        views: { items: Array<{ id: string; type: string; entity?: string, label?: string }> };
      };
      allViews?: Array<{
        id: string;
        type: string;
        entity?: string;
        parentViewId?: string;
      }>;
    }
  >;
  viewWidgets: Array<{
    id: string;
    domainId: string;
    parentViewId: string;
    type: string;
  }>;
  viewGroups: Array<{
    id: string;
    domainId: string;
    parentViewId: string;
    type: string;
  }>;
}

// ============ Утилиты ============

export function normalizeFqid(fqid: string): string {
  return fqid.toLowerCase();
}

export function splitFqid(
  fqid: string,
): { domainId: string; entityId: string } | null {
  const norm = normalizeFqid(fqid);
  const slash = norm.indexOf("/");
  if (slash < 0) return null;
  return { domainId: norm.slice(0, slash), entityId: norm.slice(slash + 1) };
}

export function makeFqid(domainId: string, entityId: string): string {
  return `${normalizeFqid(domainId)}/${entityId}`.toLowerCase();
}

// ============ Публичный API ============

export class RefResolver {
  constructor(private modelIndex: ModelIndexLike) {}

  // --- Домены ---

  hasDomain(domainId: string): boolean {
    const norm = domainId.toLowerCase();
    return this.modelIndex.domains.some((d) => d.id.toLowerCase() === norm);
  }

  listDomains(): Array<{ id: string; name: string }> {
    return this.modelIndex.domains.map((d) => ({ id: d.id, name: d.name }));
  }

  // --- Сущности ---

  /** FQID → entity-запись. Принимает и полный FQID, и (domainId + localId). */
  resolveEntity(fqidOrLocal: string, domainId?: string): unknown | undefined {
    const fqid = domainId
      ? makeFqid(domainId, fqidOrLocal)
      : normalizeFqid(fqidOrLocal);
    return this.modelIndex.entitiesByFqid[fqid];
  }

  /** Локальные сущности домена (для autocomplete). */
  listEntitiesInDomain(domainId: string): Array<{ id: string; name?: string }> {
    const domain = domainId.toLowerCase();
    const out: Array<{ id: string; name?: string }> = [];
    for (const fqid of Object.keys(this.modelIndex.entitiesByFqid)) {
      const slash = fqid.indexOf("/");
      if (slash < 0) continue;
      if (fqid.slice(0, slash) !== domain) continue;
      const entity = this.modelIndex.entitiesByFqid[fqid] as any;
      out.push({ id: fqid.slice(slash + 1), name: entity?.name });
    }
    return out;
  }

  // --- Data ID Ref / FQID → сущность по data ID ---

  /**
   * Резолв «Data ID Ref или FQID» в контексте домена.
   * 'Asset' → 'it.assets/Asset' (в domainId)
   * 'other.domain/Asset' → как есть.
   */
  resolveDataIdRef(ref: string, currentDomainId: string): string | null {
    const norm = ref.toLowerCase();
    if (norm.includes("/")) return norm;
    const fqid = makeFqid(currentDomainId, ref);
    return this.modelIndex.entitiesByFqid[fqid] ? fqid : null;
  }

  // --- Связи ---

  listLinkagesForEntity(
    entityFqid: string,
  ): Array<{ id: string; side1: string; side2: string }> {
    const norm = normalizeFqid(entityFqid);
    return this.modelIndex.entityLinkages
      .filter((l) => l.side1Fqid === norm || l.side2Fqid === norm)
      .map((l) => ({ id: l.id, side1: l.side1Fqid, side2: l.side2Fqid }));
  }

  findLinkage(
    linkageId: string,
  ): ModelIndexLike["entityLinkages"][number] | undefined {
    return this.modelIndex.entityLinkages.find((l) => l.id === linkageId);
  }

  // --- DataTypes ---

  resolveDataType(
    dataTypeId: string,
    domainId: string,
  ): { id: string; kind: string } | null {
    const norm = domainId.toLowerCase();
    const dt = this.modelIndex.dataTypes.find(
      (d) => d.id === dataTypeId && d.domainId.toLowerCase() === norm,
    );
    return dt ? { id: dt.id, kind: dt.kind } : null;
  }

  listDataTypesInDomain(domainId: string): Array<{ id: string; kind: string }> {
    const norm = domainId.toLowerCase();
    return this.modelIndex.dataTypes
      .filter((d) => d.domainId.toLowerCase() === norm)
      .map((d) => ({ id: d.id, kind: d.kind }));
  }

  // --- Views ---

  resolveView(
    viewId: string,
    domainId: string,
  ): { id: string; type: string } | null {
    const domain = this.modelIndex.schemasByDomain[domainId.toLowerCase()];
    if (!domain) return null;
    const views = domain.allViews ?? domain.sections.views.items;
    const view = views.find((v) => v.id === viewId);
    return view ? { id: view.id, type: view.type } : null;
  }

  listViewsInDomain(
    domainId: string,
  ): Array<{ id: string; type: string; entity?: string, label?: string }> {
    const domain = this.modelIndex.schemasByDomain[domainId.toLowerCase()];
    if (!domain) return [];
    return (domain.allViews ?? domain.sections.views.items).map((v) => ({
      id: v.id,
      type: v.type,
      label: v.label,
      entity: v.entity,
    }));
  }

  // --- Actions ---

  resolveAction(actionId: string): unknown | undefined {
    return this.modelIndex.actionsById[actionId];
  }

  // --- View widgets / groups (для автокомплита внутри view) ---

  listWidgetsInView(viewId: string): Array<{ id: string; type: string }> {
    return this.modelIndex.viewWidgets
      .filter((w) => w.parentViewId === viewId)
      .map((w) => ({ id: w.id, type: w.type }));
  }

  listGroupsInView(viewId: string): Array<{ id: string; type: string }> {
    return this.modelIndex.viewGroups
      .filter((g) => g.parentViewId === viewId)
      .map((g) => ({ id: g.id, type: g.type }));
  }
}
