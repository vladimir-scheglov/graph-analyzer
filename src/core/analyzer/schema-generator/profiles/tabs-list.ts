import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildTabsView } from "../builders/views-tabs";

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
}

/**
 * Профиль `tabs-list`.
 *
 * Генерирует:
 *   1) view type=tabs_list c указанными list-view в качестве вкладок;
 *   2) опционально — menu item, ведущий на этот tabs_list.
 *
 * Сущность используется только как anchor для route/label menu item
 * (если включён `tabsIncludeMenu`). Никаких per-entity блоков
 * (actions, widgets, groups) не создаётся.
 */
export function runTabsListProfile(
  ctx: EntityGenerationContext,
  options: {
    tabsListIds?: string[];
    tabsViewId?: string;
    tabsLabel?: string;
    tabsDefaultTab?: string;
    tabsIncludeMenu?: boolean;
    skipExisting: boolean;
    menuRootId?: string;
  },
): ProfileResult {
  const blocks: GeneratedBlock[] = [];
  const skipped: ProfileResult["skipped"] = [];

  const tabsView = buildTabsView(ctx, {
    tabsListIds: options.tabsListIds || [],
    tabsViewId: options.tabsViewId,
    tabsLabel: options.tabsLabel,
    tabsDefaultTab: options.tabsDefaultTab,
    skipExisting: options.skipExisting,
  });
  blocks.push(...tabsView.blocks);
  skipped.push(...tabsView.skipped);

  // Menu item — только если явно запрошен, есть root и сгенерирован view.
  if (options.tabsIncludeMenu && tabsView.blocks.length > 0 && ctx.menuRoot) {
    const E = ctx.entity.entityId;
    const itemId = `${E}TabsMenu`;
    const blockId = `menuItem:${ctx.menuRoot.id}/${itemId}`;
    const rootRoute = (ctx.menuRoot.route || "").replace(/\/+$/, "");
    const route = `${rootRoute}/${E.toLowerCase()}-tabs`;

    if (ctx.existing.menuItems.has(itemId)) {
      skipped.push({
        blockId,
        section: "menus",
        id: itemId,
        reason: "already-exists",
      });
    } else {
      blocks.push({
        blockId,
        section: "menus",
        groupPath: ["menus", ctx.menuRoot.id],
        payload: {
          id: itemId,
          route,
          label: options.tabsLabel || `${E} (вкладки)`,
          type: "menu",
          view: tabsView.viewId,
        },
        dependsOn: [`view:${tabsView.viewId}`],
        dependents: [],
        title: `Пункт меню ${itemId} → ${tabsView.viewId}`,
        menuRootId: ctx.menuRoot.id,
      });
    }
  }

  return { blocks, skipped };
}
