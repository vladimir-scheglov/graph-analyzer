import type { ModelIndex } from "../../../../shared/model-types";
import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildLinkedGroups } from "../builders/linked-groups";

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

export function runLinkedGroupsProfile(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: {
    includeSingles: boolean;
    skipExisting: boolean;
  },
): ProfileResult {
  const r = buildLinkedGroups(ctx, index, {
    includeSingles: options.includeSingles,
    skipExisting: options.skipExisting,
  });
  return {
    blocks: r.blocks,
    skipped: r.skipped as ProfileResult["skipped"],
  };
}
