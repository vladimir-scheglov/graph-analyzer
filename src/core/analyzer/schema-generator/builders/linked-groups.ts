// src/core/analyzer/schema-generator/builders/linked-groups.ts
import type { ModelIndex } from "../../../../shared/model-types";
import type { EntityGenerationContext } from "../detect";
import { resolveTargetView } from "../profiles/transitive-chain";
import type { GeneratedBlock } from "../types";

/** Первый String-атрибут peer-сущности; fallback — label (системный). */
function pickGroupingAttr(peerFqid: string, index: ModelIndex): string {
  const peer = index.entitiesByFqid[peerFqid];
  if (!peer) return "label";
  const str = peer.attributes.find((a) => a.dataType === "String");
  return str?.id ?? "label";
}

function shortenId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

export interface LinkedGroupsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
    hint?: string;
  }>;
}

/**
 * Для каждой side=2-«множественной» связи сущности (widgetKind === "linkage_list")
 * генерирует:
 *   1) widget linked_objects_groups <entity-view>
 *   2) группу block с единственным компонентом
 *
 * Виджет кладётся в существующий viewX (entity-view) — если его нет,
 * генерация невозможна (skip).
 *
 * В panels/tabs НЕ добавляется — это ответственность пользователя
 * (или CRUD-профиля).
 */
export function buildLinkedGroups(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: {
    includeSingles: boolean;
    skipExisting: boolean;
  },
): LinkedGroupsResult {
  const E = ctx.entity.entityId;
  const resolved = resolveTargetView(
    index,
    ctx.domainId,
    E,
    ["entity"],
    undefined,
    `view${E}`,
  );
  if (resolved.reason !== "ok" || !resolved.id) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `view:view${E}`,
          section: "views",
          id: `view${E}`,
          reason: "no-entity-view",
          hint: `У сущности нет entity-view — сгенерируйте профиль CRUD или Справочник, либо создайте вручную`,
        },
      ],
    };
  }
  const viewId = resolved.id;

  const existingWidgets =
    ctx.existing.viewWidgetIds.get(viewId) || new Set<string>();
  const existingGroups =
    ctx.existing.viewGroupIds.get(viewId) || new Set<string>();

  const blocks: GeneratedBlock[] = [];
  const skipped: LinkedGroupsResult["skipped"] = [];

  // Группируем по peer-сущности: одна linkage_list на peer
  const byPeer = new Map<string, (typeof ctx.linkages)[number][]>();
  for (const lk of ctx.linkages) {
    if (!options.includeSingles && lk.widgetKind !== "linkage_list") continue;
    const key = lk.peerFqid;
    if (!byPeer.has(key)) byPeer.set(key, []);
    byPeer.get(key)!.push(lk);
  }

  for (const [peerFqid, linkages] of byPeer) {
    const groupingAttr = pickGroupingAttr(peerFqid, index);
    const peerShort = peerFqid.split("/").pop() || peerFqid;
    const safePeer = shortenId(peerShort);

    const widgetId = `widget_linkedGroups_${E}_${safePeer}`;
    const groupId = `blocks_linkedGroups_${E}_${safePeer}`;
    const widgetBlockId = `widget:${viewId}/${widgetId}`;
    const groupBlockId = `group:${viewId}/${groupId}`;

    // linkage-источники: используем все связи с этим peer (обычно одна)
    const linkageRefs = linkages.map((lk) => ({
      linkage: lk.linkageId,
      side: lk.side,
    }));

    if (options.skipExisting && existingWidgets.has(widgetId)) {
      skipped.push({
        blockId: widgetBlockId,
        section: "views",
        id: widgetId,
        reason: "already-exists",
      });
    } else {
      blocks.push({
        blockId: widgetBlockId,
        section: "views",
        groupPath: ["views", viewId, "widgets"],
        payload: {
          id: widgetId,
          type: "linked_objects_groups",
          linkages: linkageRefs,
          groupingBy: [{ attribute: groupingAttr }],
          control: { type: "table" },
          columns: [
            { id: groupingAttr, attribute: groupingAttr, label: groupingAttr },
            { id: "totalCount", attribute: "totalCount", label: "Всего" },
          ],
        },
        dependsOn: [],
        dependents: [],
        title: `Linked groups: ${peerShort}`,
        parentViewId: viewId,
      });
    }

    // Группа block — обёртка для виджета
    if (options.skipExisting && existingGroups.has(groupId)) {
      skipped.push({
        blockId: groupBlockId,
        section: "views",
        id: groupId,
        reason: "already-exists",
      });
    } else {
      blocks.push({
        blockId: groupBlockId,
        section: "views",
        groupPath: ["views", viewId, "groups"],
        payload: {
          id: groupId,
          type: "block",
          label: `Связанные: ${peerShort}`,
          layout: { direction: "column", expandable: false },
          components: [{ widget: widgetId }],
        },
        dependsOn: [`widget:${viewId}/${widgetId}`],
        dependents: [],
        title: `Блок ${groupId}`,
        parentViewId: viewId,
      });
    }
  }

  return { blocks, skipped };
}
