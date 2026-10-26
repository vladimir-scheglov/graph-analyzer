import type { EntityGenerationContext } from "../detect";
import type {
  GeneratedBlock,
  GenerationOptions,
  GeneratorSectionKey,
} from "../types";
import { buildTree } from "../builders/trees";
import { buildTreeView } from "../builders/views-tree";
import { buildTreeActions } from "../builders/tree-actions";
import { buildViewList } from "../builders/views-list";
import { buildMenu } from "../builders/menu";
import { ModelIndex } from "../../../../shared/model-types";

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
}

export function runTreeViewProfile(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: Required<
    Omit<
      GenerationOptions,
      "menuRootId" | "treeLinkageIds" | "restoreOrphanedIds"
    >
  > & {
    menuRootId?: string;
    treeLinkageIds?: string[];
  },
): ProfileResult {
  const blocks: GeneratedBlock[] = [];
  const skipped: ProfileResult["skipped"] = [];
  const eLower = ctx.entity.entityId.toLowerCase();
  const treeViewId = `treeView_${eLower}`;

  // 1. trees[]
  const tree = buildTree(ctx, index, {
    treeType: options.treeType,
    treeChain: options.treeChain,
    treeUseExistingId: options.treeUseExistingId,
    skipExisting: options.skipExisting,
  });
  blocks.push(...tree.blocks);
  skipped.push(...tree.skipped);

  if (!tree.treeId) {
    // нет связей side-1 — дальше идти нельзя
    return { blocks, skipped };
  }

  // 2. list-view (только для splitted)
  let listViewId: string | undefined;
  if (options.treeVariant === "splitted") {
    listViewId = `lists_${eLower}`;
    if (!ctx.existing.views.has(listViewId)) {
      const viewList = buildViewList(
        ctx,
        {
          skipExisting: options.skipExisting,
          includeBulk: false,
          includePage: false,
        },
        new Set(),
      );
      blocks.push(...viewList.blocks);
      skipped.push(...viewList.skipped);
      if (viewList.blocks.length === 0) listViewId = undefined;
    }
  }

  // 3. views[type=tree]
  const tv = buildTreeView(ctx, {
    treeId: tree.treeId,
    variant: options.treeVariant,
    nodeChunkSize: options.treeChunkSize,
    ordering: options.treeType === "orderable" && options.treeOrdering,
    listViewId,
    skipExisting: options.skipExisting,
    usedEntities: tree.usedEntities,
  });
  blocks.push(...tv.blocks);
  skipped.push(...tv.skipped);

  // 4. actions_openXTree
  const ta = buildTreeActions(ctx, {
    treeViewId,
    skipExisting: options.skipExisting,
  });
  blocks.push(...ta.blocks);
  skipped.push(...ta.skipped);

  // 5. menu (на list-view, если он есть; иначе — не генерим)
  if (listViewId) {
    const menu = buildMenu(ctx, { skipExisting: options.skipExisting });
    blocks.push(...menu.blocks);
    skipped.push(...menu.skipped);
  }

  return { blocks, skipped };
}
