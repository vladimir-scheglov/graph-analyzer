import type { ModelIndex } from "../../../../shared/model-types";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";
import { buildExchangeSettings } from "../builders/exchange-settings";

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

export function runExchangeSettingsProfile(
  domainId: string,
  index: ModelIndex,
  options: {
    enable?: boolean;
    forExportStrategy?: "label" | "firstString" | "id";
    noCmsSync?: boolean;
    skipExisting: boolean;
  },
): ProfileResult {
  const r = buildExchangeSettings(domainId, index, {
    enable: options.enable,
    forExportStrategy: options.forExportStrategy,
    noCmsSync: options.noCmsSync,
    skipExisting: options.skipExisting,
  });
  return {
    blocks: r.blocks,
    skipped: r.skipped as ProfileResult["skipped"],
  };
}
