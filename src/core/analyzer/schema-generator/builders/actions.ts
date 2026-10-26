import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GenerationOptions } from "../types";

export interface ActionsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "actions";
    id: string;
    reason: string;
  }>;
  selectedActionIds: Set<string>;
}

export function buildActions(
  ctx: EntityGenerationContext,
  options: Required<Pick<GenerationOptions, "includeBulk" | "skipExisting">> & {
    includePage: boolean;
  },
): ActionsResult {
  const blocks: GeneratedBlock[] = [];
  const skipped: ActionsResult["skipped"] = [];
  const selectedActionIds = new Set<string>();
  if (ctx.flags.isDictionary) return { blocks, skipped, selectedActionIds };

  const E = ctx.entity.entityId;
  const viewBlockId = `view:view${E}`;

  const tryAdd = (
    actionId: string,
    payload: any,
    dependsOn: string[],
  ): void => {
    selectedActionIds.add(actionId);
    if (options.skipExisting && ctx.existing.actions.has(actionId)) {
      skipped.push({
        blockId: `action:${actionId}`,
        section: "actions",
        id: actionId,
        reason: "already-exists",
      });
      return;
    }
    blocks.push({
      blockId: `action:${actionId}`,
      section: "actions",
      groupPath: ["actions"],
      payload,
      dependsOn,
      dependents: [],
      title: `Действие ${actionId} (${payload.type})`,
    });
  };

  if (!ctx.flags.isReadonly) {
    tryAdd(
      `actions_create${E}`,
      {
        id: `actions_create${E}`,
        name: "Добавить",
        type: "open_modal",
        modal: `forms_new${E}`,
        entity: E,
        operation: "create",
        description: "Открыть модальное окно создания",
      },
      [viewBlockId],
    );
    tryAdd(
      `actions_edit${E}`,
      {
        id: `actions_edit${E}`,
        name: "Изменить",
        type: "open_modal",
        modal: `forms_edit${E}`,
        entity: E,
        operation: "edit",
        description: "Открыть модальное окно редактирования",
      },
      [viewBlockId],
    );
  }

  // actions_openXPanel — только если у сущности есть panel UI
  // (иначе action будет ссылаться на несуществующий panels_infoX)
  if (ctx.flags.hasPanelUi) {
    tryAdd(
      `actions_open${E}Panel`,
      {
        id: `actions_open${E}Panel`,
        name: "Детали",
        type: "open_panel",
        panel: `panels_info${E}`,
        entity: E,
        description: "Открыть панель с информацией",
      },
      [viewBlockId],
    );
  }

  if (options.includePage) {
    tryAdd(
      `actions_open${E}Page`,
      {
        id: `actions_open${E}Page`,
        name: "Полный экран",
        type: "open_page",
        pageView: `pages_info${E}`,
        entity: E,
        operation: "view",
        description: "Открыть полноэкранную карточку",
      },
      [viewBlockId],
    );
  }

  tryAdd(
    `actions_remove${E}`,
    {
      id: `actions_remove${E}`,
      name: "Удалить",
      type: "remove",
      entity: E,
      description: "Удалить выбранный объект",
    },
    [],
  );

  if (options.includeBulk) {
    tryAdd(
      `actions_bulkRemove${E}`,
      {
        id: `actions_bulkRemove${E}`,
        name: "Удалить выбранные",
        type: "bulk",
        entity: E,
        operation: "remove",
        description: "Удалить выбранные объекты",
      },
      [],
    );
  }

  return { blocks, skipped, selectedActionIds };
}
