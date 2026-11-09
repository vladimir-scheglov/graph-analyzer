// src/web/lib/model/dependency-freshness.ts
import type { ModelIndex } from "../../../shared/model-types";

export interface StaleRef {
  /** Кто ссылается (FQID домена). */
  fromDomainId: string;
  /** Что именно. */
  entityFqid: string;
  attributeId?: string;
  /** 'fqid' — Reference; 'inherits' — наследование. */
  kind: "reference" | "array_reference" | "inherits";
}

export interface FreshnessReport {
  /** Домен, который изменили. */
  changedDomainId: string;
  changedVersion: string;
  /** Все домены, которые на него ссылаются и стали «устаревшими». */
  staleDomains: Array<{
    domainId: string;
    refs: StaleRef[];
  }>;
  /** Итого — для бейджа. */
  totalStaleRefs: number;
}

/**
 * Обратный индекс: FQID → домены, которые на него ссылаются.
 * Строится один раз на ModelIndex и кэшируется в WeakMap.
 */
const cache = new WeakMap<ModelIndex, Map<string, StaleRef[]>>();

export function getReverseIndex(index: ModelIndex): Map<string, StaleRef[]> {
  const cached = cache.get(index);
  if (cached) return cached;

  const map = new Map<string, StaleRef[]>();
  const push = (target: string, ref: StaleRef) => {
    const key = target.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ref);
  };

  for (const e of index.entities) {
    if (e.inherits) {
      push(e.inherits, {
        fromDomainId: e.domainId,
        entityFqid: e.fqid,
        kind: "inherits",
      });
    }
    for (const a of e.attributes) {
      const t = a.referenceEntity;
      if (t) {
        push(t, {
          fromDomainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: a.id,
          kind: "reference",
        });
      }
      const it = a.itemReferenceEntity;
      if (it) {
        push(it, {
          fromDomainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: a.id,
          kind: "array_reference",
        });
      }
    }
  }

  cache.set(index, map);
  return map;
}

/**
 * «Кто стал устаревшим после обновления changedDomainId до changedVersion».
 * Смотрим на все сущности домена, берём их обратные ссылки.
 */
export function computeFreshness(
  index: ModelIndex,
  changedDomainId: string,
  changedVersion: string,
): FreshnessReport {
  const reverse = getReverseIndex(index);
  const changedLower = changedDomainId.toLowerCase();
  const entitiesOfChanged = index.entities.filter(
    (e) => e.domainId.toLowerCase() === changedLower,
  );

  const byDomain = new Map<string, StaleRef[]>();
  for (const e of entitiesOfChanged) {
    const refs = reverse.get(e.fqid.toLowerCase()) || [];
    for (const r of refs) {
      if (r.fromDomainId.toLowerCase() === changedLower) continue;
      if (!byDomain.has(r.fromDomainId)) byDomain.set(r.fromDomainId, []);
      // дедуп по (entityFqid + attributeId + kind)
      const key = `${r.entityFqid}#${r.attributeId || ""}#${r.kind}`;
      const exists = byDomain
        .get(r.fromDomainId)!
        .some(
          (x) => `${x.entityFqid}#${x.attributeId || ""}#${x.kind}` === key,
        );
      if (!exists) byDomain.get(r.fromDomainId)!.push(r);
    }
  }

  const staleDomains = Array.from(byDomain.entries())
    .map(([domainId, refs]) => ({ domainId, refs }))
    .sort((a, b) => b.refs.length - a.refs.length);

  const totalStaleRefs = staleDomains.reduce((s, d) => s + d.refs.length, 0);

  return { changedDomainId, changedVersion, staleDomains, totalStaleRefs };
}
