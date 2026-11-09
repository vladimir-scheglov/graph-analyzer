import yaml from "js-yaml";
import type { ModelIndex } from "../../../shared/model-types";

export interface PreSaveImpact {
  entitiesAdded: string[];
  entitiesRemoved: string[];
  entitiesChanged: string[];
  brokenRefs: Array<{
    fromDomainId: string;
    entityFqid: string;
    attributeId: string;
    targetEntity: string;
  }>;
  staleDomains: Array<{
    domainId: string;
    staleRefs: number;
  }>;
  hasImpact: boolean;
}

interface EntityShape {
  attrs: Set<string>;
  inherits: string | null;
}

function extractEntityIds(rawData: any): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(rawData?.entities)) return out;
  for (const e of rawData.entities) {
    if (e?.id) out.add(String(e.id).toLowerCase());
  }
  return out;
}

function extractEntityShapes(rawData: any): Map<string, EntityShape> {
  const out = new Map<string, EntityShape>();
  if (!Array.isArray(rawData?.entities)) return out;
  for (const e of rawData.entities) {
    if (!e?.id) continue;
    const attrs = new Set<string>();
    for (const a of e.attributes || []) {
      if (a?.id) attrs.add(String(a.id).toLowerCase());
    }
    out.set(String(e.id).toLowerCase(), {
      attrs,
      inherits: e.inherits ? String(e.inherits).toLowerCase() : null,
    });
  }
  return out;
}

function detectChangedEntities(savedData: any, currentData: any): Set<string> {
  const saved = extractEntityShapes(savedData);
  const current = extractEntityShapes(currentData);
  const changed = new Set<string>();

  saved.forEach((sShape, id) => {
    const cShape = current.get(id);
    if (!cShape) return; // removed — handled separately
    if (sShape.inherits !== cShape.inherits) {
      changed.add(id);
      return;
    }
    if (sShape.attrs.size !== cShape.attrs.size) {
      changed.add(id);
      return;
    }
    for (const a of sShape.attrs) {
      if (!cShape.attrs.has(a)) {
        changed.add(id);
        return;
      }
    }
  });
  return changed;
}

export function computePreSaveImpact(
  domainId: string,
  savedContent: string,
  currentContent: string,
  oldIndex: ModelIndex,
): PreSaveImpact | null {
  const domainLower = domainId.toLowerCase();

  let savedData: any;
  let currentData: any;
  try {
    savedData = (yaml.load(savedContent) as any) || {};
    currentData = (yaml.load(currentContent) as any) || {};
  } catch {
    // Невалидный YAML — сохранить всё равно не дадут, impact-preview не наша забота
    return null;
  }

  const savedIds = extractEntityIds(savedData);
  const currentIds = extractEntityIds(currentData);

  const removedIds = new Set<string>();
  savedIds.forEach((id) => {
    if (!currentIds.has(id)) removedIds.add(id);
  });
  const changedIds = detectChangedEntities(savedData, currentData);

  const entitiesAdded: string[] = [];
  currentIds.forEach((id) => {
    if (!savedIds.has(id)) entitiesAdded.push(id);
  });

  // Нет дельты сущностей — нет cross-domain impact'а.
  // (Метаданные / views / actions могут измениться — это не про cross-domain.)
  if (removedIds.size === 0 && changedIds.size === 0) {
    return {
      entitiesAdded,
      entitiesRemoved: [],
      entitiesChanged: [],
      brokenRefs: [],
      staleDomains: [],
      hasImpact: false,
    };
  }

  const removedFqids = new Set<string>();
  removedIds.forEach((id) => removedFqids.add(`${domainLower}/${id}`));

  const changedFqids = new Set<string>();
  changedIds.forEach((id) => changedFqids.add(`${domainLower}/${id}`));

  const brokenRefs: PreSaveImpact["brokenRefs"] = [];
  const staleByDomain = new Map<string, number>();

  for (const e of oldIndex.entities) {
    if (e.domainId.toLowerCase() === domainLower) continue;

    // inherits
    if (e.inherits) {
      const tLower = e.inherits.toLowerCase();
      if (removedFqids.has(tLower)) {
        brokenRefs.push({
          fromDomainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: "<inherits>",
          targetEntity: tLower.split("/")[1] || tLower,
        });
      } else if (changedFqids.has(tLower)) {
        staleByDomain.set(e.domainId, (staleByDomain.get(e.domainId) || 0) + 1);
      }
    }

    // attributes
    for (const a of e.attributes) {
      const t = a.referenceEntity || a.itemReferenceEntity;
      if (!t) continue;
      const tLower = t.toLowerCase();
      if (removedFqids.has(tLower)) {
        brokenRefs.push({
          fromDomainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: a.id,
          targetEntity: tLower.split("/")[1] || tLower,
        });
      } else if (changedFqids.has(tLower)) {
        staleByDomain.set(e.domainId, (staleByDomain.get(e.domainId) || 0) + 1);
      }
    }
  }

  return {
    entitiesAdded,
    entitiesRemoved: Array.from(removedIds),
    entitiesChanged: Array.from(changedIds),
    brokenRefs,
    staleDomains: Array.from(staleByDomain.entries()).map(([d, n]) => ({
      domainId: d,
      staleRefs: n,
    })),
    hasImpact: brokenRefs.length > 0 || staleByDomain.size > 0,
  };
}
