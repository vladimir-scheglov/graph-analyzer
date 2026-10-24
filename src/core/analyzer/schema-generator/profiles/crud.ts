import type { EntityGenerationContext } from "../detect";
import type {
  GeneratedBlock,
  GenerationOptions,
  GeneratorSectionKey,
} from "../types";
import { buildActions } from "../builders/actions";
import { buildViewEntity } from "../builders/views-entity";
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

  const actions = buildActions(ctx, {
    includeBulk: options.includeBulk,
    skipExisting: options.skipExisting,
    includePage: effectiveIncludePage,
  });
  blocks.push(...actions.blocks);
  skipped.push(...actions.skipped);

  const viewEntity = buildViewEntity(
    ctx,
    {
      skipExisting: options.skipExisting,
      includeBulk: options.includeBulk,
      includePage: effectiveIncludePage,
      includeLinkageWidgets: options.includeLinkageWidgets,
      excludeReadonlyFromCreate: options.excludeReadonlyFromCreate,
    },
    actions.selectedActionIds,
  );
  blocks.push(...viewEntity.blocks);
  skipped.push(...viewEntity.skipped);

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

  const menu = buildMenu(ctx, { skipExisting: options.skipExisting });
  blocks.push(...menu.blocks);
  skipped.push(...menu.skipped);

  const medias = buildMedias(ctx, {
    skipExisting: options.skipExisting,
    hasPage: effectiveIncludePage,
  });
  blocks.push(...medias.blocks);
  skipped.push(...medias.skipped);

  return { blocks, skipped };
}