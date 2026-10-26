import type { EntityGenerationContext, LinkageRole } from "../detect";
import type { GeneratedBlock, GenerationOptions } from "../types";

function pickLabel(entity: {
  label: string | null;
  entityId: string;
  attributes: Array<{ id: string }>;
}): string {
  if (entity.label) return entity.label;
  return `{${entity.attributes[0]?.id || "id"}}`;
}

function shouldSkipViewEntity(
  ctx: EntityGenerationContext,
  options: { skipExisting: boolean },
): { skipped: true; reason: string } | { skipped: false } {
  if (ctx.flags.isDictionary) return { skipped: true, reason: "dictionary" };
  const E = ctx.entity.entityId;
  const viewId = `view${E}`;
  if (options.skipExisting && ctx.existing.views.has(viewId))
    return { skipped: true, reason: "already-exists" };
  // entity-view под другим id — генерация создаст дубликат.
  // Skip, чтобы не было двух entity-view для одной сущности.
  if (
    options.skipExisting &&
    ctx.existing.viewIdConflicts.some((c) => c.kind === "entity")
  ) {
    return { skipped: true, reason: "id-conflict" };
  }
  return { skipped: false };
}

export interface ViewEntityWidgetsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
  }>;
  /** Для последующих builder'ов — какие widgetIds были сгенерированы. */
  attrWidgetIds: string[];
  linkageTableIds: string[];
  linkageListIds: string[];
  actionWidgetIds: string[];
}

/**
 * Widget-блоки внутри viewX: attribute-editors, action-кнопки, linkage/linkage_list.
 * Все блоки — с parentViewId="viewX", вкладываются в viewX.widgets[].
 */
export interface ViewEntityWidgetsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
  }>;
  attrWidgetIds: string[];
  linkageTableIds: string[];
  linkageListIds: string[];
  actionWidgetIds: string[];
}

/**
 * Генерирует widget-блоки внутри viewX: attribute-editors, action-кнопки,
 * linkage/linkage_list.
 *
 * skipExisting — per-widget: проверяется `ctx.existing.viewWidgetIds.get(viewId)`.
 * Существование самого viewX не блокирует генерацию (иначе новые widgets
 * не догенерируются при повторной генерации — broken reference).
 *
 * Action-кнопки включаются, если action уже в YAML (existing.actions) ИЛИ
 * генерируется в этой сессии (selectedActionIds). Флаги includeBulk /
 * includePage больше не влияют на кнопки — они управляют только созданием
 * actions в buildActions.
 */
export function buildViewEntityWidgets(
  ctx: EntityGenerationContext,
  options: Required<Pick<GenerationOptions, "skipExisting">> & {
    /** @deprecated больше не влияет на кнопки; actions_create/bulkRemove — в buildActions */
    includeBulk: boolean;
    /** @deprecated больше не влияет на кнопки; actions_openXPage — в buildActions */
    includePage: boolean;
    includeLinkageWidgets: boolean;
  },
  selectedActionIds: Set<string>,
): ViewEntityWidgetsResult {
  const E = ctx.entity.entityId;
  const eLower = E.toLowerCase();
  const viewId = `view${E}`;

  // dictionary — нет entity-view с виджетами (только root-контейнер)
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
      attrWidgetIds: [],
      linkageTableIds: [],
      linkageListIds: [],
      actionWidgetIds: [],
    };
  }

  // Существующие widgets внутри viewX (per-widget skip).
  const existingWidgets =
    ctx.existing.viewWidgetIds.get(viewId) || new Set<string>();

  // action-кнопки: selected OR existing — action может быть в YAML,
  // но сгенерирован не в этой сессии — кнопка для него всё равно нужна.
  const hasAny = (id: string) =>
    selectedActionIds.has(id) || ctx.existing.actions.has(id);

  const blocks: GeneratedBlock[] = [];
  const attrWidgetIds: string[] = [];
  const linkageTableIds: string[] = [];
  const linkageListIds: string[] = [];
  const actionWidgetIds: string[] = [];

  const pushWidget = (
    id: string,
    payload: any,
    dependsOn: string[],
    title: string,
  ) => {
    if (options.skipExisting && existingWidgets.has(id)) return;
    blocks.push({
      blockId: `widget:${viewId}/${id}`,
      section: "views",
      groupPath: ["views", viewId, "widgets"],
      payload,
      dependsOn,
      dependents: [],
      title,
      parentViewId: viewId,
    });
  };

  // ── attribute widgets ──
  for (const a of ctx.entity.attributes) {
    const id = `editors_${eLower}_${a.id}`;
    attrWidgetIds.push(id);
    pushWidget(
      id,
      { id, type: "attribute", attribute: a.id },
      [`view:${viewId}`],
      `Виджет ${a.id}`,
    );
  }

  // ── action widgets ──
  const addAction = (id: string, action: string, label: string) => {
    actionWidgetIds.push(id);
    pushWidget(
      id,
      {
        id,
        type: "action",
        action,
        control: { type: "regular_button", label },
      },
      [`view:${viewId}`, `action:${action}`],
      `Кнопка ${action}`,
    );
  };

  if (!ctx.flags.isReadonly && hasAny(`actions_create${E}`))
    addAction(`buttons_create${E}`, `actions_create${E}`, "Добавить");
  if (!ctx.flags.isReadonly && hasAny(`actions_edit${E}`))
    addAction(`buttons_edit${E}`, `actions_edit${E}`, "Изменить");
  if (hasAny(`actions_remove${E}`))
    addAction(`buttons_remove${E}`, `actions_remove${E}`, "Удалить");
  if (hasAny(`actions_bulkRemove${E}`))
    addAction(
      `buttons_bulkRemove${E}`,
      `actions_bulkRemove${E}`,
      "Удалить выбранные",
    );
  if (hasAny(`actions_open${E}Page`))
    addAction(`buttons_open${E}Page`, `actions_open${E}Page`, "Полный экран");

  // ── linkage widgets ──
  // linkage (1_n side=2 / 1_1)        → blocks_infoX / blocks_forms_*X
  // linkage_list (1_n side=1 / n_n)   → отдельный block + tab
  if (options.includeLinkageWidgets) {
    for (const lk of ctx.linkages) {
      if (lk.widgetKind === "linkage") {
        linkageTableIds.push(lk.widgetId);
        pushWidget(
          lk.widgetId,
          {
            id: lk.widgetId,
            type: "linkage",
            side: lk.side,
            label: lk.label,
            linkage: lk.linkageId,
          },
          [`view:${viewId}`],
          `Связь ${lk.linkageId}`,
        );
      } else {
        linkageListIds.push(lk.widgetId);
        pushWidget(
          lk.widgetId,
          {
            id: lk.widgetId,
            type: "linkage_list",
            side: lk.side,
            label: lk.label,
            rules: {
              includes: [{ id: ctx.domainId, only: [lk.linkageId] }],
            },
          },
          [`view:${viewId}`],
          `Список связей ${lk.linkageId}`,
        );
      }
    }
  }

  return {
    blocks,
    skipped: [],
    attrWidgetIds,
    linkageTableIds,
    linkageListIds,
    actionWidgetIds,
  };
}

export interface ViewEntityGroupsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
  }>;
  /** Какие groupIds сгенерированы — для panels_infoX.tabs. */
  infoBlockIds: string[];
  infoTabId: string | null;
  linkageBlockTabIds: Array<{ blockId: string; tabId: string }>;
}

/**
 * Group-блоки внутри viewX: blocks_forms_*, blocks_infoX, tabs_infoX,
 * blocks_editors_link_*, tabs_editors_link_*.
 */
export function buildViewEntityGroups(
  ctx: EntityGenerationContext,
  options: Required<Pick<GenerationOptions, "skipExisting">> & {
    includePage: boolean;
    excludeReadonlyFromCreate: boolean;
  },
  widgets: Pick<
    ViewEntityWidgetsResult,
    "attrWidgetIds" | "linkageTableIds" | "linkageListIds"
  >,
): ViewEntityGroupsResult {
  const E = ctx.entity.entityId;
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
      infoBlockIds: [],
      infoTabId: null,
      linkageBlockTabIds: [],
    };
  }

  const existingGroups =
    ctx.existing.viewGroupIds.get(viewId) || new Set<string>();

  const { attrWidgetIds, linkageTableIds, linkageListIds } = widgets;
  const hasInfoBlocks =
    ctx.flags.hasPanelUi || (options.includePage && !!ctx.menuRoot);

  const allEditorIds = [...attrWidgetIds, ...linkageTableIds];
  const nonReadonlyEditorIds = [
    ...ctx.entity.attributes
      .filter((a) => !a.readonly)
      .map((a) => `editors_${E.toLowerCase()}_${a.id}`),
    ...linkageTableIds,
  ];
  const newEditorIds = options.excludeReadonlyFromCreate
    ? nonReadonlyEditorIds
    : allEditorIds;

  const blocks: GeneratedBlock[] = [];
  const skipped: ViewEntityGroupsResult["skipped"] = [];
  const infoBlockIds: string[] = [];

  const pushGroup = (
    id: string,
    payload: any,
    dependsOn: string[],
    title: string,
  ) => {
    if (options.skipExisting && existingGroups.has(id)) return;
    blocks.push({
      blockId: `group:${viewId}/${id}`,
      section: "views",
      groupPath: ["views", viewId, "groups"],
      payload,
      dependsOn,
      dependents: [],
      title,
      parentViewId: viewId,
    });
  };

  if (!ctx.flags.isReadonly) {
    pushGroup(
      `blocks_forms_new${E}`,
      {
        id: `blocks_forms_new${E}`,
        type: "form",
        layout: { direction: "column" },
        components: newEditorIds.map((w) => ({ widget: w })),
      },
      newEditorIds.map((w) => `widget:${viewId}/${w}`),
      `Форма создания ${E}`,
    );
    pushGroup(
      `blocks_forms_edit${E}`,
      {
        id: `blocks_forms_edit${E}`,
        type: "form",
        layout: { direction: "column" },
        components: nonReadonlyEditorIds.map((w) => ({ widget: w })),
      },
      nonReadonlyEditorIds.map((w) => `widget:${viewId}/${w}`),
      `Форма редактирования ${E}`,
    );
  }

  let infoTabId: string | null = null;
  if (hasInfoBlocks) {
    pushGroup(
      `blocks_info${E}`,
      {
        id: `blocks_info${E}`,
        type: "block",
        layout: { direction: "column", expandable: false },
        components: allEditorIds.map((w) => ({ widget: w })),
      },
      allEditorIds.map((w) => `widget:${viewId}/${w}`),
      `Блок информации ${E}`,
    );
    infoBlockIds.push(`blocks_info${E}`);
    pushGroup(
      `tabs_info${E}`,
      {
        id: `tabs_info${E}`,
        type: "tab",
        label: "Детали",
        components: [{ block: `blocks_info${E}` }],
      },
      [`group:${viewId}/blocks_info${E}`],
      `Вкладка информации ${E}`,
    );
    infoTabId = `tabs_info${E}`;
  }

  const linkageBlockTabIds: Array<{ blockId: string; tabId: string }> = [];
  for (const lk of ctx.linkages) {
    if (lk.widgetKind !== "linkage_list") continue;
    const blockId = lk.blockId;
    const tabId = lk.tabId;
    pushGroup(
      blockId,
      {
        id: blockId,
        type: "block",
        layout: { direction: "column", expandable: false },
        components: [{ widget: lk.widgetId }],
      },
      [`widget:${viewId}/${lk.widgetId}`],
      `Блок связи ${lk.linkageId}`,
    );
    pushGroup(
      tabId,
      {
        id: tabId,
        type: "tab",
        label: lk.label,
        components: [{ block: blockId }],
      },
      [`group:${viewId}/${blockId}`],
      `Вкладка связи ${lk.linkageId}`,
    );
    linkageBlockTabIds.push({ blockId, tabId });
  }

  return { blocks, skipped, infoBlockIds, infoTabId, linkageBlockTabIds };
}

export interface ViewEntityNestedViewsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
  }>;
}

/**
 * Nested views внутри viewX: forms_newX, forms_editX, panels_infoX, pages_infoX.
 */
export function buildViewEntityNestedViews(
  ctx: EntityGenerationContext,
  options: Required<Pick<GenerationOptions, "skipExisting">> & {
    includePage: boolean;
  },
  selectedActionIds: Set<string>,
  groups: Pick<ViewEntityGroupsResult, "infoTabId" | "linkageBlockTabIds">,
): ViewEntityNestedViewsResult {
  const E = ctx.entity.entityId;
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

  const existingNested =
    ctx.existing.viewNestedIds.get(viewId) || new Set<string>();

  const has = (id: string) => selectedActionIds.has(id);
  const blocks: GeneratedBlock[] = [];

  const pushNested = (
    id: string,
    payload: any,
    dependsOn: string[],
    title: string,
  ) => {
    if (options.skipExisting && existingNested.has(id)) return;
    blocks.push({
      blockId: `view:${id}`,
      section: "views",
      groupPath: ["views", viewId, "views"],
      payload,
      dependsOn,
      dependents: [],
      title,
      parentViewId: viewId,
    });
  };

  // ---- panel ----
  if (ctx.flags.hasPanelUi) {
    const panelMenu: any[] = [];
    if (!ctx.flags.isReadonly && has(`actions_edit${E}`))
      panelMenu.push({ action: `actions_edit${E}` });
    if (has(`actions_remove${E}`))
      panelMenu.push({ action: `actions_remove${E}` });
    if (options.includePage && has(`actions_open${E}Page`))
      panelMenu.push({ action: `actions_open${E}Page` });

    const panelTabs: any[] = [];
    if (groups.infoTabId) panelTabs.push({ tab: groups.infoTabId });
    for (const lk of groups.linkageBlockTabIds)
      panelTabs.push({ tab: lk.tabId });

    const dependsOn: string[] = [];
    if (groups.infoTabId) dependsOn.push(`group:${viewId}/${groups.infoTabId}`);
    for (const lk of groups.linkageBlockTabIds)
      dependsOn.push(`group:${viewId}/${lk.tabId}`);

    pushNested(
      `panels_info${E}`,
      {
        id: `panels_info${E}`,
        type: "panel",
        label: pickLabel(ctx.entity),
        menu: panelMenu,
        tabs: panelTabs,
      },
      dependsOn,
      `Панель ${E}`,
    );
  }

  // ---- modals ----
  if (!ctx.flags.isReadonly) {
    pushNested(
      `forms_new${E}`,
      {
        id: `forms_new${E}`,
        type: "modal",
        form: `blocks_forms_new${E}`,
        label: `Добавление ${ctx.entity.name || E}`,
      },
      [`group:${viewId}/blocks_forms_new${E}`],
      `Модалка создания ${E}`,
    );
    pushNested(
      `forms_edit${E}`,
      {
        id: `forms_edit${E}`,
        type: "modal",
        form: `blocks_forms_edit${E}`,
        label: `Изменение ${ctx.entity.name || E}`,
      },
      [`group:${viewId}/blocks_forms_edit${E}`],
      `Модалка редактирования ${E}`,
    );
  }

  // ---- page ----
  if (options.includePage && ctx.menuRoot) {
    const pageTabs: any[] = [];
    if (groups.infoTabId) pageTabs.push({ tab: groups.infoTabId });
    for (const lk of groups.linkageBlockTabIds)
      pageTabs.push({ tab: lk.tabId });

    const dependsOn: string[] = [`menuItem:${ctx.menuRoot.id}/${E}Menu`];
    if (groups.infoTabId) dependsOn.push(`group:${viewId}/${groups.infoTabId}`);
    for (const lk of groups.linkageBlockTabIds)
      dependsOn.push(`group:${viewId}/${lk.tabId}`);

    pushNested(
      `pages_info${E}`,
      {
        id: `pages_info${E}`,
        type: "page",
        label: pickLabel(ctx.entity),
        menuItem: `${E}Menu`,
        tabs: pageTabs,
      },
      dependsOn,
      `Полноэкранная карточка ${E}`,
    );
  }

  return { blocks, skipped: [] };
}

export interface ViewEntityRootResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
  }>;
}

/**
 * Root view:viewX — пустой контейнер, в который вкладываются widget/group/nested-view.
 * Всегда должен идти первым в массиве blocks (до widgets/groups/nested), чтобы
 * appendBlockToRaw мог найти контейнер.
 */
export function buildViewEntityRoot(
  ctx: EntityGenerationContext,
  options: Required<Pick<GenerationOptions, "skipExisting">>,
): ViewEntityRootResult {
  const E = ctx.entity.entityId;
  const viewId = `view${E}`;

  const skipCheck = shouldSkipViewEntity(ctx, options);
  if (skipCheck.skipped) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `view:${viewId}`,
          section: "views",
          id: viewId,
          reason: skipCheck.reason,
        },
      ],
    };
  }

  return {
    blocks: [
      {
        blockId: `view:${viewId}`,
        section: "views",
        groupPath: ["views", viewId],
        payload: {
          id: viewId,
          type: "entity",
          entity: E,
          widgets: [],
          groups: [],
          views: [],
        },
        dependsOn: [],
        dependents: [],
        title: `Entity-view ${viewId}`,
      },
    ],
    skipped: [],
  };
}
