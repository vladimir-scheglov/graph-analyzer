import type {
  EntityRecord,
  MixinRecord,
  ModelIndex,
} from "../../../shared/model-types";

export interface DomainMixinGroup {
  /** Домен, где объявлен миксин. */
  sourceDomain: string;
  /** Все миксины из этого домена, применённые к сущностям текущего домена. */
  mixins: MixinRecord[];
  /** Уникальные сущности, к которым применены эти миксины. */
  targetEntities: EntityRecord[];
  /** Суммарно по всем миксинам группы. */
  totalTabs: number;
  totalComponents: number;
  totalBlocks: number;
}

export interface DomainMixinsResult {
  /** Домен-владелец, для которого мы строим карту. */
  domainId: string;

  /** Сгруппировано по домену-источнику миксина. */
  groups: DomainMixinGroup[];

  /** Уникальные сущности этого домена, затронутые хоть одним миксином. */
  affectedEntities: EntityRecord[];

  /** Статистика для шапки. */
  stats: {
    totalMixins: number;
    totalSourceDomains: number;
    affectedEntitiesCount: number;
    /** Сущности, к которым применено 2+ миксина. */
    heavyTargets: Array<{ entity: EntityRecord; mixinCount: number }>;
    /** Конфликты — одинаковые табы из разных источников. */
    conflicts: Array<{
      entityFqid: string;
      tab: string;
      sources: string[];
    }>;
  };
}

/**
 * Возвращает карту миксинов для домена:
 *   - какие миксин-домены расширяют сущности этого домена
 *   - что каждый из них приносит
 *   - какие сущности затронуты
 */
export function computeDomainMixins(
  domainId: string,
  index: ModelIndex,
): DomainMixinsResult {
  const domainIdLower = domainId.toLowerCase();

  // Все сущности этого домена
  const entities = index.entities.filter(
    (e) => e.domainId.toLowerCase() === domainIdLower,
  );
  const entityByFqid = new Map(entities.map((e) => [e.fqid, e]));

  // Собираем все миксины, применённые к сущностям этого домена
  const allMixins: MixinRecord[] = [];
  entities.forEach((e) => {
    const ms = index.mixinsByEntityFqid[e.fqid] || [];
    allMixins.push(...ms);
  });

  // Группируем по домену-источнику
  const groupsMap = new Map<string, MixinRecord[]>();
  allMixins.forEach((m) => {
    if (!groupsMap.has(m.domainId)) groupsMap.set(m.domainId, []);
    groupsMap.get(m.domainId)!.push(m);
  });

  const groups: DomainMixinGroup[] = Array.from(groupsMap.entries()).map(
    ([sourceDomain, mixins]) => {
      const targetFqids = new Set(mixins.map((m) => m.targetEntityFqid));
      const targetEntities = Array.from(targetFqids)
        .map((fqid) => entityByFqid.get(fqid))
        .filter((x): x is EntityRecord => !!x);

      return {
        sourceDomain,
        mixins,
        targetEntities,
        totalTabs: mixins.reduce((s, m) => s + m.addedTabs.length, 0),
        totalComponents: mixins.reduce(
          (s, m) => s + m.addedComponents.length,
          0,
        ),
        totalBlocks: mixins.reduce((s, m) => s + m.addedBlocks.length, 0),
      };
    },
  );

  // Сортируем группы по количеству применённых миксинов (убывание)
  groups.sort((a, b) => b.mixins.length - a.mixins.length);

  // Сущности, затронутые миксинами
  const affectedFqids = new Set(allMixins.map((m) => m.targetEntityFqid));
  const affectedEntities = Array.from(affectedFqids)
    .map((fqid) => entityByFqid.get(fqid))
    .filter((x): x is EntityRecord => !!x);

  // Heavy targets — кто получил больше всего миксинов
  const countPerEntity = new Map<string, number>();
  allMixins.forEach((m) => {
    countPerEntity.set(
      m.targetEntityFqid,
      (countPerEntity.get(m.targetEntityFqid) || 0) + 1,
    );
  });
  const heavyTargets = Array.from(countPerEntity.entries())
    .map(([fqid, cnt]) => ({
      entity: entityByFqid.get(fqid)!,
      mixinCount: cnt,
    }))
    .filter((x) => x.entity && x.mixinCount >= 2)
    .sort((a, b) => b.mixinCount - a.mixinCount);

  // Конфликты — одинаковые табы добавляются к одной сущности из разных источников
  const conflicts: DomainMixinsResult["stats"]["conflicts"] = [];
  const byTarget = new Map<string, MixinRecord[]>();
  allMixins.forEach((m) => {
    if (!byTarget.has(m.targetEntityFqid)) byTarget.set(m.targetEntityFqid, []);
    byTarget.get(m.targetEntityFqid)!.push(m);
  });
  byTarget.forEach((mixins, fqid) => {
    // Сколько источников добавляет каждый tab
    const tabSources = new Map<string, Set<string>>();
    mixins.forEach((m) => {
      m.addedTabs.forEach((tab) => {
        if (!tabSources.has(tab)) tabSources.set(tab, new Set());
        tabSources.get(tab)!.add(m.domainId);
      });
    });
    tabSources.forEach((sources, tab) => {
      if (sources.size > 1) {
        conflicts.push({
          entityFqid: fqid,
          tab,
          sources: Array.from(sources).sort(),
        });
      }
    });
  });

  return {
    domainId,
    groups,
    affectedEntities,
    stats: {
      totalMixins: allMixins.length,
      totalSourceDomains: groupsMap.size,
      affectedEntitiesCount: affectedEntities.length,
      heavyTargets,
      conflicts,
    },
  };
}
