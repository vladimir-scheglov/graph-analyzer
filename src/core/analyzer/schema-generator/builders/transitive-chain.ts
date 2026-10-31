import { ModelIndex } from "../../../../shared/model-types";
import type { EntityGenerationContext } from "../detect";
import { resolveTargetView } from "../profiles/transitive-chain";
import type { GeneratedBlock, TreeChain } from "../types";

function lastStep(chain: TreeChain): TreeChain[number] | null {
  return chain.length > 0 ? chain[chain.length - 1] : null;
}

function shortEntity(fqid: string): string {
  const slash = fqid.indexOf("/");
  return slash > 0 ? fqid.slice(slash + 1) : fqid;
}

/**
 * Строит вложенную цепочку joins: [step0, step1, step2] →
 * [{ id: tree_0, linkage: step0, side,
 *    joins: [{ id: tree_1, linkage: step1, side,
 *              joins: [{ id: tree_2, ... }] }] }].
 *
 * join-id детерминированный (`${treeId}_${idx}`), поэтому при
 * регенерации с тем же порядком шагов join-id не меняются →
 * manifest статус `unchanged`, виджет/колонка не пересоздаются.
 */
function buildNestedJoins(
  chain: TreeChain,
  treeId: string,
): Array<{ id: string; linkage: string; side: 1 | 2; joins?: any[] }> {
  if (chain.length === 0) return [];

  const build = (idx: number): any => {
    const step = chain[idx];
    const node: any = {
      id: `${treeId}_${idx}`,
      linkage: step.linkageId,
      side: step.side,
    };
    if (idx + 1 < chain.length) {
      node.joins = [build(idx + 1)];
    }
    return node;
  };

  return [build(0)];
}

export interface TransitiveChainResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "transitiveLinkages" | "views" | "columns";
    id: string;
    reason: string;
    hint?: string;
  }>;
  treeId: string | null;
  lastJoinId: string | null;
}

/**
 * Генерирует транзитивную связь и её потребителей:
 *   1) transitiveLinkages[<treeId>]
 *   2) widget:viewX/<widgetId>  — только если viewX существует
 *   3) column:lists_<e>/<colId> — только если lists_<e> существует
 *
 * join-id для каждого шага: `<treeId>_<idx>`. Это стабильно — при
 * регенерации chain с тем же порядком join-id сохраняются, manifest
 * может опознать `unchanged`.
 */
export function buildTransitiveChain(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: {
    chain: TreeChain;
    treeId?: string;
    includeWidget: boolean;
    includeListColumn: boolean;
    label?: string;
    widgetViewId?: string;
    columnViewId?: string;
    skipExisting: boolean;
  },
): TransitiveChainResult {
  const E = ctx.entity.entityId;
  const eLower = E.toLowerCase();

  if (!options.chain || options.chain.length === 0) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `transitiveLinkage:(pending)`,
          section: "transitiveLinkages",
          id: "(не задана)",
          reason: "no-chain",
          hint: "Постройте цепочку связей в разделе «Цепочка транзитивной связи» — без неё дерево не генерируется",
        },
      ],
      treeId: null,
      lastJoinId: null,
    };
  }

  const treeId =
    options.treeId && options.treeId.trim()
      ? options.treeId.trim()
      : `${E}TransitiveTree`;

  // join-id для каждого шага — детерминированные по индексу
  const nestedJoins = buildNestedJoins(options.chain, treeId);
  // lastJoinId — тот же, что и раньше, но без промежуточного массива
  const lastJoinId = `${treeId}_${options.chain.length - 1}`;
  // для message/skipped ниже — используется options.chain[last]

  const blocks: GeneratedBlock[] = [];
  const skipped: TransitiveChainResult["skipped"] = [];

  // ── 1. transitiveLinkages[treeId] ──
  const tlBlockId = `transitiveLinkage:${treeId}`;
  if (
    options.skipExisting &&
    (ctx.existing as any).transitiveLinkages?.has?.(treeId)
  ) {
    // existing.transitiveLinkages не заполняется в detect — fallback: всегда emit
  }

  blocks.push({
    blockId: tlBlockId,
    section: "transitiveLinkages",
    groupPath: ["transitiveLinkages"],
    payload: {
      id: treeId,
      entity: `${ctx.domainId}/${E}`,
      description: options.label || `Цепочка от ${E}`,
      joins: nestedJoins,
    },
    dependsOn: [],
    dependents: [],
    title: `Транзитивная связь ${treeId} (${options.chain.length} хопов)`,
  });

  // ── 2. join-виджет в viewX ──
  const label =
    options.label ||
    shortEntity(options.chain[options.chain.length - 1].childEntityId);

  // ── 2. join-виджет в entity-view ──
  if (options.includeWidget) {
    const widgetId = `widget_${lastJoinId}`;
    const widgetBlockId = `widget:(pending)/${widgetId}`;
    const resolved = resolveTargetView(
      index,
      ctx.domainId,
      E,
      ["entity"],
      options.widgetViewId,
      `view${E}`,
    );

    if (resolved.reason === "ambiguous") {
      skipped.push({
        blockId: widgetBlockId,
        section: "views",
        id: widgetId,
        reason: "widget-view-ambiguous",
        hint: `В домене несколько entity-view для «${E}». Выберите нужный в поле «Entity-view для виджета» — генератор не угадывает`,
      });
    } else if (resolved.reason !== "ok" || !resolved.id) {
      skipped.push({
        blockId: widgetBlockId,
        section: "views",
        id: widgetId,
        reason:
          resolved.reason === "wrong-type"
            ? "widget-view-wrong-type"
            : resolved.reason === "wrong-entity"
              ? "widget-view-wrong-entity"
              : "no-entity-view",
        hint:
          resolved.reason === "wrong-type"
            ? `«${resolved.id}» — не entity-view. Выберите entity-view сущности «${E}»`
            : resolved.reason === "wrong-entity"
              ? `«${resolved.id}» принадлежит другой сущности. Join-виджет можно положить только в entity-view сущности «${E}»`
              : `Сгенерируйте entity-view для «${E}» (профиль CRUD или Справочник) — виджет «${label}» добавится при повторной генерации`,
      });
    } else {
      const targetViewId = resolved.id;
      const finalBlockId = `widget:${targetViewId}/${widgetId}`;
      const existingWidgets =
        ctx.existing.viewWidgetIds.get(targetViewId) || new Set<string>();
      if (options.skipExisting && existingWidgets.has(widgetId)) {
        skipped.push({
          blockId: finalBlockId,
          section: "views",
          id: widgetId,
          reason: "already-exists",
        });
      } else {
        blocks.push({
          blockId: finalBlockId,
          section: "views",
          groupPath: ["views", targetViewId, "widgets"],
          payload: {
            id: widgetId,
            type: "join",
            joinId: lastJoinId,
            attribute: "label",
            label,
          },
          dependsOn: [tlBlockId],
          dependents: [],
          title: `Виджет ${widgetId} (join) → ${targetViewId}`,
          parentViewId: targetViewId,
        });
      }
    }
  }

  // ── 3. join-колонка в list-view ──
  if (options.includeListColumn) {
    const colId = `${lastJoinId}_col`;
    const colBlockId = `column:(pending)/${colId}`;
    const resolved = resolveTargetView(
      index,
      ctx.domainId,
      E,
      ["list", "tree"],
      options.columnViewId,
      `lists_${eLower}`,
    );

    if (resolved.reason === "ambiguous") {
      skipped.push({
        blockId: colBlockId,
        section: "columns",
        id: colId,
        reason: "column-view-ambiguous",
        hint: `В домене несколько list/tree-view для «${E}». Выберите нужный в поле «List-view для колонки»`,
      });
    } else if (resolved.reason !== "ok" || !resolved.id) {
      skipped.push({
        blockId: colBlockId,
        section: "columns",
        id: colId,
        reason:
          resolved.reason === "wrong-type"
            ? "column-view-wrong-type"
            : resolved.reason === "wrong-entity"
              ? "column-view-wrong-entity"
              : "no-list-view",
        hint:
          resolved.reason === "wrong-type"
            ? `«${resolved.id}» — не list/tree-view. Колонку с join можно положить только в list или tree`
            : resolved.reason === "wrong-entity"
              ? `«${resolved.id}» принадлежит другой сущности. Join-колонка доступна только в list/tree сущности «${E}»`
              : `Сгенерируйте list-view для «${E}» (профиль CRUD) — колонка «${label}» добавится в table.columns[] при повторной генерации`,
      });
    } else {
      const targetViewId = resolved.id;
      blocks.push({
        blockId: `column:${targetViewId}/${colId}`,
        section: "columns",
        groupPath: ["views", targetViewId, "columns"],
        payload: {
          id: colId,
          join: lastJoinId,
          attribute: "label",
          label,
        },
        dependsOn: [tlBlockId],
        dependents: [],
        title: `Колонка ${colId} в ${targetViewId}`,
        parentViewId: targetViewId,
      });
    }
  }

  return { blocks, skipped, treeId, lastJoinId };
}
