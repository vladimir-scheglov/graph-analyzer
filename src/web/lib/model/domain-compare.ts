import type { EntityRecord, ModelIndex } from "../../../shared/model-types";

export interface DomainSide {
  domainId: string;
  domainName: string;
  version: string;
  entities: EntityRecord[];
  entityCount: number;
  attributeCount: number;
  linkageCount: number;
  dataTypeCount: number;
  sonarScore: number | null;
  totalRefs: number;
}

export interface EntityDiffEntry {
  entityId: string;
  /** Только в A. */
  onlyInA?: EntityRecord;
  /** Только в B. */
  onlyInB?: EntityRecord;
  /** Общая — что различается. */
  shared?: {
    entityA: EntityRecord;
    entityB: EntityRecord;
    sameName: boolean;
    sameInherits: boolean;
    attrsOnlyInA: string[];
    attrsOnlyInB: string[];
    attrsDifferentType: Array<{
      id: string;
      typeA: string;
      typeB: string;
    }>;
  };
}

export interface DomainCompareResult {
  domainA: DomainSide;
  domainB: DomainSide;

  entities: {
    onlyInA: EntityRecord[];
    onlyInB: EntityRecord[];
    shared: Array<{
      entityA: EntityRecord;
      entityB: EntityRecord;
      attrsOnlyInA: string[];
      attrsOnlyInB: string[];
      attrsDifferentType: Array<{
        id: string;
        typeA: string;
        typeB: string;
      }>;
      inheritsChanged: boolean;
      nameChanged: boolean;
    }>;
  };

  metrics: {
    entityDiff: number;
    attributeDiff: number;
    commonEntities: number;
  };
}

function buildDomainSide(index: ModelIndex, domainId: string): DomainSide {
  const entities = index.entities.filter((e) => e.domainId === domainId);
  const attributeCount = entities.reduce((s, e) => {
    let c = e.attributes.length;
    e.attributes.forEach((a) => {
      if (a.nestedAttributes) c += a.nestedAttributes.length;
    });
    return s + c;
  }, 0);

  const linkageCount = index.entityLinkages.filter(
    (l) => l.domainId === domainId,
  ).length;
  const dataTypeCount = index.dataTypes.filter(
    (d) => d.domainId === domainId,
  ).length;

  const domainMeta = index.domains.find((d) => d.id === domainId);
  const sonar = index.lint?.sonar?.byDomain[domainId];

  // Ссылки: сумма входящих + исходящих рёбер
  const totalRefs = entities.reduce(
    (sum, e) =>
      sum +
      (index.entityChildrenByFqid[e.fqid] || []).length +
      e.attributes.filter((a) => a.referenceEntity || a.itemReferenceEntity)
        .length,
    0,
  );

  return {
    domainId,
    domainName: domainMeta?.name || domainId,
    version: domainMeta?.version || "",
    entities,
    entityCount: entities.length,
    attributeCount,
    linkageCount,
    dataTypeCount,
    sonarScore: sonar ? sonar.score : null,
    totalRefs,
  };
}

export function compareDomains(
  index: ModelIndex,
  domainAId: string,
  domainBId: string,
): DomainCompareResult {
  const sideA = buildDomainSide(index, domainAId);
  const sideB = buildDomainSide(index, domainBId);

  const mapA = new Map(sideA.entities.map((e) => [e.entityId, e]));
  const mapB = new Map(sideB.entities.map((e) => [e.entityId, e]));

  const onlyInA: EntityRecord[] = [];
  const onlyInB: EntityRecord[] = [];
  const shared: DomainCompareResult["entities"]["shared"] = [];

  mapA.forEach((eA, id) => {
    const eB = mapB.get(id);
    if (!eB) {
      onlyInA.push(eA);
      return;
    }

    const attrMapA = new Map(eA.attributes.map((a) => [a.id, a]));
    const attrMapB = new Map(eB.attributes.map((a) => [a.id, a]));

    const attrsOnlyInA: string[] = [];
    const attrsOnlyInB: string[] = [];
    const attrsDifferentType: Array<{
      id: string;
      typeA: string;
      typeB: string;
    }> = [];

    attrMapA.forEach((aA, aid) => {
      const aB = attrMapB.get(aid);
      if (!aB) {
        attrsOnlyInA.push(aid);
        return;
      }
      if (aA.dataType !== aB.dataType) {
        attrsDifferentType.push({
          id: aid,
          typeA: aA.dataType,
          typeB: aB.dataType,
        });
      }
    });
    attrMapB.forEach((_aB, aid) => {
      if (!attrMapA.has(aid)) attrsOnlyInB.push(aid);
    });

    shared.push({
      entityA: eA,
      entityB: eB,
      attrsOnlyInA,
      attrsOnlyInB,
      attrsDifferentType,
      inheritsChanged: eA.inherits !== eB.inherits,
      nameChanged: eA.name !== eB.name,
    });
  });

  mapB.forEach((eB, id) => {
    if (!mapA.has(id)) onlyInB.push(eB);
  });

  const attributeDiff =
    Math.abs(sideA.attributeCount - sideB.attributeCount) +
    shared.reduce(
      (s, sh) => s + sh.attrsOnlyInA.length + sh.attrsOnlyInB.length,
      0,
    );

  return {
    domainA: sideA,
    domainB: sideB,
    entities: {
      onlyInA: onlyInA.sort((a, b) => a.entityId.localeCompare(b.entityId)),
      onlyInB: onlyInB.sort((a, b) => a.entityId.localeCompare(b.entityId)),
      shared: shared.sort((a, b) =>
        a.entityA.entityId.localeCompare(b.entityB.entityId),
      ),
    },
    metrics: {
      entityDiff: Math.abs(sideA.entityCount - sideB.entityCount),
      attributeDiff,
      commonEntities: shared.length,
    },
  };
}
