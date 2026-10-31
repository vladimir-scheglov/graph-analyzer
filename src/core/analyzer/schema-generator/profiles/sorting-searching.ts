import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildSortingSearching } from "../builders/sorting-searching";

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
}

export function runSortingSearchingProfile(
  ctx: EntityGenerationContext,
  options: {
    includeSorting: boolean;
    includeSearching: boolean;
  },
): ProfileResult {
  return buildSortingSearching(ctx, options);
}
