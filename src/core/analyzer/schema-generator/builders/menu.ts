import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock } from "../types";

export function buildMenu(
  ctx: EntityGenerationContext,
  options: { skipExisting: boolean },
): {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "menus";
    id: string;
    reason: string;
  }>;
} {
  const E = ctx.entity.entityId;
  const itemId = `${E}Menu`;
  const listViewId = `lists_${E.toLowerCase()}`;
  const blockId = `menuItem:${ctx.menuRoot?.id || "?"}/${itemId}`;

  if (ctx.flags.isDictionary || !ctx.flags.hasListUi) {
    return {
      blocks: [],
      skipped: [
        { blockId, section: "menus", id: itemId, reason: "no-list-ui" },
      ],
    };
  }
  if (!ctx.menuRoot) {
    return {
      blocks: [],
      skipped: [
        { blockId, section: "menus", id: itemId, reason: "no-menu-root" },
      ],
    };
  }
  if (ctx.existing.menuItems.has(itemId)) {
    return {
      blocks: [],
      skipped: [
        { blockId, section: "menus", id: itemId, reason: "already-exists" },
      ],
    };
  }

  const rootRoute = (ctx.menuRoot.route || "").replace(/\/+$/, "");
  const route = `${rootRoute}/${E.toLowerCase()}`;

  return {
    blocks: [
      {
        blockId,
        section: "menus",
        groupPath: ["menus", ctx.menuRoot.id],
        payload: {
          id: itemId,
          route,
          label: ctx.entity.name || E,
          type: "menu",
          view: listViewId,
        },
        dependsOn: [`view:${listViewId}`],
        dependents: [],
        title: `Пункт меню ${itemId} → ${listViewId}`,
        menuRootId: ctx.menuRoot.id,
      },
    ],
    skipped: [],
  };
}
