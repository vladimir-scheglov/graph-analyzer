import type { ModelIndex } from "../../../../shared/model-types";
import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildDataRulesDefaults } from "../builders/data-rules-defaults";

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
}

export function runDefaultsProfile(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: {
    defaultsBool: boolean;
    defaultsEnum: boolean;
    defaultsWorkflow: boolean;
    defaultsBoolValue: boolean;
    skipExisting: boolean;
  },
): ProfileResult {
  return buildDataRulesDefaults(ctx, index, {
    includeBool: options.defaultsBool,
    includeEnum: options.defaultsEnum,
    includeWorkflow: options.defaultsWorkflow,
    boolValue: options.defaultsBoolValue,
    skipExisting: options.skipExisting,
  });
}
