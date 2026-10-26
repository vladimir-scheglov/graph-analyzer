import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock } from "../types";

export function buildTreeActions(
  ctx: EntityGenerationContext,
  options: { treeViewId: string; skipExisting: boolean },
): {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "actions";
    id: string;
    reason: string;
  }>;
} {
  const E = ctx.entity.entityId;
  const actionId = `actions_open${E}Tree`;

  if (options.skipExisting && ctx.existing.actions.has(actionId)) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `action:${actionId}`,
          section: "actions",
          id: actionId,
          reason: "already-exists",
        },
      ],
    };
  }

  return {
    blocks: [
      {
        blockId: `action:${actionId}`,
        section: "actions",
        groupPath: ["actions"],
        payload: {
          id: actionId,
          name: "Дерево",
          type: "open_tree",
          view: options.treeViewId,
          entity: E,
          description: "Открыть древовидное представление",
        },
        dependsOn: [`view:${options.treeViewId}`],
        dependents: [],
        title: `Действие ${actionId} (open_tree)`,
      },
    ],
    skipped: [],
  };
}
