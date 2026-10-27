// ============ Граф ============
export type NodeType = "domain" | "missing" | "broken";
export type EdgeKind = "fqid" | "linkage" | "aggregated";

export interface GraphNode {
  id: string;
  label: string;
  domainId: string;
  group: NodeType;
  title: string;
  filePath: string | null;
  folderPath: string[];
  fqidRefs?: FQIDReference[];
  version?: string;
  entitiesCount?: number;
  name?: string;
  description?: string;
  author?: string;
  tags?: string[];
  updatedAt?: string | null;
  updatedAtSource?: "graphql" | "fs" | null;
  createdAt?: string | null;
  createdAtSource?: "graphql" | "fs" | null;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  title: string;
  kind: EdgeKind;
  refCount?: number;
  fqidRefs?: FQIDReference[];
  linkData?: LinkageData;
  side1Domain?: string | null;
  side2Domain?: string | null;
  side1Raw?: string | null;
  side2Raw?: string | null;
  fullLabel?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: AnalyzerStats;
  domainCount: number;
  linkCount: number;
  fqidReferences: FQIDReference[];
  missingCount: number;
  brokenCount: number;
  entities: DomainEntity[];
  cacheDiff: CacheDiff | null;
  remoteInfo?: RemoteInfo | null;
}

// ============ FQID ============
export interface FQIDParts {
  domainId: string;
  entityId: string;
}

export interface FQIDReference {
  sourceDomainId: string;
  targetDomainId: string;
  targetEntityId?: string;
  fullFQID: string;
  filePath: string;
  propertyPath: string;
  propertyName?: string;
}

// ============ Сущности ============
export interface DomainEntity {
  domainId: string;
  entityId: string;
  name: string;
  inherits: string | null;
}

// ============ Linkages ============
export interface LinkageData {
  id: string;
  originalId: string;
  name: string;
  type: string;
  source: string;
  target: string;
  sourceFile: string;
  nameFrom: { side1?: string; side2?: string };
  sourceEntity: string;
  targetEntity: string;
  side1Domain: string;
  side2Domain: string;
  side1Raw: string;
  side2Raw: string;
  fqidRef: { fullFQID: string; propertyPath: string; propertyName: string };
}

// ============ Remote ============
export interface RemoteCredentials {
  server: string;
  loginUrl: string;
  apiUrl: string;
  tenantId: string;
  token: string | null;
  username: string;
  password: string;
  secure: boolean;
}

export interface RemoteInfo {
  cacheDir: string;
  fromCache: boolean;
  server: string;
  fetchedAt: string | null;
  /**
   * 'remote'  — файлы в кэше, сохранение через publishExpertise;
   * 'hybrid'  — файлы локальные, только локальное сохранение + серверная валидация.
   * undefined → обратная совместимость, считается 'remote'.
   */
  mode?: "remote" | "hybrid";
}

/** Результат публикации при сохранении в remote-режиме. */
export interface PublishResult {
  ok: boolean;
  /** Текст ошибки, если ok === false. */
  error?: string;
  /** Код ошибки сервера (exp.extensions.code), если ok === false. */
  code?: string;
  /** Дружелюбная подсказка, если код известен (LOWER_VERSION и т.п.). */
  hint?: string;
  /** Идентификатор и имя опубликованной экспертизы (если ok === true). */
  domain?: { id: string; name: string };
}

/** Результат сохранения черновика (saveDraft). */
export interface DraftResult {
  ok: boolean;
  error?: string;
  code?: string;
  hint?: string;
  domain?: { id: string; name: string };
}

/** Ответ /file (POST). */
export interface SaveResponse {
  ok: true;
  bytes: number;
  /** Какое действие выполнялось. */
  action: "save" | "publish";
  /** remote, action=save. */
  draft: DraftResult | null;
  /** remote, action=publish. */
  publish: PublishResult | null;
}

/** Информация о домене, нужная для publishExpertise. */
export interface DomainPublishInfo {
  id: string;
  folderId: string;
  sourceId: string;
  name: string;
}

export interface RemoteFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
}

export interface RemoteDomain {
  id: string;
  sourceId: string;
  folderId: string;
  type: string;
  name: string;
  status: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  objectType: string | null;
  updater: { id: string; displayName: string } | null;
  organization?: { id: string; name: string } | null;
}



// ============ Diff ============
export interface CacheDiffEntry {
  sourceId: string;
  name: string;
  version?: string;
  tags?: string[];
  changes?: Array<{ field: string; from: any; to: any }>;
}

export interface CacheDiff {
  previousFetchedAt: string | null;
  currentFetchedAt: string | null;
  added: CacheDiffEntry[];
  removed: CacheDiffEntry[];
  changed: CacheDiffEntry[];
}

// ============ Валидация ============
export interface ValidationDiagnostic {
  message: string;
  severity: "ERROR" | "WARNING" | "INFO" | string;
  labels?: Array<{
    message?: string;
    primary?: boolean;
    span?: { start: number; end: number };
  }>;
}

export interface ValidationResult {
  domainId: string;
  status: "valid" | "invalid" | "error" | "skip";
  diagnostics?: ValidationDiagnostic[];
  error?: string;
  current?: number;
  total?: number;
}

export interface ValidationStats {
  total: number;
  processed: number;
  valid: number;
  invalid: number;
  errors: number;
  elapsedMs: number;
}

export interface ValidationReport {
  generatedAt: string;
  server?: string;
  cancelled: boolean;
  stats: ValidationStats;
  results: ValidationResult[];
}

// ============ Stats ============
export interface AnalyzerStats {
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  brokenFiles: number;
  domains: number;
  links: number;
  fqidReferences: number;
}

// ============ CLI ============
export interface CliFlags {
  server?: string;
  login?: string;
  username?: string;
  password?: string;
  port?: string;
  refresh?: boolean;
  "reset-cache"?: boolean;
  secure?: boolean;
  help?: boolean;
  [key: string]: string | boolean | undefined;
}

export interface ParsedArgs {
  positional: string[];
  flags: CliFlags;
}
