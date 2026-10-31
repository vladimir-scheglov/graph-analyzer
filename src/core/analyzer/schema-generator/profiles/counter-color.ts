import type { ModelIndex } from "../../../../shared/model-types";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildCounterColors } from "../builders/counter-colors";

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

export function runCounterColorProfile(
  domainId: string,
  index: ModelIndex,
  options: {
    red?: string;
    yellow?: string;
    skipExisting: boolean;
  },
): ProfileResult {
  const r = buildCounterColors(domainId, index, {
    red: options.red,
    yellow: options.yellow,
    skipExisting: options.skipExisting,
  });
  return {
    blocks: r.blocks,
    skipped: r.skipped as ProfileResult["skipped"],
  };
}
