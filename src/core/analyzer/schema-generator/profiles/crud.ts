import type { EntityGenerationContext } from "../detect";
import type {
  GeneratedBlock,
  GenerationOptions,
  GeneratorSectionKey,
} from "../types";
import { buildActions } from "../builders/actions";
import {
  buildViewEntityRoot,
  buildViewEntityWidgets,
  buildViewEntityGroups,
  buildViewEntityNestedViews,
} from "../builders/views-entity";
import { buildViewList } from "../builders/views-list";
import { buildMenu } from "../builders/menu";
import { buildMedias } from "../builders/medias";

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
}

export function runCrudProfile(
  ctx: EntityGenerationContext,
  options: Required<Omit<GenerationOptions, "menuRootId">> & {
    menuRootId?: string;
  },
): ProfileResult {
  const blocks: GeneratedBlock[] = [];
  const skipped: ProfileResult["skipped"] = [];
  const effectiveIncludePage =
    (options.includePage ?? ctx.flags.hasPage) && !!ctx.menuRoot;

  // 1. actions
  const actions = buildActions(ctx, {
    includeBulk: options.includeBulk,
    skipExisting: options.skipExisting,
    includePage: effectiveIncludePage,
  });
  blocks.push(...actions.blocks);
  skipped.push(...actions.skipped);

  // 2. views: root → widgets → groups → nested
  // Порядок критичен: appendBlockToRaw в preflight вкладывает widget/group/view
  // в уже существующий viewX, поэтому root должен быть первым.
  const root = buildViewEntityRoot(ctx, { skipExisting: options.skipExisting });
  blocks.push(...root.blocks);
  skipped.push(...root.skipped);

  const widgets = buildViewEntityWidgets(
    ctx,
    {
      skipExisting: options.skipExisting,
      includeBulk: options.includeBulk,
      includePage: effectiveIncludePage,
      includeLinkageWidgets: options.includeLinkageWidgets,
    },
    actions.selectedActionIds,
  );
  blocks.push(...widgets.blocks);
  skipped.push(...widgets.skipped);

  const groups = buildViewEntityGroups(
    ctx,
    {
      skipExisting: options.skipExisting,
      includePage: effectiveIncludePage,
      excludeReadonlyFromCreate: options.excludeReadonlyFromCreate,
    },
    widgets,
  );
  blocks.push(...groups.blocks);
  skipped.push(...groups.skipped);

  const nested = buildViewEntityNestedViews(
    ctx,
    { skipExisting: options.skipExisting, includePage: effectiveIncludePage },
    actions.selectedActionIds,
    groups,
  );
  blocks.push(...nested.blocks);
  skipped.push(...nested.skipped);

  // 3. list-view
  const viewList = buildViewList(
    ctx,
    {
      skipExisting: options.skipExisting,
      includeBulk: options.includeBulk,
      includePage: effectiveIncludePage,
    },
    actions.selectedActionIds,
  );
  blocks.push(...viewList.blocks);
  skipped.push(...viewList.skipped);

  // 4. menu
  const menu = buildMenu(ctx, { skipExisting: options.skipExisting });
  blocks.push(...menu.blocks);
  skipped.push(...menu.skipped);

  // 5. medias
  const medias = buildMedias(ctx, { hasPage: effectiveIncludePage });
  blocks.push(...medias.blocks);
  skipped.push(...medias.skipped);

  return { blocks, skipped };
}
