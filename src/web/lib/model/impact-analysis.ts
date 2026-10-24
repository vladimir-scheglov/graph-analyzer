import type {
  EntityRecord,
  ModelIndex,
  MixinRecord,
} from "../../../shared/model-types";

export interface ImpactResult {
  entity: EntityRecord;

  /** Родительская сущность (если есть). */
  parent: EntityRecord | null;

  /** Прямые наследники. */
  children: EntityRecord[];

  /** Всё дерево потомков вверх (по цепочке inherits). */
  ancestors: EntityRecord[];

  /** Ссылки через FQID-атрибуты: кто ссылается на эту сущность. */
  referencedByAttributes: Array<{
    entity: EntityRecord;
    attributeId: string;
    attributeName: string;
  }>;

  /** Исходящие ссылки: на кого ссылается эта сущность. */
  referencesToOthers: Array<{
    entity: EntityRecord;
    attributeId: string;
    attributeName: string;
  }>;

  /** Связи linkages, где участвует сущность. */
  /** Связи linkages, где участвует сущность (в т.ч. кросс-доменные). */
  linkages: Array<{
    domainId: string;
    linkageId: string;
    linkageName: string;
    linkageType: string;
    undirected: boolean;
    /** Сторона, на которой стоит текущая сущность (1 или 2). */
    side: 1 | 2;
    /**
     * FQID сущности-соседа (lowercase). Для симметричных self-linkage
     * (side1Fqid === side2Fqid) совпадает с текущим fqid.
     */
    peerFqid: string;
  }>;

  /** Миксины, расширяющие эту сущность. */
  mixins: MixinRecord[];

  /** Кто через миксины расширяет эту сущность (домены). */
  mixinDomains: string[];
}

export function computeImpact(
  fqid: string,
  index: ModelIndex,
): ImpactResult | null {
  const entity = index.entitiesByFqid[fqid];
  if (!entity) return null;

  // Parent и ancestors
  const parent = entity.inherits
    ? index.entitiesByFqid[entity.inherits] || null
    : null;
  const ancestors: EntityRecord[] = [];
  const seen = new Set<string>();
  let cur = parent;
  while (cur && !seen.has(cur.fqid)) {
    ancestors.push(cur);
    seen.add(cur.fqid);
    cur = cur.inherits ? index.entitiesByFqid[cur.inherits] || null : null;
  }

  // Children (прямые)
  const childrenFqids = index.entityChildrenByFqid[fqid] || [];
  const children = childrenFqids
    .map((id) => index.entitiesByFqid[id])
    .filter((x): x is EntityRecord => !!x);

  // Referenced by attributes
  const referencedByAttributes: ImpactResult["referencedByAttributes"] = [];
  const referencesToOthers: ImpactResult["referencesToOthers"] = [];

  for (const e of index.entities) {
    for (const a of e.attributes) {
      if (a.referenceEntity === fqid || a.itemReferenceEntity === fqid) {
        referencedByAttributes.push({
          entity: e,
          attributeId: a.id,
          attributeName: a.name,
        });
      }
      if (e.fqid === fqid) {
        const target = a.referenceEntity || a.itemReferenceEntity;
        if (target && index.entitiesByFqid[target]) {
          referencesToOthers.push({
            entity: index.entitiesByFqid[target],
            attributeId: a.id,
            attributeName: a.name,
          });
        }
      }
    }
  }

  // Linkages — все связи, где участвует сущность (в любом загруженном домене).
  // `entityLinkages` уже содержит нормализованные lowercase FQID сторон.
  const linkages: ImpactResult["linkages"] = [];

  for (const l of index.entityLinkages) {
    if (l.side1Fqid === fqid) {
      linkages.push({
        domainId: l.domainId,
        linkageId: l.id,
        linkageName: l.name,
        linkageType: l.type,
        undirected: l.undirected === true,
        side: 1,
        peerFqid: l.side2Fqid,
      });
    } else if (l.side2Fqid === fqid) {
      linkages.push({
        domainId: l.domainId,
        linkageId: l.id,
        linkageName: l.name,
        linkageType: l.type,
        undirected: l.undirected === true,
        side: 2,
        peerFqid: l.side1Fqid,
      });
    }
  }

  // Self-ссылки (Task → Task) — первыми. Остальные — по имени для
  // стабильности между рендерами (иначе при hover на DOM-порядок
  // дёргается, если появятся новые linkage в индексе).
  linkages.sort((a, b) => {
    const aSelf = a.peerFqid === fqid ? 0 : 1;
    const bSelf = b.peerFqid === fqid ? 0 : 1;
    if (aSelf !== bSelf) return aSelf - bSelf;
    const byName = (a.linkageName || a.linkageId).localeCompare(
      b.linkageName || b.linkageId,
    );
    if (byName !== 0) return byName;
    return a.peerFqid.localeCompare(b.peerFqid);
  });

  // Mixins
  const mixins = index.mixinsByEntityFqid[fqid] || [];
  const mixinDomains = Array.from(new Set(mixins.map((m) => m.domainId)));

  return {
    entity,
    parent,
    children,
    ancestors,
    referencedByAttributes,
    referencesToOthers,
    linkages,
    mixins,
    mixinDomains,
  };
}
