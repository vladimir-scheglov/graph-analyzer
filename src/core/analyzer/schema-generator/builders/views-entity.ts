import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GenerationOptions } from "../types";

function pickLabel(entity: {
  label: string | null;
  entityId: string;
  attributes: Array<{ id: string }>;
}): string {
  if (entity.label) return entity.label;
  return `{${entity.attributes[0]?.id || "id"}}`;
}

export interface ViewEntityResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
  }>;
}

export function buildViewEntity(
  ctx: EntityGenerationContext,
  options: Required<Pick<GenerationOptions, "skipExisting" | "includeBulk">> & {
    includePage: boolean;
    includeLinkageWidgets: boolean;
    excludeReadonlyFromCreate: boolean;
  },
  selectedActionIds: Set<string>,
): ViewEntityResult {
  const E = ctx.entity.entityId;
  const eLower = E.toLowerCase();
  const viewId = `view${E}`;

  if (ctx.flags.isDictionary) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `view:${viewId}`,
          section: "views",
          id: viewId,
          reason: "dictionary",
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

  // ---- widgets: attribute ----
  const widgets: any[] = [];
  const attrWidgetId = (attrId: string) => `editors_${eLower}_${attrId}`;
  for (const a of ctx.entity.attributes) {
    widgets.push({
      id: attrWidgetId(a.id),
      type: "attribute",
      attribute: a.id,
    });
  }

  // ---- widgets: action buttons (attr → buttons → linkage) ----
  const has = (id: string) => selectedActionIds.has(id);
  const actionWidget = (id: string, action: string, label: string) =>
    widgets.push({
      id,
      type: "action",
      action,
      control: { type: "regular_button", label },
    });

  if (!ctx.flags.isReadonly && has(`actions_create${E}`))
    actionWidget(`buttons_create${E}`, `actions_create${E}`, "Добавить");
  if (!ctx.flags.isReadonly && has(`actions_edit${E}`))
    actionWidget(`buttons_edit${E}`, `actions_edit${E}`, "Изменить");
  if (has(`actions_remove${E}`))
    actionWidget(`buttons_remove${E}`, `actions_remove${E}`, "Удалить");
  if (options.includeBulk && has(`actions_bulkRemove${E}`))
    actionWidget(
      `buttons_bulkRemove${E}`,
      `actions_bulkRemove${E}`,
      "Удалить выбранные",
    );
  if (options.includePage && has(`actions_open${E}Page`))
    actionWidget(
      `buttons_open${E}Page`,
      `actions_open${E}Page`,
      "Полный экран",
    );

  // ---- widgets: linkage ----
  const linkageWidgetIds: string[] = [];
  if (options.includeLinkageWidgets) {
    for (const lk of ctx.linkages) {
      linkageWidgetIds.push(lk.widgetId);
      if (lk.widgetKind === "linkage") {
        widgets.push({
          id: lk.widgetId,
          type: "linkage",
          side: lk.side,
          label: lk.label,
          linkage: lk.linkageId,
        });
      } else {
        widgets.push({
          id: lk.widgetId,
          type: "linkage_list",
          side: lk.side,
          label: lk.label,
          rules: { includes: [{ id: ctx.domainId, only: [lk.linkageId] }] },
        });
      }
    }
  }

  // ---- widgets: action buttons ----

  if (!ctx.flags.isReadonly && has(`actions_create${E}`))
    actionWidget(`buttons_create${E}`, `actions_create${E}`, "Добавить");
  if (!ctx.flags.isReadonly && has(`actions_edit${E}`))
    actionWidget(`buttons_edit${E}`, `actions_edit${E}`, "Изменить");
  if (has(`actions_remove${E}`))
    actionWidget(`buttons_remove${E}`, `actions_remove${E}`, "Удалить");
  if (options.includeBulk && has(`actions_bulkRemove${E}`))
    actionWidget(
      `buttons_bulkRemove${E}`,
      `actions_bulkRemove${E}`,
      "Удалить выбранные",
    );
  if (options.includePage && has(`actions_open${E}Page`))
    actionWidget(
      `buttons_open${E}Page`,
      `actions_open${E}Page`,
      "Полный экран",
    );

  // ---- groups ----
  const allEditorIds = [
    ...ctx.entity.attributes.map((a) => attrWidgetId(a.id)),
    ...linkageWidgetIds,
  ];
  const nonReadonlyEditorIds = [
    ...ctx.entity.attributes
      .filter((a) => !a.readonly)
      .map((a) => attrWidgetId(a.id)),
    ...linkageWidgetIds,
  ];
  const newEditorIds = options.excludeReadonlyFromCreate
    ? nonReadonlyEditorIds
    : allEditorIds;

  const groups: any[] = [];
  if (!ctx.flags.isReadonly) {
    groups.push({
      id: `blocks_forms_new${E}`,
      type: "form",
      layout: { direction: "column" },
      components: newEditorIds.map((w) => ({ widget: w })),
    });
    groups.push({
      id: `blocks_forms_edit${E}`,
      type: "form",
      layout: { direction: "column" },
      components: nonReadonlyEditorIds.map((w) => ({ widget: w })),
    });
  }
  groups.push({
    id: `blocks_info${E}`,
    type: "block",
    layout: { direction: "column", expandable: false },
    components: allEditorIds.map((w) => ({ widget: w })),
  });
  groups.push({
    id: `tabs_info${E}`,
    type: "tab",
    label: "Детали",
    components: [{ block: `blocks_info${E}` }],
  });

  for (const lk of ctx.linkages) {
    if (lk.widgetKind !== "linkage_list") continue;
    groups.push({
      id: lk.blockId,
      type: "block",
      layout: { direction: "column", expandable: false },
      components: [{ widget: lk.widgetId }],
    });
    groups.push({
      id: lk.tabId,
      type: "tab",
      label: lk.label,
      components: [{ block: lk.blockId }],
    });
  }

  // ---- nested views ----
  const nested: any[] = [];

  // panel
  const panelMenu: any[] = [];
  if (!ctx.flags.isReadonly && has(`actions_edit${E}`))
    panelMenu.push({ action: `actions_edit${E}` });
  if (has(`actions_remove${E}`))
    panelMenu.push({ action: `actions_remove${E}` });
  if (options.includePage && has(`actions_open${E}Page`))
    panelMenu.push({ action: `actions_open${E}Page` });

  const panelTabs: any[] = [{ tab: `tabs_info${E}` }];
  for (const lk of ctx.linkages)
    if (lk.widgetKind === "linkage_list") panelTabs.push({ tab: lk.tabId });

  nested.push({
    id: `panels_info${E}`,
    type: "panel",
    label: pickLabel(ctx.entity),
    menu: panelMenu,
    tabs: panelTabs,
  });

  if (!ctx.flags.isReadonly) {
    nested.push({
      id: `forms_new${E}`,
      type: "modal",
      form: `blocks_forms_new${E}`,
      label: `Добавление ${ctx.entity.name || E}`,
    });
    nested.push({
      id: `forms_edit${E}`,
      type: "modal",
      form: `blocks_forms_edit${E}`,
      label: `Изменение ${ctx.entity.name || E}`,
    });
  }

  if (options.includePage && ctx.menuRoot) {
    const pageTabs: any[] = [{ tab: `tabs_info${E}` }];
    for (const lk of ctx.linkages)
      if (lk.widgetKind === "linkage_list") pageTabs.push({ tab: lk.tabId });
    nested.push({
      id: `pages_info${E}`,
      type: "page",
      label: pickLabel(ctx.entity),
      menuItem: `${E}Menu`,
      tabs: pageTabs,
    });
  }

  const viewX = {
    id: viewId,
    type: "entity",
    entity: E,
    widgets,
    groups,
    views: nested,
  };

  return {
    blocks: [
      {
        blockId: `view:${viewId}`,
        section: "views",
        groupPath: ["views"],
        payload: viewX,
        dependsOn: [],
        dependents: [],
        title: `Entity-view ${viewId}`,
      },
    ],
    skipped: [],
  };
}
