import type { LintIssue } from "../../../shared/lint-types";

export interface EntityGenerationOutcome {
  entityId: string;
  result: GenerationResult | null;
  error: string | null;
}

export interface DomainGenerationResult {
  domainId: string;
  profile: GeneratorProfile;
  results: EntityGenerationOutcome[];
  combined: {
    blocks: GeneratedBlock[];
    yamlByBlock: Record<string, string>;
    manifestStatus: Record<string, ManifestBlockStatus>;
    skipped: GenerationResult["skipped"];
    emptySections: GeneratorSectionKey[];
    preflight: PreflightResult;
  };
  stats: {
    total: number;
    generated: number;
    skipped: number;
    failed: number;
  };
}

export type GeneratorSectionKey =
  | "actions"
  | "views"
  | "menus"
  | "medias"
  | "dataRules"
  | "sequences"
  | "dataTypes"
  | "linkages"
  | "trees";

export type GeneratorProfile =
  | "crud"
  | "crud-with-page"
  | "dictionary"
  | "no-modals"
  | "tree-view"
  | "technical"
  | "custom";

export interface GeneratedBlock {
  blockId: string;
  section: GeneratorSectionKey;
  groupPath: string[];
  payload: any;
  dependsOn: string[];
  dependents: string[];
  title: string;
  blockedReason?: string;
  /** Для section: "menus" — id root_group, в items[] которого добавлять. */
  menuRootId?: string;
  /**
   * Для section: "views" — id top-level view-контейнера, внутрь которого
   * вкладывается блок. Правила:
   *   null/undefined  — top-level view (добавляется в rawData.views[]);
   *   "viewX"         — вкладывается в viewX.widgets[] / groups[] / views[]
   *                     в зависимости от префикса blockId ("widget:" / "group:" / "view:").
   */
  parentViewId?: string;
}

export type ManifestBlockStatus =
  | "new" // нет в YAML, нет в манифесте
  | "unchanged" // есть в YAML, совпадает с новым сгенерированным
  | "outdated" // есть в YAML, hash совпадает с манифестом, но новый payload отличается
  | "modified" // есть в YAML, hash НЕ совпадает с манифестом → правили руками
  | "orphaned"; // был в манифесте, но нет в YAML

export interface GenerationRequest {
  domainId: string;
  entityId: string;
  profile: GeneratorProfile;
  options?: GenerationOptions;
  skipPreflight?: boolean;
}

export interface TreeChainStep {
  linkageId: string;
  /**
   * Сторона parent в linkage. Для дерева всегда 1:
   * только при parent на side1 у него МНОГО children (1_n).
   * side: 2 даёт N_1 — у parent один child, не иерархия.
   * Оставлено 1 | 2 для обратной совместимости со старыми chain.
   */
  side: 1 | 2;
  /**
   * Полный FQID дочерней сущности с case как в схеме.
   * Короткие имена запрещены — теряют домен, ломают lint.
   */
  childEntityId: string;
}

export type TreeChain = TreeChainStep[];

export interface GenerationOptions {
  includeBulk?: boolean; // default: true
  includePage?: boolean; // default: ui.page
  includeLinkageWidgets?: boolean; // default: true
  skipExisting?: boolean; // default: true
  menuRootId?: string;
  /** Не включать readonly-атрибуты в blocks_forms_newX. Default: false. */
  excludeReadonlyFromCreate?: boolean;
  /**
   * Не показывать в UI блоки со статусом "modified" как выбранные по умолчанию.
   * Default: true.
   */
  skipManuallyModified?: boolean;
  replaceModified?: boolean;
  /**
   * blockId с manifestStatus === "orphaned", которые пользователь явно
   * выбрал для восстановления. Игнорируют skip в selectApplyBlocks/planEdits.
   */
  restoreOrphanedIds?: string[];
  // ── tree-view ──────────────────────────────────────────────
  treeType?: "ordinary" | "orderable" | "multiparent";
  treeVariant?: "merged" | "splitted";
  treeChunkSize?: number;
  treeOrdering?: boolean;
  /** Цепочка связей от root вниз. Если пусто — авто (все side-1 как siblings). */
  treeChain?: TreeChain;
  /** Использовать существующее дерево из trees[]. Приоритетнее treeChain. */
  treeUseExistingId?: string;
}

export interface GenerationResult {
  request: GenerationRequest;
  blocks: GeneratedBlock[];
  blockIndex: Record<string, GeneratedBlock>;
  emptySections: GeneratorSectionKey[];
  yamlByBlock: Record<string, string>;
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
  preflight: PreflightResult;
  manifestStatus: Record<string, ManifestBlockStatus>;
}

export interface PreflightResult {
  newIssues: LintIssue[];
  fixedIssues: LintIssue[];
  conflicts: Array<{ blockId: string; reason: string }>;
  elapsedMs: number;
}

export type DomainGenerationProgressPhase =
  | "start"
  | "entity-start"
  | "entity-done"
  | "entity-error"
  | "preflight"
  | "done";

export interface DomainGenerationProgress {
  phase: DomainGenerationProgressPhase;
  /** Для entity-* — id сущности. */
  entityId?: string;
  /** 0-based: сколько завершено. */
  current: number;
  total: number;
  /** Для entity-done — сколько блоков сгенерировано. */
  blocksCount?: number;
  /** Для entity-error — текст ошибки. */
  error?: string;
}