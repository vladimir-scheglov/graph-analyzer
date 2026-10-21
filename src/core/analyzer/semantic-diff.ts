import type {
  ModelSnapshot,
  SemanticDiff,
  DiffEntityRef,
  DiffEntityChange,
  DiffAttributeChange,
  DiffMixinRef,
  DiffDataTypeRef,
  SnapshotAttribute,
  SnapshotEntity,
  SnapshotMixin,
  SnapshotDataType,
  SnapshotDomain,
  DomainMetadataChange,
  DiffDomainRef,
  DomainChange,
  DomainChangesSummary,
  GenericSnapshotEntry,
  GenericDiffEntry,
  GenericSectionDiff,
} from "../../shared/model-types";

function toEntityRef(e: SnapshotEntity): DiffEntityRef {
  const slash = e.fqid.indexOf("/");
  return {
    fqid: e.fqid,
    domainId: slash > 0 ? e.fqid.slice(0, slash) : "",
    entityId: slash > 0 ? e.fqid.slice(slash + 1) : e.fqid,
    name: e.name,
  };
}

function toMixinRef(m: SnapshotMixin): DiffMixinRef {
  return {
    id: m.id,
    domainId: m.domainId,
    targetEntityFqid: m.targetEntityFqid,
  };
}

function toDataTypeRef(d: SnapshotDataType): DiffDataTypeRef {
  return { id: d.id, domainId: d.domainId, kind: d.kind };
}

function compareAttributes(
  prevAttrs: SnapshotAttribute[],
  currAttrs: SnapshotAttribute[],
): {
  added: SnapshotAttribute[];
  removed: SnapshotAttribute[];
  changed: DiffAttributeChange[];
} {
  const prevMap = new Map(prevAttrs.map((a) => [a.id, a]));
  const currMap = new Map(currAttrs.map((a) => [a.id, a]));

  const added: SnapshotAttribute[] = [];
  const removed: SnapshotAttribute[] = [];
  const changed: DiffAttributeChange[] = [];

  currMap.forEach((currA, id) => {
    if (!prevMap.has(id)) {
      added.push(currA);
      return;
    }
    const prevA = prevMap.get(id)!;
    const changes: Record<string, { from: any; to: any }> = {};

    if (prevA.name !== currA.name)
      changes.name = { from: prevA.name, to: currA.name };
    if (prevA.dataType !== currA.dataType) {
      changes.dataType = { from: prevA.dataType, to: currA.dataType };
    }
    if (prevA.referenceEntity !== currA.referenceEntity) {
      changes.referenceEntity = {
        from: prevA.referenceEntity,
        to: currA.referenceEntity,
      };
    }
    if (prevA.itemDataType !== currA.itemDataType) {
      changes.itemDataType = {
        from: prevA.itemDataType,
        to: currA.itemDataType,
      };
    }
    if (prevA.itemReferenceEntity !== currA.itemReferenceEntity) {
      changes.itemReferenceEntity = {
        from: prevA.itemReferenceEntity,
        to: currA.itemReferenceEntity,
      };
    }
    if (
      JSON.stringify(prevA.constraints) !== JSON.stringify(currA.constraints)
    ) {
      changes.constraints = { from: prevA.constraints, to: currA.constraints };
    }

    if (Object.keys(changes).length > 0) {
      changed.push({ id, name: currA.name, changes });
    }
  });

  prevMap.forEach((prevA, id) => {
    if (!currMap.has(id)) removed.push(prevA);
  });

  return { added, removed, changed };
}

function toDomainRef(d: SnapshotDomain): DiffDomainRef {
  return { domainId: d.id, name: d.name, version: d.version };
}

function compareDomains(
  prev: SnapshotDomain,
  curr: SnapshotDomain,
): DomainMetadataChange[] {
  const changes: DomainMetadataChange[] = [];

  if (prev.name !== curr.name) {
    changes.push({ field: "name", from: prev.name, to: curr.name });
  }
  if (prev.version !== curr.version) {
    changes.push({ field: "version", from: prev.version, to: curr.version });
  }
  if (prev.author !== curr.author) {
    changes.push({ field: "author", from: prev.author, to: curr.author });
  }
  if (JSON.stringify(prev.tags) !== JSON.stringify(curr.tags)) {
    changes.push({ field: "tags", from: prev.tags, to: curr.tags });
  }
  if (prev.description !== curr.description) {
    changes.push({
      field: "description",
      from: prev.description,
      to: curr.description,
    });
  }
  return changes;
}

export function computeSemanticDiff(
  prev: ModelSnapshot,
  curr: ModelSnapshot,
): SemanticDiff {
  // ============ Generic sections ============
  const genericSections = diffGenericSections(
    prev.genericSections,
    curr.genericSections,
  );

  // ============ Entities ============
  const prevEntities = new Map(prev.entities.map((e) => [e.fqid, e]));
  const currEntities = new Map(curr.entities.map((e) => [e.fqid, e]));

  const addedEntities: DiffEntityRef[] = [];
  const removedEntities: DiffEntityRef[] = [];
  const changedEntities: DiffEntityChange[] = [];

  currEntities.forEach((e, fqid) => {
    if (!prevEntities.has(fqid)) addedEntities.push(toEntityRef(e));
  });
  prevEntities.forEach((e, fqid) => {
    if (!currEntities.has(fqid)) removedEntities.push(toEntityRef(e));
  });
  currEntities.forEach((currE, fqid) => {
    const prevE = prevEntities.get(fqid);
    if (!prevE) return;
    const inheritsChange =
      prevE.inherits !== currE.inherits
        ? { from: prevE.inherits, to: currE.inherits }
        : undefined;
    const nameChange =
      prevE.name !== currE.name
        ? { from: prevE.name, to: currE.name }
        : undefined;
    const attrDiff = compareAttributes(prevE.attributes, currE.attributes);

    if (
      !inheritsChange &&
      !nameChange &&
      attrDiff.added.length === 0 &&
      attrDiff.removed.length === 0 &&
      attrDiff.changed.length === 0
    )
      return;

    const slash = fqid.indexOf("/");
    changedEntities.push({
      fqid,
      domainId: slash > 0 ? fqid.slice(0, slash) : "",
      entityId: slash > 0 ? fqid.slice(slash + 1) : fqid,
      name: currE.name,
      inheritsChange,
      nameChange,
      attributesAdded: attrDiff.added,
      attributesRemoved: attrDiff.removed,
      attributesChanged: attrDiff.changed,
    });
  });

  // ============ Mixins ============
  const prevMixinKeys = new Set(
    prev.mixins.map((m) => `${m.domainId}#${m.id}`),
  );
  const currMixinKeys = new Set(
    curr.mixins.map((m) => `${m.domainId}#${m.id}`),
  );
  const addedMixins: DiffMixinRef[] = [];
  const removedMixins: DiffMixinRef[] = [];
  curr.mixins.forEach((m) => {
    if (!prevMixinKeys.has(`${m.domainId}#${m.id}`))
      addedMixins.push(toMixinRef(m));
  });
  prev.mixins.forEach((m) => {
    if (!currMixinKeys.has(`${m.domainId}#${m.id}`))
      removedMixins.push(toMixinRef(m));
  });

  // ============ DataTypes ============
  const prevDtKeys = new Set(
    prev.dataTypes.map((d) => `${d.domainId}#${d.id}`),
  );
  const currDtKeys = new Set(
    curr.dataTypes.map((d) => `${d.domainId}#${d.id}`),
  );
  const addedDTs: DiffDataTypeRef[] = [];
  const removedDTs: DiffDataTypeRef[] = [];
  curr.dataTypes.forEach((d) => {
    if (!prevDtKeys.has(`${d.domainId}#${d.id}`))
      addedDTs.push(toDataTypeRef(d));
  });
  prev.dataTypes.forEach((d) => {
    if (!currDtKeys.has(`${d.domainId}#${d.id}`))
      removedDTs.push(toDataTypeRef(d));
  });

  // ============ Domains (metadata) ============
  const prevDomains = new Map((prev.domains || []).map((d) => [d.id, d]));
  const currDomains = new Map((curr.domains || []).map((d) => [d.id, d]));

  const addedDomains: DiffDomainRef[] = [];
  const removedDomains: DiffDomainRef[] = [];
  const changedDomains: DomainChange[] = [];

  currDomains.forEach((d, id) => {
    if (!prevDomains.has(id)) addedDomains.push(toDomainRef(d));
  });
  prevDomains.forEach((d, id) => {
    if (!currDomains.has(id)) removedDomains.push(toDomainRef(d));
  });
  currDomains.forEach((currD, id) => {
    const prevD = prevDomains.get(id);
    if (!prevD) return;
    const changes = compareDomains(prevD, currD);
    if (changes.length > 0) {
      changedDomains.push({ domainId: id, name: currD.name, changes });
    }
  });

  // ============ Группировка genericSections по домену ============
  const genericByDomain = new Map<string, Record<string, GenericSectionDiff>>();
  for (const [sectionKey, diff] of Object.entries(genericSections)) {
    for (const [kind, list] of [
      ["added", diff.added] as const,
      ["removed", diff.removed] as const,
      ["changed", diff.changed] as const,
    ]) {
      for (const entry of list) {
        if (!genericByDomain.has(entry.domainId)) {
          genericByDomain.set(entry.domainId, {});
        }
        const bySection = genericByDomain.get(entry.domainId)!;
        if (!bySection[sectionKey]) {
          bySection[sectionKey] = { added: [], removed: [], changed: [] };
        }
        bySection[sectionKey][kind].push(entry);
      }
    }
  }

  // ============ Группировка byDomain ============
  const summaryMap = new Map<string, DomainChangesSummary>();

  function ensureSummary(domainId: string): DomainChangesSummary {
    if (!summaryMap.has(domainId)) {
      const currD = currDomains.get(domainId);
      const prevD = prevDomains.get(domainId);
      summaryMap.set(domainId, {
        domainId,
        name: currD?.name || prevD?.name || domainId,
        version: currD?.version || prevD?.version || "",
        metadataChanges: [],
        entitiesAdded: [],
        entitiesRemoved: [],
        entitiesChanged: [],
        mixinsAdded: [],
        mixinsRemoved: [],
        dataTypesAdded: [],
        dataTypesRemoved: [],
        totalChanges: 0,
      });
    }
    return summaryMap.get(domainId)!;
  }

  // Metadata
  changedDomains.forEach((dc) => {
    const s = ensureSummary(dc.domainId);
    s.metadataChanges.push(...dc.changes);
  });

  // Entities
  addedEntities.forEach((e) => {
    const s = ensureSummary(e.domainId);
    s.entitiesAdded.push(e);
  });
  removedEntities.forEach((e) => {
    const s = ensureSummary(e.domainId);
    s.entitiesRemoved.push(e);
  });
  changedEntities.forEach((c) => {
    const s = ensureSummary(c.domainId);
    s.entitiesChanged.push(c);
  });

  // Mixins
  addedMixins.forEach((m) => {
    const s = ensureSummary(m.domainId);
    s.mixinsAdded.push(m);
  });
  removedMixins.forEach((m) => {
    const s = ensureSummary(m.domainId);
    s.mixinsRemoved.push(m);
  });

  // DataTypes
  addedDTs.forEach((d) => {
    const s = ensureSummary(d.domainId);
    s.dataTypesAdded.push(d);
  });
  removedDTs.forEach((d) => {
    const s = ensureSummary(d.domainId);
    s.dataTypesRemoved.push(d);
  });

  // Итог по каждому домену
  summaryMap.forEach((s) => {
    s.totalChanges =
      s.metadataChanges.length +
      s.entitiesAdded.length +
      s.entitiesRemoved.length +
      s.entitiesChanged.length +
      s.mixinsAdded.length +
      s.mixinsRemoved.length +
      s.dataTypesAdded.length +
      s.dataTypesRemoved.length;
  });

  // Добавляем generic к summary (и увеличиваем totalChanges)
  genericByDomain.forEach((bySection, domainId) => {
    const s = ensureSummary(domainId);
    s.generic = bySection;
    for (const diff of Object.values(bySection)) {
      s.totalChanges +=
        diff.added.length + diff.removed.length + diff.changed.length;
    }
  });

  // Пересортировка после добавления generic
  const byDomain = Array.from(summaryMap.values())
    .filter((s) => s.totalChanges > 0)
    .sort((a, b) => {
      if (b.totalChanges !== a.totalChanges)
        return b.totalChanges - a.totalChanges;
      return a.domainId.localeCompare(b.domainId);
    });

  // ============ Stats ============
  const attrAddedCount = changedEntities.reduce(
    (s, c) => s + c.attributesAdded.length,
    0,
  );
  const attrRemovedCount = changedEntities.reduce(
    (s, c) => s + c.attributesRemoved.length,
    0,
  );
  const attrChangedCount = changedEntities.reduce(
    (s, c) => s + c.attributesChanged.length,
    0,
  );
  const inhChangedCount = changedEntities.filter(
    (c) => c.inheritsChange,
  ).length;

  return {
    previousGeneratedAt: prev.generatedAt,
    currentGeneratedAt: curr.generatedAt,
    entities: {
      added: addedEntities,
      removed: removedEntities,
      changed: changedEntities,
    },
    mixins: { added: addedMixins, removed: removedMixins },
    dataTypes: { added: addedDTs, removed: removedDTs },
    domains: {
      added: addedDomains,
      removed: removedDomains,
      changed: changedDomains,
    },
    genericSections,
    byDomain,
    stats: {
      entitiesAdded: addedEntities.length,
      entitiesRemoved: removedEntities.length,
      entitiesChanged: changedEntities.length,
      attributesAdded: attrAddedCount,
      attributesRemoved: attrRemovedCount,
      attributesChanged: attrChangedCount,
      inheritanceChanged: inhChangedCount,
      mixinsAdded: addedMixins.length,
      mixinsRemoved: removedMixins.length,
      dataTypesAdded: addedDTs.length,
      dataTypesRemoved: removedDTs.length,
      domainsAdded: addedDomains.length,
      domainsRemoved: removedDomains.length,
      domainsChanged: changedDomains.length,
      genericAdded: countGeneric(genericSections, "added"),
      genericRemoved: countGeneric(genericSections, "removed"),
      genericChanged: countGeneric(genericSections, "changed"),
    },
  };
}

function countGeneric(
  sections: Record<string, GenericSectionDiff>,
  kind: keyof GenericSectionDiff,
): number {
  let sum = 0;
  for (const diff of Object.values(sections)) {
    sum += diff[kind].length;
  }
  return sum;
}

function toGenericDiffEntry(e: GenericSnapshotEntry): GenericDiffEntry {
  return {
    id: e.id,
    domainId: e.domainId,
    label: e.label,
    type: e.type,
  };
}

function diffGenericSections(
  prev: Record<string, GenericSnapshotEntry[]> | undefined,
  curr: Record<string, GenericSnapshotEntry[]> | undefined,
): Record<string, GenericSectionDiff> {
  const result: Record<string, GenericSectionDiff> = {};
  const keys = new Set<string>([
    ...Object.keys(prev || {}),
    ...Object.keys(curr || {}),
  ]);

  for (const key of keys) {
    const prevItems = prev?.[key] || [];
    const currItems = curr?.[key] || [];
    if (prevItems.length === 0 && currItems.length === 0) continue;

    const prevMap = new Map(
      prevItems.map((e) => [`${e.domainId}#${e.id}`, e] as const),
    );
    const currMap = new Map(
      currItems.map((e) => [`${e.domainId}#${e.id}`, e] as const),
    );

    const added: GenericDiffEntry[] = [];
    const removed: GenericDiffEntry[] = [];
    const changed: GenericDiffEntry[] = [];

    currMap.forEach((e, mapKey) => {
      const prevItem = prevMap.get(mapKey);
      if (!prevItem) {
        added.push(toGenericDiffEntry(e));
      } else if (prevItem.hash !== e.hash) {
        changed.push(toGenericDiffEntry(e));
      }
    });
    prevMap.forEach((e, mapKey) => {
      if (!currMap.has(mapKey)) removed.push(toGenericDiffEntry(e));
    });

    if (added.length === 0 && removed.length === 0 && changed.length === 0) {
      continue;
    }

    added.sort((a, b) => (a.domainId + a.id).localeCompare(b.domainId + b.id));
    removed.sort((a, b) =>
      (a.domainId + a.id).localeCompare(b.domainId + b.id),
    );
    changed.sort((a, b) =>
      (a.domainId + a.id).localeCompare(b.domainId + b.id),
    );

    result[key] = { added, removed, changed };
  }

  return result;
}
