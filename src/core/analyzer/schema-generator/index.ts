import type {
  GenerationOptions,
  GenerationRequest,
  GenerationResult,
  GeneratedBlock,
  GeneratorSectionKey,
  DomainGenerationProgress,
  TreeChain,
} from "./types";
import { buildModelIndex, type RawDomainEntry } from "../model-builder";
import type { ModelIndex } from "../../../shared/model-types";
import { detectEntityContext } from "./detect";
import { runCrudProfile } from "./profiles/crud";
import { runPreflight } from "./preflight";
import { runDictionaryProfile } from "./profiles/dictionary";
import { mergeViewTree } from "./util-merge-views";
import { loadGeneratedManifest } from "./manifest";
import { hashPayload } from "./util-hash";
import type { ManifestBlockStatus } from "./types";
import { runTreeViewProfile } from "./profiles/tree-view";
import { runTechnicalProfile } from "./profiles/technical";
import type {
  DomainGenerationResult,
  EntityGenerationOutcome,
  GeneratorProfile,
} from "./types";
import { LintIssue } from "../../../shared/lint-types";
import {
  findPayloadByBlockId,
  isBlockReferencedInYaml,
} from "./block-resolver";

const DEFAULT_OPTIONS: Required<
  Omit<
    GenerationOptions,
    "menuRootId" | "treeChain" | "treeUseExistingId" | "restoreOrphanedIds"
  >
> & {
  treeChain?: TreeChain;
  treeUseExistingId?: string;
} = {
  includeBulk: true,
  includePage: false,
  includeLinkageWidgets: true,
  skipExisting: true,
  excludeReadonlyFromCreate: false,
  skipManuallyModified: true,
  replaceModified: false,
  treeType: "ordinary",
  treeVariant: "merged",
  treeChunkSize: 20,
  treeOrdering: false,
  treeChain: undefined,
  treeUseExistingId: undefined,
};

export async function generateForDomain(
  allDomains: RawDomainEntry[],
  index: ModelIndex,
  request: {
    domainId: string;
    profile: GeneratorProfile;
    options?: GenerationOptions;
    entityIds?: string[];
  },
  rootDir: string,
  opts?: {
    onProgress?: (p: DomainGenerationProgress) => void;
    signal?: AbortSignal;
  },
): Promise<DomainGenerationResult> {
  const domain = allDomains.find((d) => d.id === request.domainId);
  if (!domain) throw new Error(`Domain ${request.domainId} not found`);

  const allEntityIds = (domain.rawData?.entities ?? [])
    .map((e: any) => String(e?.id || ""))
    .filter(Boolean);
  const targetIds =
    request.entityIds && request.entityIds.length > 0
      ? request.entityIds.filter((id) => allEntityIds.includes(id))
      : allEntityIds;

  const total = targetIds.length;
  opts?.onProgress?.({ phase: "start", current: 0, total });

  const outcomes: EntityGenerationOutcome[] = [];
  for (let i = 0; i < targetIds.length; i++) {
    if (opts?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const entityId = targetIds[i];
    opts?.onProgress?.({
      phase: "entity-start",
      entityId,
      current: i,
      total,
    });

    try {
      const result = generateForEntity(
        allDomains,
        index,
        {
          domainId: request.domainId,
          entityId,
          profile: request.profile,
          options: request.options,
          skipPreflight: true,
        },
        rootDir,
      );
      outcomes.push({ entityId, result, error: null });
      opts?.onProgress?.({
        phase: "entity-done",
        entityId,
        current: i + 1,
        total,
        blocksCount: result.blocks.length,
      });
    } catch (e: any) {
      outcomes.push({ entityId, result: null, error: e.message });
      opts?.onProgress?.({
        phase: "entity-error",
        entityId,
        current: i + 1,
        total,
        error: e.message,
      });
    }
  }

  // combine
  const blocks: GeneratedBlock[] = [];
  const yamlByBlock: Record<string, string> = {};
  const manifestStatus: Record<string, ManifestBlockStatus> = {};
  const skipped: GenerationResult["skipped"] = [];
  const emptySectionsSet = new Set<GeneratorSectionKey>();

  for (const o of outcomes) {
    if (!o.result) continue;
    blocks.push(...o.result.blocks);
    Object.assign(yamlByBlock, o.result.yamlByBlock);
    Object.assign(manifestStatus, o.result.manifestStatus);
    skipped.push(...o.result.skipped);
    for (const s of o.result.emptySections) emptySectionsSet.add(s);
  }

  opts?.onProgress?.({ phase: "preflight", current: total, total });
  const combinedBeforeIndex = buildModelIndex(allDomains);
  const preflight = runPreflight(
    allDomains,
    request.domainId,
    blocks,
    manifestStatus,
    !!request.options?.replaceModified,
    request.options?.restoreOrphanedIds,
    combinedBeforeIndex,
  );

  opts?.onProgress?.({ phase: "done", current: total, total });

  return {
    domainId: request.domainId,
    profile: request.profile,
    results: outcomes,
    combined: {
      blocks,
      yamlByBlock,
      manifestStatus,
      skipped,
      emptySections: Array.from(emptySectionsSet),
      preflight,
    },
    stats: {
      total: targetIds.length,
      generated: outcomes.filter((o) => o.result && o.result.blocks.length > 0)
        .length,
      skipped: outcomes.filter((o) => o.result && o.result.blocks.length === 0)
        .length,
      failed: outcomes.filter((o) => o.error).length,
    },
  };
}

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
  rootDir: string,
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
  if (request.profile === "technical") {
    profileResult = runTechnicalProfile(ctx, {
      skipExisting: options.skipExisting,
    });
  } else if (request.profile === "tree-view") {
    profileResult = runTreeViewProfile(ctx, index, options);
  } else if (request.profile === "custom") {
    throw new Error(`Profile "custom" is not implemented in this version`);
  } else {
    const useDictionary =
      request.profile === "dictionary" || ctx.flags.isDictionary;
    if (useDictionary) {
      profileResult = runDictionaryProfile(ctx, {
        skipExisting: options.skipExisting,
      });
    } else {
      if (request.profile === "crud-with-page") options.includePage = true;
      profileResult = runCrudProfile(ctx, options);
    }
  }

  const allBlocks = profileResult.blocks;
  linkDependents(allBlocks);

  const rawDomain = allDomains.find((d) => d.id === request.domainId)?.rawData;
  const manifest = loadGeneratedManifest(rootDir);
  const entityManifest =
    manifest.domains[request.domainId]?.entities[request.entityId]?.blocks ??
    {};

  const manifestStatus: Record<string, ManifestBlockStatus> = {};
  for (const b of allBlocks) {
    const currentPayload = rawDomain
      ? findPayloadByBlockId(rawDomain, b.blockId, b.parentViewId)
      : null;
    const entry = entityManifest[b.blockId];
    const newHash = hashPayload(b.payload);

    if (currentPayload == null) {
      if (
        entry &&
        rawDomain &&
        isBlockReferencedInYaml(rawDomain, b.blockId, b.parentViewId)
      ) {
        // orphaned, но на него активно ссылаются из YAML —
        // broken reference. Восстанавливаем как new (auto-append).
        manifestStatus[b.blockId] = "new";
      } else {
        manifestStatus[b.blockId] = entry ? "orphaned" : "new";
      }
      continue;
    }

    const currentHash = hashPayload(currentPayload);
    if (currentHash === newHash) manifestStatus[b.blockId] = "unchanged";
    else if (entry && entry.hash === currentHash)
      manifestStatus[b.blockId] = "outdated";
    else manifestStatus[b.blockId] = "modified";
  }

  for (const blockId of Object.keys(entityManifest)) {
    if (!(blockId in manifestStatus)) manifestStatus[blockId] = "orphaned";
  }

  const yamlByBlock: Record<string, string> = {};
  for (const b of allBlocks) {
    try {
      yamlByBlock[b.blockId] = emitYaml(b.payload);
    } catch {
      yamlByBlock[b.blockId] = "/* ошибка сериализации */";
    }
  }

  // Для root viewX — пересобрать merged-payload (root + все children),
  // чтобы `yamlByBlock[rootBlockId]` показывал полный YAML для превью.
  const viewRoots = allBlocks.filter(
    (b) => b.section === "views" && !b.parentViewId,
  );
  for (const root of viewRoots) {
    const viewId = root.payload?.id;
    if (!viewId) continue;
    const children = allBlocks.filter(
      (b) => b.section === "views" && b.parentViewId === viewId,
    );
    const merged = mergeViewTree(root, children);
    try {
      yamlByBlock[root.blockId] = emitYaml(merged.payload);
    } catch {
      yamlByBlock[root.blockId] = "/* ошибка сериализации */";
    }
  }

  const preflight = request.skipPreflight
    ? {
        newIssues: [] as LintIssue[],
        fixedIssues: [] as LintIssue[],
        conflicts: [],
        elapsedMs: 0,
      }
    : runPreflight(
        allDomains,
        request.domainId,
        allBlocks,
        manifestStatus,
        !!options.replaceModified,
        options.restoreOrphanedIds,
      );

  const presentSections = new Set<GeneratorSectionKey>();
  for (const b of allBlocks) presentSections.add(b.section);
  const emptySections: GeneratorSectionKey[] = [];
  for (const s of ["actions", "views", "menus", "medias"] as const) {
    if (!presentSections.has(s)) emptySections.push(s);
  }

  const blockIndex: Record<string, GeneratedBlock> = {};
  for (const b of allBlocks) blockIndex[b.blockId] = b;

  // 1. Для каждого сгенерированного блока — сравнить с YAML и с манифестом
  for (const b of allBlocks) {
    const currentPayload = rawDomain
      ? findPayloadByBlockId(rawDomain, b.blockId, b.parentViewId)
      : null;
    const entry = entityManifest[b.blockId];
    const newHash = hashPayload(b.payload);

    if (currentPayload == null) {
      manifestStatus[b.blockId] = entry ? "orphaned" : "new";
      continue;
    }
    const currentHash = hashPayload(currentPayload);
    if (currentHash === newHash) {
      manifestStatus[b.blockId] = "unchanged";
    } else if (entry && entry.hash === currentHash) {
      manifestStatus[b.blockId] = "outdated";
    } else {
      manifestStatus[b.blockId] = "modified";
    }
  }

  // 2. Блоки из манифеста, которых нет среди сгенерированных — orphaned
  for (const blockId of Object.keys(entityManifest)) {
    if (!(blockId in manifestStatus)) {
      manifestStatus[blockId] = "orphaned";
    }
  }

  return {
    request,
    blocks: allBlocks,
    blockIndex,
    emptySections,
    yamlByBlock,
    skipped: profileResult.skipped,
    preflight,
    manifestStatus,
  };
}

export * from "./types";
export { loadGeneratedManifest, mergeGeneratedManifest } from "./manifest";
export type {
  GeneratedManifest,
  EntityManifest,
  DomainManifest,
  ManifestBlockEntry,
} from "./manifest";
export { runTechnicalProfile } from "./profiles/technical";
export type { DomainGenerationResult, EntityGenerationOutcome };
