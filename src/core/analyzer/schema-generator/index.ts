import type {
  GenerationOptions,
  GenerationRequest,
  GenerationResult,
  GeneratedBlock,
  GeneratorSectionKey,
} from "./types";
import type { RawDomainEntry } from "../model-builder";
import type { ModelIndex } from "../../../shared/model-types";
import { detectEntityContext } from "./detect";
import { runCrudProfile } from "./profiles/crud";
import { runPreflight } from "./preflight";
import { runDictionaryProfile } from "./profiles/dictionary";

const DEFAULT_OPTIONS: Required<Omit<GenerationOptions, "menuRootId">> = {
  includeBulk: true,
  includePage: false,
  includeLinkageWidgets: true,
  skipExisting: true,
  excludeReadonlyFromCreate: false,
};

function emitYaml(payload: any): string {
  const yaml = require("js-yaml");
  return yaml.dump(payload, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

function linkDependents(blocks: GeneratedBlock[]): void {
  const index = new Map<string, GeneratedBlock>();
  for (const b of blocks) index.set(b.blockId, b);
  for (const b of blocks) {
    for (const dep of b.dependsOn) {
      const target = index.get(dep);
      if (target && !target.dependents.includes(b.blockId)) {
        target.dependents.push(b.blockId);
      }
    }
  }
}

export function generateForEntity(
  allDomains: RawDomainEntry[],
  index: ModelIndex,
  request: GenerationRequest,
): GenerationResult {
  const options: Required<Omit<GenerationOptions, "menuRootId">> = {
    ...DEFAULT_OPTIONS,
    ...(request.options || {}),
  } as any;

  const ctx = detectEntityContext(
    index,
    allDomains,
    request.domainId,
    request.entityId,
    request.options?.menuRootId,
  );
  if (!ctx) {
    throw new Error(
      `Entity ${request.domainId}/${request.entityId} not found in index`,
    );
  }

  // profile → options
  if (request.profile === "crud-with-page") options.includePage = true;
  if (
    options.includePage === false &&
    ctx.flags.hasPage &&
    request.options?.includePage === undefined
  ) {
    options.includePage = true;
  }

  let profileResult;
  const useDictionary =
    request.profile === "dictionary" || ctx.flags.isDictionary;
  if (useDictionary) {
    profileResult = runDictionaryProfile(ctx, {
      skipExisting: options.skipExisting,
    });
  } else if (request.profile === "custom") {
    throw new Error(`Profile "custom" is not implemented in this version`);
  } else {
    profileResult = runCrudProfile(ctx, options);
  }

  const allBlocks = profileResult.blocks;
  linkDependents(allBlocks);

  const yamlByBlock: Record<string, string> = {};
  for (const b of allBlocks) {
    try {
      yamlByBlock[b.blockId] = emitYaml(b.payload);
    } catch {
      yamlByBlock[b.blockId] = "/* ошибка сериализации */";
    }
  }

  const preflight = runPreflight(allDomains, request.domainId, allBlocks);

  const presentSections = new Set<GeneratorSectionKey>();
  for (const b of allBlocks) presentSections.add(b.section);
  const emptySections: GeneratorSectionKey[] = [];
  for (const s of ["actions", "views", "menus", "medias"] as const) {
    if (!presentSections.has(s)) emptySections.push(s);
  }

  const blockIndex: Record<string, GeneratedBlock> = {};
  for (const b of allBlocks) blockIndex[b.blockId] = b;

  return {
    request,
    blocks: allBlocks,
    blockIndex,
    emptySections,
    yamlByBlock,
    skipped: profileResult.skipped,
    preflight,
  };
}

export * from "./types";
