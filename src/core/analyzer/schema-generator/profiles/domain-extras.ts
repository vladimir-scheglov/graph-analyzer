import type { ModelIndex } from "../../../../shared/model-types";
import type { RawDomainEntry } from "../../model-builder";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildDomainExtras } from "../builders/domain-extras";

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

export function runDomainExtrasProfile(
  domainId: string,
  index: ModelIndex,
  allDomains: RawDomainEntry[],
  options: {
    scaffoldCreateMenuRoot?: boolean;
    scaffoldCreateMedias?: boolean;
    menuIncludeItems?: boolean;
  },
): ProfileResult {
  const r = buildDomainExtras(domainId, index, allDomains, {
    scaffoldCreateMenuRoot: options.scaffoldCreateMenuRoot === true,
    scaffoldCreateMedias: options.scaffoldCreateMedias === true,
    menuIncludeItems: options.menuIncludeItems !== false,
  });
  return {
    blocks: r.blocks,
    skipped: r.skipped as ProfileResult["skipped"],
  };
}
