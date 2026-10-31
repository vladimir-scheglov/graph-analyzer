import type { ModelIndex } from "../../../../shared/model-types";
import type { RawDomainEntry } from "../../model-builder";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildUiStatusColors } from "../builders/ui-status-colors";

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

export function runUiStatusColorsProfile(
  domainId: string,
  index: ModelIndex,
  allDomains: RawDomainEntry[],
  options: {
    palette?: string[];
    skipExisting: boolean;
  },
): ProfileResult {
  const r = buildUiStatusColors(domainId, index, allDomains, {
    palette: options.palette,
    skipExisting: options.skipExisting,
  });
  return {
    blocks: r.blocks,
    skipped: r.skipped as ProfileResult["skipped"],
  };
}
