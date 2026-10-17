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
  linkages: Array<{
    domainId: string;
    linkageId: string;
    side: 1 | 2;
    peerFqid: string | null;
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

  // Linkages — ищем через все домены, где мы их собирали
  // (в ModelIndex мы их не храним напрямую — собираем из linkedViaLinkages и rawData)
  // Простой вариант: linkedViaLinkages даёт только ID, без peer.
  // Значит, чтобы получить peer, нужно смотреть в rawData — что мы не храним в индексе.
  // Компромисс: в ModelIndex добавляем поле linkagePeers.
  const linkages: ImpactResult["linkages"] = [];
  // заполняется из index.linkagesByEntity (если добавим — см. ниже).
  // Пока оставляем пустым; на следующем шаге расширим модель.

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
