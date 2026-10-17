import type { ModelIndex } from "../../shared/model-types";
import type { MartinMetrics, MartinReport } from "../../shared/martin-types";

/**
 * Домен считается «абстрактным», если у него есть сущности с наследниками.
 * Правило упрощённое, но работает: абстракция = то, от чего наследуют.
 */
function computeAbstractness(
  index: ModelIndex,
  domainId: string,
  domainEntities: Set<string>,
): { total: number; abstract: number } {
  const total = domainEntities.size;
  if (total === 0) return { total: 0, abstract: 0 };

  let abstractCount = 0;
  domainEntities.forEach((fqid) => {
    const children = index.entityChildrenByFqid[fqid] || [];
    if (children.length > 0) abstractCount++;
  });

  return { total, abstract: abstractCount };
}

/**
 * Считает метрики Мартина для всех доменов.
 *
 * Логика зависимостей:
 *   - Ce: домен → домен, если есть:
 *     - inherits (сущность домена наследует сущность в другом домене)
 *     - Reference-атрибут (сущность в домене A ссылается на сущность в домене B)
 *     - linkage (связь между сущностями из разных доменов)
 *   - Ca: обратное — если другой домен зависит от этого.
 */
export function computeMartinReport(index: ModelIndex): MartinReport {
  // Собираем множество доменов и их сущностей
  const domainsByName = new Map<string, Set<string>>();
  index.entities.forEach((e) => {
    if (!domainsByName.has(e.domainId))
      domainsByName.set(e.domainId, new Set());
    domainsByName.get(e.domainId)!.add(e.fqid);
  });

  // Для каждой сущности — её домен
  const entityDomain = new Map<string, string>();
  index.entities.forEach((e) => entityDomain.set(e.fqid, e.domainId));

  // Граф зависимостей: domainId → Set<domainId>
  const efferentMap = new Map<string, Set<string>>();
  const afferentMap = new Map<string, Set<string>>();

  const addEdge = (from: string, to: string): void => {
    if (!from || !to) return;
    if (from === to) return;
    if (!efferentMap.has(from)) efferentMap.set(from, new Set());
    if (!afferentMap.has(to)) afferentMap.set(to, new Set());
    efferentMap.get(from)!.add(to);
    afferentMap.get(to)!.add(from);
  };

  // Inherits
  index.entities.forEach((e) => {
    if (!e.inherits) return;
    const targetDomain = entityDomain.get(e.inherits);
    if (targetDomain) addEdge(e.domainId, targetDomain);
  });

  // Reference-атрибуты
  index.entities.forEach((e) => {
    for (const a of e.attributes) {
      const target = a.referenceEntity || a.itemReferenceEntity;
      if (!target) continue;
      const targetDomain = entityDomain.get(target);
      if (targetDomain) addEdge(e.domainId, targetDomain);
    }
  });

  // Linkages
  for (const l of index.entityLinkages) {
    const d1 = entityDomain.get(l.side1Fqid);
    const d2 = entityDomain.get(l.side2Fqid);
    if (d1 && d2) {
      addEdge(d1, d2);
      // Если связь ненаправленная — добавляем в обе стороны
      if (l.symmetric) addEdge(d2, d1);
    }
  }

  // Метрики
  const metrics: MartinMetrics[] = [];

  domainsByName.forEach((entityFqids, domainId) => {
    const afferent = Array.from(afferentMap.get(domainId) || []).sort();
    const efferent = Array.from(efferentMap.get(domainId) || []).sort();

    const ca = afferent.length;
    const ce = efferent.length;
    const instability = ca + ce === 0 ? 0 : ce / (ca + ce);

    const { total: entitiesTotal, abstract: entitiesAbstract } =
      computeAbstractness(index, domainId, entityFqids);
    const abstractness =
      entitiesTotal === 0 ? 0 : entitiesAbstract / entitiesTotal;

    const distance = Math.abs(abstractness + instability - 1);

    // Классификация зон
    // main sequence: distance < 0.3 → хорошо
    // pain zone: A < 0.3, I < 0.3 (стабильный и конкретный)
    // uselessness: A > 0.7, I > 0.7 (абстрактный и никто не использует)
    let zone: MartinMetrics["zone"] = "unclassified";
    if (distance < 0.3) {
      zone = "main-sequence";
    } else if (abstractness < 0.3 && instability < 0.3) {
      zone = "pain";
    } else if (abstractness > 0.7 && instability > 0.7) {
      zone = "uselessness";
    }

    metrics.push({
      domainId,
      domainName:
        index.domains.find((d) => d.id === domainId)?.name || domainId,
      ca,
      ce,
      instability,
      abstractness,
      distance,
      zone,
      afferentDomains: afferent,
      efferentDomains: efferent,
      entitiesTotal,
      entitiesAbstract,
    });
  });

  // Сортировка по distance убыв.
  metrics.sort((a, b) => b.distance - a.distance);

  const painZone = metrics.filter((m) => m.zone === "pain");
  const uselessnessZone = metrics.filter((m) => m.zone === "uselessness");
  const mainSequence = metrics.filter((m) => m.zone === "main-sequence");

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, x) => s + x, 0) / arr.length;

  return {
    metrics,
    stats: {
      totalDomains: metrics.length,
      painZone,
      uselessnessZone,
      mainSequence,
    },
    averages: {
      instability: avg(metrics.map((m) => m.instability)),
      abstractness: avg(metrics.map((m) => m.abstractness)),
      distance: avg(metrics.map((m) => m.distance)),
    },
  };
}
