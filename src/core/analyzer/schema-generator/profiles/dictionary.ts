import { ModelIndex } from "../../../../shared/model-types";
import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { resolveEntityViewForCrud } from "./resolve-entity-view";

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

export function runDictionaryProfile(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: { skipExisting: boolean },
): ProfileResult {
  const E = ctx.entity.entityId;
  const eLower = E.toLowerCase();

  const entityView = resolveEntityViewForCrud(ctx, index);

  if (entityView.mode === "skip-ambiguous") {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `view:view${E}`,
          section: "views",
          id: `view${E}`,
          reason: "ambiguous-view",
          hint: entityView.skipHint,
        },
      ],
    };
  }

  if (entityView.mode === "use-existing") {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `view:${entityView.viewId}`,
          section: "views",
          id: entityView.viewId,
          reason: "already-exists",
          hint: `У сущности уже есть entity-view «${entityView.viewId}» — дубликат не создаётся`,
        },
      ],
    };
  }

  // mode === "create" — стандартное поведение (view${E})
  const viewId = entityView.viewId;
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

  const widgets = ctx.entity.attributes.map((a) => ({
    id: `editors_${eLower}_${a.id}`,
    type: "attribute",
    attribute: a.id,
  }));

  return {
    blocks: [
      {
        blockId: `view:${viewId}`,
        section: "views",
        groupPath: ["views"],
        payload: {
          id: viewId,
          type: "entity",
          entity: E,
          widgets,
          groups: [],
          views: [],
        },
        dependsOn: [],
        dependents: [],
        title: `Entity-view ${viewId} (dictionary)`,
      },
    ],
    skipped: [],
  };
}
