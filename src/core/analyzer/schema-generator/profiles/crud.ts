// src/core/analyzer/schema-generator/profiles/crud.ts

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
import type { ModelIndex } from "../../../../shared/model-types";
import {
  resolveEntityViewForCrud,
  resolveListViewForCrud,
} from "./resolve-entity-view";

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
    hint?: string;
  }>;
}

export function runCrudProfile(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: Required<Omit<GenerationOptions, "menuRootId">> & {
    menuRootId?: string;
  },
): ProfileResult {
  const E = ctx.entity.entityId;
  const eLower = E.toLowerCase();
  const blocks: GeneratedBlock[] = [];
  const skipped: ProfileResult["skipped"] = [];
  const effectiveIncludePage =
    (options.includePage ?? ctx.flags.hasPage) && !!ctx.menuRoot;

  const entityView = resolveEntityViewForCrud(ctx, index);
  const listView = resolveListViewForCrud(ctx, index);

  // ── 1. actions — независимо от view ──
  const actions = buildActions(ctx, {
    includeBulk: options.includeBulk,
    skipExisting: options.skipExisting,
    includePage: effectiveIncludePage,
  });
  blocks.push(...actions.blocks);
  skipped.push(...actions.skipped);

  // ── 2. entity-view: root → widgets → groups → nested ──
  if (entityView.mode === "skip-ambiguous") {
    skipped.push({
      blockId: `view:view${E}`,
      section: "views",
      id: `view${E}`,
      reason: "ambiguous-view",
      hint: entityView.skipHint,
    });
  } else {
    if (entityView.mode === "create") {
      const root = buildViewEntityRoot(ctx, {
        skipExisting: options.skipExisting,
      });
      blocks.push(...root.blocks);
      skipped.push(...root.skipped);
    } else {
      // use-existing
      skipped.push({
        blockId: `view:${entityView.viewId}`,
        section: "views",
        id: entityView.viewId,
        reason: "already-exists",
        hint: `Используется существующий entity-view «${entityView.viewId}» — виджеты/groups/nested добавятся в него`,
      });
    }

    const widgets = buildViewEntityWidgets(
      ctx,
      {
        skipExisting: options.skipExisting,
        includeBulk: options.includeBulk,
        includePage: effectiveIncludePage,
        includeLinkageWidgets: options.includeLinkageWidgets,
        parentViewId: entityView.viewId,
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
        parentViewId: entityView.viewId,
      },
      widgets,
    );
    blocks.push(...groups.blocks);
    skipped.push(...groups.skipped);

    const nested = buildViewEntityNestedViews(
      ctx,
      {
        skipExisting: options.skipExisting,
        includePage: effectiveIncludePage,
        parentViewId: entityView.viewId,
      },
      actions.selectedActionIds,
      groups,
    );
    blocks.push(...nested.blocks);
    skipped.push(...nested.skipped);
  }

  // ── 3. list-view + menu ──
  if (listView.mode === "skip-ambiguous") {
    skipped.push({
      blockId: `view:lists_${eLower}`,
      section: "views",
      id: `lists_${eLower}`,
      reason: "ambiguous-view",
      hint: listView.skipHint,
    });
  } else {
    if (listView.mode === "use-existing") {
      skipped.push({
        blockId: `view:${listView.viewId}`,
        section: "views",
        id: listView.viewId,
        reason: "already-exists",
        hint: `Используется существующий list-view «${listView.viewId}»`,
      });
    } else {
      const viewList = buildViewList(
        ctx,
        {
          skipExisting: options.skipExisting,
          includeBulk: options.includeBulk,
          includePage: effectiveIncludePage,
          viewIdOverride: listView.viewId,
        },
        actions.selectedActionIds,
      );
      blocks.push(...viewList.blocks);
      skipped.push(...viewList.skipped);
    }

    // menu — ссылается на list-view (даже если он use-existing)
    const menu = buildMenu(ctx, {
      skipExisting: options.skipExisting,
      viewIdOverride: listView.viewId,
    });
    blocks.push(...menu.blocks);
    skipped.push(...menu.skipped);
  }

  // ── 4. medias — независимо ──
  const medias = buildMedias(ctx, {
    hasPage: effectiveIncludePage,
    noModals: options.noModals,
  });
  blocks.push(...medias.blocks);
  skipped.push(...medias.skipped);

  return { blocks, skipped };
}
