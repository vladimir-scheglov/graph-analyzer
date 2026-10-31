import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GeneratorSectionKey, TreeChain } from "../types";
import { buildTransitiveChain } from "../builders/transitive-chain";

import type { ModelIndex } from "../../../../shared/model-types";

export interface ViewCandidate {
  id: string;
  type: string;
  entityFqid: string | null;
}

/**
 * Возвращает все view домена указанного type, чья entity равна rootFqid.
 * Entity-views матчатся по `entity`, list/tree-views — по `source.entity`.
 */
export function findViewsForRoot(
  index: ModelIndex,
  domainId: string,
  rootEntityId: string,
  types: string[],
): ViewCandidate[] {
  const rootFqid = `${domainId}/${rootEntityId}`.toLowerCase();
  const schema = index.schemasByDomain?.[domainId];
  const items: any[] = schema?.sections?.views?.items || [];

  const out: ViewCandidate[] = [];
  for (const v of items) {
    if (!types.includes(String(v.type))) continue;
    const rawEntity = v.type === "entity" ? v.entity : v.sourceEntity;
    if (!rawEntity) continue;
    const fqid = String(rawEntity).includes("/")
      ? String(rawEntity).toLowerCase()
      : `${domainId}/${rawEntity}`.toLowerCase();
    if (fqid !== rootFqid) continue;
    out.push({
      id: String(v.id),
      type: String(v.type),
      entityFqid: fqid,
    });
  }
  return out;
}

export interface ResolvedView {
  id: string | null;
  reason: "ok" | "not-found" | "wrong-type" | "wrong-entity" | "ambiguous";
}

/**
 * Разрешает целевой view для join-виджета/колонки.
 *   - явный override + он валиден → ok;
 *   - явный override + не найден → not-found;
 *   - явный override + не того типа → wrong-type;
 *   - явный override + принадлежит другой сущности → wrong-entity;
 *   - без override + дефолтный id существует и валиден → ok;
 *   - без override + дефолта нет, но ровно один кандидат → ok (auto);
 *   - без override + 0 кандидатов → not-found;
 *   - без override + 2+ кандидата → ambiguous (нужен явный выбор).
 */
export function resolveTargetView(
  index: ModelIndex,
  domainId: string,
  rootEntityId: string,
  types: string[],
  overrideId: string | undefined,
  defaultId: string,
): ResolvedView {
  const candidates = findViewsForRoot(index, domainId, rootEntityId, types);
  const candidateIds = new Set(candidates.map((c) => c.id));

  if (overrideId) {
    if (candidateIds.has(overrideId)) return { id: overrideId, reason: "ok" };
    // Явно выбранный id есть в домене — но не тот type / не та entity.
    const anyView = (
      index.schemasByDomain?.[domainId]?.sections?.views?.items || []
    ).find((v: any) => String(v.id) === overrideId);
    if (!anyView) return { id: overrideId, reason: "not-found" };
    if (!types.includes(String(anyView.type))) {
      return { id: overrideId, reason: "wrong-type" };
    }
    return { id: overrideId, reason: "wrong-entity" };
  }

  if (candidateIds.has(defaultId)) return { id: defaultId, reason: "ok" };
  if (candidates.length === 1) return { id: candidates[0].id, reason: "ok" };
  if (candidates.length === 0) return { id: defaultId, reason: "not-found" };
  return { id: null, reason: "ambiguous" };
}

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
}

export function runTransitiveChainProfile(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: {
    transitiveChain?: TreeChain;
    transitiveTreeId?: string;
    transitiveIncludeWidget: boolean;
    transitiveIncludeListColumn: boolean;
    transitiveLabel?: string;
    transitiveWidgetViewId?: string;
    transitiveColumnViewId?: string;
    skipExisting: boolean;
  },
): ProfileResult {
  const result = buildTransitiveChain(ctx, index, {
    chain: options.transitiveChain || [],
    treeId: options.transitiveTreeId,
    includeWidget: options.transitiveIncludeWidget,
    includeListColumn: options.transitiveIncludeListColumn,
    label: options.transitiveLabel,
    widgetViewId: options.transitiveWidgetViewId,
    columnViewId: options.transitiveColumnViewId,
    skipExisting: options.skipExisting,
  });
  return { blocks: result.blocks, skipped: result.skipped };
}
