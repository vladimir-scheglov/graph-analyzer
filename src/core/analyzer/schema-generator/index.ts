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
import { detectEntityContext, EntityGenerationContext } from "./detect";
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
import { runTabsListProfile } from "./profiles/tabs-list";
import { runSortingSearchingProfile } from "./profiles/sorting-searching";
import { runTransitiveChainProfile } from "./profiles/transitive-chain";
import { buildDomainExtras } from "./builders/domain-extras";
import { runDefaultsProfile } from "./profiles/defaults";
import { runLinkedGroupsProfile } from "./profiles/linked-groups";
import { runDomainExtrasProfile } from "./profiles/domain-extras";
import { runEnumWorkflowProfile } from "./profiles/enum-workflow";
import { runUiStatusColorsProfile } from "./profiles/ui-status-colors";
import { runExchangeSettingsProfile } from "./profiles/exchange-settings";
import { runCounterColorProfile } from "./profiles/counter-color";
import { isDomainScopeProfile } from "./scope";
export { DOMAIN_SCOPE_PROFILES } from "./scope";
export { runDomainExtrasProfile } from "./profiles/domain-extras";
export { runEnumWorkflowProfile } from "./profiles/enum-workflow";
export { runUiStatusColorsProfile } from "./profiles/ui-status-colors";
export { runExchangeSettingsProfile } from "./profiles/exchange-settings";
export { runCounterColorProfile } from "./profiles/counter-color";
export { runLinkedGroupsProfile } from "./profiles/linked-groups";

const DEFAULT_OPTIONS: Required<
  Omit<
    GenerationOptions,
    | "menuRootId"
    | "treeChain"
    | "treeUseExistingId"
    | "restoreOrphanedIds"
    | "tabsViewId"
    | "tabsLabel"
    | "tabsDefaultTab"
    | "transitiveChain"
    | "transitiveTreeId"
    | "transitiveLabel"
    | "transitiveWidgetViewId"
    | "transitiveColumnViewId"
  >
> & {
  treeChain?: TreeChain;
  treeUseExistingId?: string;
  tabsViewId?: string;
  tabsLabel?: string;
  tabsDefaultTab?: string;
  transitiveChain?: TreeChain;
  transitiveTreeId?: string;
  transitiveLabel?: string;
  transitiveWidgetViewId?: string;
  transitiveColumnViewId?: string;
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
  tabsListIds: [] as string[],
  tabsViewId: undefined as string | undefined,
  tabsLabel: undefined as string | undefined,
  tabsDefaultTab: undefined as string | undefined,
  tabsIncludeMenu: false,
  noModals: false,
  includeSorting: true,
  includeSearching: true,
  transitiveChain: undefined as TreeChain | undefined,
  transitiveTreeId: undefined as string | undefined,
  transitiveIncludeWidget: true,
  transitiveIncludeListColumn: true,
  transitiveLabel: undefined as string | undefined,
  transitiveWidgetViewId: undefined,
  transitiveColumnViewId: undefined,
  scaffoldCreateMenuRoot: false,
  scaffoldCreateMedias: false,
  defaultsBool: true,
  defaultsEnum: true,
  defaultsWorkflow: true,
  defaultsBoolValue: false,
  menuIncludeItems: true,
  enumSuffixes: [
    "Type",
    "Kind",
    "Status",
    "Category",
    "Severity",
    "State",
    "Mode",
    "Level",
  ],
  enumDefaultValues: ["unknown", "other"],
  enumEnableWorkflow: false,
  uiStatusColorPalette: [
    "#94a3b8",
    "#6366f1",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#8b5cf6",
  ],
  exchangeEnable: true,
  exchangeForExportStrategy: "label" as const,
  exchangeNoCmsSync: false,
  counterColorDefaultRed: "100%",
  counterColorDefaultYellow: "50%",
  linkedGroupsIncludeSingles: false,
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

  if (isDomainScopeProfile(request.profile)) {
    opts?.onProgress?.({ phase: "start", current: 0, total: 1 });

    let result: GenerationResult | null = null;
    let error: string | null = null;

    try {
      result = generateDomainScope(
        {
          domainId: request.domainId,
          profile: request.profile,
          options: request.options,
          skipPreflight: true,
        },
        allDomains,
        index,
        rootDir,
      );
    } catch (e: any) {
      error = e.message || String(e);
    }

    opts?.onProgress?.({ phase: "done", current: 1, total: 1 });

    const outcome: EntityGenerationOutcome = {
      entityId: "(domain)",
      result,
      error,
    };

    const combined = result
      ? {
          blocks: result.blocks,
          yamlByBlock: result.yamlByBlock,
          manifestStatus: result.manifestStatus,
          skipped: result.skipped,
          emptySections: result.emptySections,
          preflight: result.preflight,
        }
      : {
          blocks: [] as GeneratedBlock[],
          yamlByBlock: {} as Record<string, string>,
          manifestStatus: {} as Record<string, ManifestBlockStatus>,
          skipped: [] as GenerationResult["skipped"],
          emptySections: [] as GeneratorSectionKey[],
          preflight: {
            newIssues: [] as LintIssue[],
            fixedIssues: [] as LintIssue[],
            conflicts: [],
            elapsedMs: 0,
          },
        };

    return {
      domainId: request.domainId,
      profile: request.profile,
      results: [outcome],
      combined,
      stats: {
        total: 1,
        generated: result && result.blocks.length > 0 ? 1 : 0,
        skipped: result && result.blocks.length === 0 ? 1 : 0,
        failed: error ? 1 : 0,
      },
    };
  }

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

  const needsExtras =
    request.options?.scaffoldCreateMenuRoot ||
    request.options?.scaffoldCreateMedias ||
    request.options?.menuIncludeItems;

  if (needsExtras) {
    const extras = buildDomainExtras(request.domainId, index, allDomains, {
      scaffoldCreateMenuRoot: !!request.options?.scaffoldCreateMenuRoot,
      scaffoldCreateMedias: !!request.options?.scaffoldCreateMedias,
      menuIncludeItems: request.options?.menuIncludeItems,
    });
    for (const b of extras.blocks) {
      blocks.push(b);
      try {
        yamlByBlock[b.blockId] = emitYaml(b.payload);
      } catch {
        yamlByBlock[b.blockId] = "/* ошибка сериализации */";
      }
      manifestStatus[b.blockId] = "new";
    }
    skipped.push(...extras.skipped);
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
  const options: Required<GenerationOptions> = {
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
  if (!ctx)
    throw new Error(
      `Entity ${request.domainId}/${request.entityId} not found in index`,
    );

  // ── Synthetic root_group, если scaffoldCreateMenuRoot и корня нет ──
  const scaffoldBlocks: GeneratedBlock[] = [];
  if (request.options?.scaffoldCreateMenuRoot && !ctx.menuRoot) {
    const slug = (request.domainId || "").split(".")[0] || "domain";
    const rootId = `menus_${slug}`;
    const rootRoute = `/${slug}`;
    const synthetic = {
      id: rootId,
      route: rootRoute,
      type: "root_group" as const,
    };

    ctx.menuRoot = synthetic;
    ctx.menuRoots = [synthetic];

    scaffoldBlocks.push({
      blockId: `menu:${rootId}`,
      section: "menus",
      groupPath: ["menus"],
      payload: {
        id: rootId,
        route: rootRoute,
        label:
          index.domains.find((d) => d.id === request.domainId)?.name ||
          request.domainId,
        type: "root_group",
        placement: "top",
        items: [],
      },
      dependsOn: [],
      dependents: [],
      title: `Корневое меню ${rootId}`,
    });
  }

  if (options.includePage === undefined) {
    options.includePage = ctx.flags.hasPage;
  }

  // profile → options
  if (request.profile === "crud-with-page") {
    options.includePage = true;
  } else if (request.options?.includePage === undefined) {
    options.includePage = ctx.flags.hasPage;
  }

  let profileResult;
  if (request.profile === "technical") {
    profileResult = runTechnicalProfile(ctx, {
      skipExisting: options.skipExisting,
    });
  } else if (request.profile === "tree-view") {
    profileResult = runTreeViewProfile(ctx, index, options);
  } else if (request.profile === "tabs-list") {
    profileResult = runTabsListProfile(ctx, {
      tabsListIds: options.tabsListIds,
      tabsViewId: options.tabsViewId,
      tabsLabel: options.tabsLabel,
      tabsDefaultTab: options.tabsDefaultTab,
      tabsIncludeMenu: options.tabsIncludeMenu,
      skipExisting: options.skipExisting,
      menuRootId: options.menuRootId,
    });
  } else if (request.profile === "no-modals") {
    // Профиль no-modals: read-only list+panel. Переопределяем
    // YAML-флаги в shadow-контексте, чтобы runCrudProfile
    // не сгенерил формы/модалки/create-edit actions.
    const readonlyCtx: EntityGenerationContext = {
      ...ctx,
      flags: {
        ...ctx.flags,
        isReadonly: true,
        hasListUi: true,
        isDictionary: false,
      },
    };
    options.includePage = false; // pages_infoX не генерим
    options.noModals = true;
    profileResult = runCrudProfile(readonlyCtx, index, options);
  } else if (request.profile === "sorting-searching") {
    profileResult = runSortingSearchingProfile(ctx, {
      includeSorting: options.includeSorting,
      includeSearching: options.includeSearching,
    });
  } else if (request.profile === "transitive-chain") {
    profileResult = runTransitiveChainProfile(ctx, index, {
      transitiveChain: options.transitiveChain,
      transitiveTreeId: options.transitiveTreeId,
      transitiveIncludeWidget: options.transitiveIncludeWidget,
      transitiveIncludeListColumn: options.transitiveIncludeListColumn,
      transitiveLabel: options.transitiveLabel,
      transitiveWidgetViewId: options.transitiveWidgetViewId,
      transitiveColumnViewId: options.transitiveColumnViewId,
      skipExisting: options.skipExisting,
    });
  } else if (request.profile === "auto") {
    // Автовыбор профиля по YAML-флагам сущности.
    //   dictionary  → ui: { list: false, modals: false }
    //   no-modals   → ui: { modals: false } + list
    //   crud        → всё остальное
    if (ctx.flags.isDictionary) {
      profileResult = runDictionaryProfile(ctx, index, {
        skipExisting: options.skipExisting,
      });
    } else if (ctx.flags.isReadonly && ctx.flags.hasListUi) {
      const readonlyCtx: EntityGenerationContext = {
        ...ctx,
        flags: {
          ...ctx.flags,
          isReadonly: true,
          hasListUi: true,
          isDictionary: false,
        },
      };
      options.includePage = false;
      options.noModals = true;
      profileResult = runCrudProfile(readonlyCtx, index, options);
    } else {
      profileResult = runCrudProfile(ctx, index, options);
    }
  } else if (request.profile === "defaults") {
    profileResult = runDefaultsProfile(ctx, index, {
      defaultsBool: options.defaultsBool,
      defaultsEnum: options.defaultsEnum,
      defaultsWorkflow: options.defaultsWorkflow,
      defaultsBoolValue: options.defaultsBoolValue,
      skipExisting: options.skipExisting,
    });
  } else if (request.profile === "linked-groups") {
    profileResult = runLinkedGroupsProfile(ctx, index, {
      includeSingles: options.linkedGroupsIncludeSingles === true,
      skipExisting: options.skipExisting,
    });
  } else if (request.profile === "custom") {
    throw new Error(`Profile "custom" is not implemented in this version`);
  } else {
    const useDictionary =
      request.profile === "dictionary" || ctx.flags.isDictionary;
    if (useDictionary) {
      profileResult = runDictionaryProfile(ctx, index, {
        skipExisting: options.skipExisting,
      });
    } else {
      if (request.profile === "crud-with-page") options.includePage = true;
      profileResult = runCrudProfile(ctx, index, options);
    }
  }

  const allBlocks = [...scaffoldBlocks, ...profileResult.blocks];
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

interface DomainScopeRequest {
  domainId: string;
  profile: GeneratorProfile;
  options?: GenerationOptions;
  skipPreflight?: boolean;
}

function generateDomainScope(
  request: DomainScopeRequest,
  allDomains: RawDomainEntry[],
  index: ModelIndex,
  rootDir: string,
): GenerationResult {
  const options: Required<GenerationOptions> = {
    ...DEFAULT_OPTIONS,
    ...(request.options || {}),
  } as any;

  let profileResult: {
    blocks: GeneratedBlock[];
    skipped: GenerationResult["skipped"];
  };

  switch (request.profile) {
    case "domain-extras":
      profileResult = runDomainExtrasProfile(
        request.domainId,
        index,
        allDomains,
        {
          scaffoldCreateMenuRoot: options.scaffoldCreateMenuRoot,
          scaffoldCreateMedias: options.scaffoldCreateMedias,
          menuIncludeItems: options.menuIncludeItems !== false,
        },
      );
      break;
    case "enum-workflow-builder":
      profileResult = runEnumWorkflowProfile(
        request.domainId, index, {
            suffixes: options.enumSuffixes,
            defaultValues: options.enumDefaultValues,
            enableWorkflow: options.enumEnableWorkflow === true,
            skipExisting: options.skipExisting,
        });
    break;
    case "ui-status-colors":
      profileResult = runUiStatusColorsProfile(
        request.domainId,
        index,
        allDomains,
        {
          palette: options.uiStatusColorPalette,
          skipExisting: options.skipExisting,
        },
      );
      break;
    case "exchange-settings":
      profileResult = runExchangeSettingsProfile(request.domainId, index, {
        enable: options.exchangeEnable,
        forExportStrategy: options.exchangeForExportStrategy,
        noCmsSync: options.exchangeNoCmsSync,
        skipExisting: options.skipExisting,
      });
      break;
    case "counter-color":
      profileResult = runCounterColorProfile(request.domainId, index, {
        red: options.counterColorDefaultRed,
        yellow: options.counterColorDefaultYellow,
        skipExisting: options.skipExisting,
      });
      break;
    default:
      throw new Error(`Profile "${request.profile}" is not domain-scope`);
  }

  const allBlocks = profileResult.blocks;
  linkDependents(allBlocks);

  // Манифест: используем entityId = "(domain)" как псевдо-сущность.
  const manifest = loadGeneratedManifest(rootDir);
  const entityManifest =
    manifest.domains[request.domainId]?.entities["(domain)"]?.blocks ?? {};

  const rawDomain = allDomains.find((d) => d.id === request.domainId)?.rawData;

  const manifestStatus: Record<string, ManifestBlockStatus> = {};
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

  return {
    request: { ...request, entityId: "(domain)" } as GenerationRequest,
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
