import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock } from "../types";

export interface TabsViewResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
    hint?: string;
  }>;
  viewId: string;
}

/**
 * Генерирует view type=tabs_list. Каждый id из `tabsListIds` должен
 * резолвиться в существующий list-view домена — preflight/lint его проверит.
 *
 * Блок top-level (groupPath: ["views"]) — append через planSectionAppend
 * в apply-generation.
 */
export function buildTabsView(
  ctx: EntityGenerationContext,
  options: {
    tabsListIds: string[];
    tabsViewId?: string;
    tabsLabel?: string;
    tabsDefaultTab?: string;
    skipExisting: boolean;
  },
): TabsViewResult {
  const defaultViewId =
    options.tabsViewId && options.tabsViewId.trim()
      ? options.tabsViewId.trim()
      : `tabs_${ctx.entity.entityId.toLowerCase()}`;
  const viewId = defaultViewId;

  const skipBase = {
    blockId: `view:${viewId}`,
    section: "views" as const,
    id: viewId,
  };

  // Нет вкладок — нечего генерировать
  if (!options.tabsListIds || options.tabsListIds.length === 0) {
    return {
      blocks: [],
      skipped: [
        {
          ...skipBase,
          reason: "no-tab-views",
          hint: "Выберите хотя бы один list-view в разделе «Параметры tabs-list»",
        },
      ],
      viewId,
    };
  }

  if (options.skipExisting && ctx.existing.views.has(viewId)) {
    return {
      blocks: [],
      skipped: [{ ...skipBase, reason: "already-exists" }],
      viewId,
    };
  }

  const payload: any = {
    id: viewId,
    type: "tabs_list",
    tabs: options.tabsListIds.map((id) => ({ view: id })),
  };
  if (options.tabsLabel) payload.label = options.tabsLabel;
  if (options.tabsDefaultTab) payload.defaultTab = options.tabsDefaultTab;

  return {
    blocks: [
      {
        blockId: `view:${viewId}`,
        section: "views",
        groupPath: ["views"],
        payload,
        dependsOn: [],
        dependents: [],
        title: `Tabs-list ${viewId} (${options.tabsListIds.length} вкладок)`,
      },
    ],
    skipped: [],
    viewId,
  };
}
