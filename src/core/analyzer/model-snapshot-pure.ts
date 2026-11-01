import type {
  ModelIndex,
  ModelSnapshot,
  SnapshotEntity,
  SnapshotAttribute,
  SnapshotMixin,
  SnapshotDataType,
  SnapshotSequence,
  SnapshotDomain,
} from "../../shared/model-types";

/**
 * Чистая (без fs/path) сборка ModelSnapshot из ModelIndex.
 *
 * Вынесено отдельно от `model-snapshot.ts`, потому что тот файл
 * на верхнем уровне импортирует `fs` и `path` — а `createSnapshotFromModelIndex`
 * используется в web-коде (см. `src/web/lib/version-impact.ts`),
 * который собирается esbuild'ом для браузера. Node builtins там
 * не резолвятся.
 */
export function createSnapshotFromModelIndex(index: ModelIndex): ModelSnapshot {
  return {
    generatedAt: index.generatedAt,
    domains: index.domains.map<SnapshotDomain>((d) => ({
      id: d.id,
      name: d.name,
      version: d.version,
      author: d.author,
      tags: [...d.tags].sort(),
      description: d.description,
    })),
    entities: index.entities.map<SnapshotEntity>((e) => ({
      fqid: e.fqid,
      name: e.name,
      inherits: e.inherits,
      attributes: e.attributes.map<SnapshotAttribute>((a) => ({
        id: a.id,
        name: a.name,
        dataType: a.dataType,
        referenceEntity: a.referenceEntity,
        itemDataType: a.itemDataType,
        itemReferenceEntity: a.itemReferenceEntity,
        constraints: a.constraints,
      })),
    })),
    mixins: index.mixins.map<SnapshotMixin>((m) => ({
      id: m.id,
      domainId: m.domainId,
      targetEntityFqid: m.targetEntityFqid,
      addedTabs: m.addedTabs,
    })),
    dataTypes: index.dataTypes.map<SnapshotDataType>((d) => ({
      id: d.id,
      domainId: d.domainId,
      kind: d.kind,
      valuesCount: d.valuesCount,
    })),
    sequences: index.sequences.map<SnapshotSequence>((s) => ({
      id: s.id,
      domainId: s.domainId,
    })),
    // Копируем явно, чтобы diff видел новые/изменённые секции.
    genericSections:
      index.genericSections && Object.keys(index.genericSections).length > 0
        ? index.genericSections
        : undefined,
  };
}
