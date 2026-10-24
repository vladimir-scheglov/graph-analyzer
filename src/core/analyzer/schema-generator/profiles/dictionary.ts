import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
}

export function runDictionaryProfile(
  ctx: EntityGenerationContext,
  options: { skipExisting: boolean },
): ProfileResult {
  const E = ctx.entity.entityId;
  const eLower = E.toLowerCase();
  const viewId = `view${E}`;

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
