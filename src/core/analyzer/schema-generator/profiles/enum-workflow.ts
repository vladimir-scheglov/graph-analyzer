import type { ModelIndex } from "../../../../shared/model-types";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildEnumSkeletons } from "../builders/enum-skeletons";

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

export function runEnumWorkflowProfile(
  domainId: string,
  index: ModelIndex,
  options: {
    suffixes?: string[];
    defaultValues?: string[];
    enableWorkflow?: boolean;
    skipExisting: boolean;
  },
): ProfileResult {
  const r = buildEnumSkeletons(domainId, index, {
    suffixes: options.suffixes,
    defaultValues: options.defaultValues,
    enableWorkflow: options.enableWorkflow,
    skipExisting: options.skipExisting,
  });
  return {
    blocks: r.blocks,
    skipped: r.skipped as ProfileResult["skipped"],
  };
}
