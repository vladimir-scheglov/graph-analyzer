import type { LintIssue } from "../../../shared/lint-types";

export type GeneratorSectionKey =
  | "actions"
  | "views"
  | "menus"
  | "medias"
  | "dataRules"
  | "sequences"
  | "dataTypes"
  | "linkages";

export type GeneratorProfile =
  | "crud"
  | "crud-with-page"
  | "dictionary"
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
}

export interface GenerationRequest {
  domainId: string;
  entityId: string;
  profile: GeneratorProfile;
  options?: GenerationOptions;
}

export interface GenerationOptions {
  includeBulk?: boolean; // default: true
  includePage?: boolean; // default: ui.page
  includeLinkageWidgets?: boolean; // default: true
  skipExisting?: boolean; // default: true
  menuRootId?: string;
  /** Не включать readonly-атрибуты в blocks_forms_newX. Default: false. */
  excludeReadonlyFromCreate?: boolean;
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
}

export interface PreflightResult {
  newIssues: LintIssue[];
  fixedIssues: LintIssue[];
  conflicts: Array<{ blockId: string; reason: string }>;
  elapsedMs: number;
}
