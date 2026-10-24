import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GenerationOptions } from "../types";

export interface ViewListResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
  }>;
}

export function buildViewList(
  ctx: EntityGenerationContext,
  options: Required<Pick<GenerationOptions, "skipExisting" | "includeBulk">> & {
    includePage: boolean;
  },
  selectedActionIds: Set<string>,
): ViewListResult {
  const E = ctx.entity.entityId;
  const eLower = E.toLowerCase();
  const viewId = `lists_${eLower}`;

  if (ctx.flags.isDictionary || !ctx.flags.hasListUi) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `view:${viewId}`,
          section: "views",
          id: viewId,
          reason: "no-list-ui",
        },
      ],
    };
  }
  if (options.skipExisting && ctx.existing.views.has(viewId)) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `view:${viewId}`,
          section: "views",
          id: viewId,
          reason: "already-exists",
        },
      ],
    };
  }

  const columns = ctx.entity.attributes.map((a) => ({
    id: a.id,
    attribute: a.id,
    label: a.id,
    layout: { width: { default: 120, min: 50, max: 300 } },
  }));

  const sortingCols: Array<{ column: string; sorting: string }> = [];
  for (const s of ctx.entity.sorting || []) {
    if (!s.by || s.by.length === 0) continue;
    sortingCols.push({ column: s.by[0].attribute, sorting: s.id });
  }
  const sortingBy =
    sortingCols.length > 0
      ? {
          columns: sortingCols,
          defaults: {
            column: sortingCols[0].column,
            direction: "asc" as const,
          },
        }
      : undefined;

  const has = (id: string) => selectedActionIds.has(id);

  const tableActions: any[] = [];
  if (has(`actions_open${E}Panel`)) {
    tableActions.push({ type: "row_click", action: `actions_open${E}Panel` });
  }
  const contextMenu: any[] = [];
  if (!ctx.flags.isReadonly && has(`actions_edit${E}`))
    contextMenu.push({
      action: `actions_edit${E}`,
      label: "Изменить",
      icon: "iconsEdit",
    });
  if (has(`actions_remove${E}`))
    contextMenu.push({
      action: `actions_remove${E}`,
      label: "Удалить",
      icon: "iconsDelete",
    });
  if (options.includePage && has(`actions_open${E}Page`))
    contextMenu.push({
      action: `actions_open${E}Page`,
      label: "Полный экран",
      icon: "iconsView",
    });
  if (contextMenu.length > 0)
    tableActions.push({ type: "row_context_menu", menu: contextMenu });

  const actionPanel: any[] = [];
  if (!ctx.flags.isReadonly && has(`actions_create${E}`))
    actionPanel.push({ widget: `buttons_create${E}` });
  if (options.includeBulk && has(`actions_bulkRemove${E}`))
    actionPanel.push({ widget: `buttons_bulkRemove${E}` });

  const payload = {
    id: viewId,
    type: "list",
    source: { type: "operational", entity: E },
    label: ctx.entity.name || E,
    actionPanel,
    table: {
      columns,
      filter: { attributes: { type: "all" } },
      sortingBy,
      paging: { sizes: [10, 50, 100], defaultSize: 50 },
      refresh: {
        mode: "all",
        defaults: { enabled: true, unit: "second", interval: 30 },
      },
      actions: tableActions,
      selection: true,
      empty: { message: "Данные отсутствуют" },
    },
  };

  return {
    blocks: [
      {
        blockId: `view:${viewId}`,
        section: "views",
        groupPath: ["views"],
        payload,
        dependsOn: [`view:view${E}`],
        dependents: [],
        title: `List-view ${viewId}`,
      },
    ],
    skipped: [],
  };
}
