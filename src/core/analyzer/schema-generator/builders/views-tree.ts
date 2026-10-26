import type { EntityGenerationContext, LinkageRole } from "../detect";
import type { GeneratedBlock } from "../types";

export interface TreeViewResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "views";
    id: string;
    reason: string;
  }>;
}

export function buildTreeView(
  ctx: EntityGenerationContext,
  options: {
    treeId: string;
    variant: "merged" | "splitted";
    nodeChunkSize: number;
    ordering: boolean;
    listViewId?: string;
    skipExisting: boolean;
    usedEntities: Set<string>;
  },
): TreeViewResult {
  const E = ctx.entity.entityId;
  const eLower = E.toLowerCase();
  const viewId = `treeView_${eLower}`;

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

  const attrColumns = ctx.entity.attributes.map((a) => ({
    id: a.id,
    attribute: a.id,
    label: a.name || a.id,
    layout: { width: { default: 120, min: 50, max: 300 } },
  }));

  // filter[] — массив, по одному блоку на каждую сущность дерева
  const filterBlocks = Array.from(options.usedEntities).map((entityId) => ({
    entity: entityId,
    attributes: { type: "all" },
  }));

  const treePathColumn = {
    id: "treePath",
    attribute: "id",
    label: "Путь",
    expanded: true, // ← из предыдущего PR (обязательный expanded)
    layout: { width: { default: 200, min: 100, max: 400 } },
    control: { type: "tree_path", tree: options.treeId },
  };

  const table = {
    columns: [treePathColumn, ...attrColumns],
    filter: filterBlocks,
    paging: { sizes: [10, 50, 100], defaultSize: 50 },
    refresh: {
      mode: "all",
      defaults: { enabled: true, unit: "second", interval: 30 },
    },
    selection: true,
  };

  let payload: any;
  if (options.variant === "merged") {
    payload = {
      id: viewId,
      type: "tree",
      tree: options.treeId,
      variant: "merged",
      nodeChunkSize: options.nodeChunkSize,
      ...(options.ordering ? { ordering: true } : {}),
      table,
    };
  } else {
    if (!options.listViewId) {
      return {
        blocks: [],
        skipped: [
          {
            blockId: `view:${viewId}`,
            section: "views",
            id: viewId,
            reason: "splitted-needs-list",
          },
        ],
      };
    }
    payload = {
      id: viewId,
      type: "tree",
      tree: options.treeId,
      variant: "splitted",
      nodeChunkSize: options.nodeChunkSize,
      ordering: options.ordering,
      list: options.listViewId,
      catalogTitle: ctx.entity.name || E,
      showLeaf: true,
    };
  }

  return {
    blocks: [
      {
        blockId: `view:${viewId}`,
        section: "views",
        groupPath: ["views"],
        payload,
        dependsOn: [`tree:${options.treeId}`],
        dependents: [],
        title: `Tree-view ${viewId}`,
      },
    ],
    skipped: [],
  };
}
