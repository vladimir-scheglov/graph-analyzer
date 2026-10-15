// Локальные типы для веб-части. Намеренно loose — большая часть кода
// работает с plain objects из graph-data.json.

export interface RFNodePosition {
  x: number;
  y: number;
}

export interface RFNodeData {
  domainId: string;
  label?: string;
  name?: string;
  nodeType: "domain" | "missing" | "broken";
  description?: string;
  tags?: string[];
  author?: string;
  version?: string;
  filePath?: string | null;
  folderPath?: string[];
  fqidRefs?: FQIDRef[];
  entitiesCount?: number;
  updatedAt?: string | null;
  updatedAtSource?: "graphql" | "fs" | null;
  createdAt?: string | null;
  createdAtSource?: "graphql" | "fs" | null;

  // Динамические поля, добавляемые на этапе рендера
  health?: number | null;
  healthBreakdown?: HealthBreakdownItem[];
  __compact?: boolean;
  __topoLevel?: number | null;
  __invalid?: boolean;
  __validationStatus?: string | null;
  __validationDiagnostics?: any[];
  __validationCount?: number;
  __bookmarked?: boolean;
  __tooltipsEnabled?: boolean;
  __heatColor?: string;
  __inPath?: boolean;
  __isPathEndpoint?: boolean;
  __isAdded?: boolean;
  __selectedHighlight?: boolean;
  __failed?: boolean;
  __pendingFail?: boolean;
  __failureRoot?: boolean;
  dimmed?: boolean;

  [key: string]: any;
}

export interface RFNode {
  id: string;
  type?: string;
  position: RFNodePosition;
  data: RFNodeData;
  width?: number;
  height?: number;
  selected?: boolean;
  hidden?: boolean;
  style?: Record<string, any>;
  [key: string]: any;
}

export interface RFEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  data?: any;
  style?: Record<string, any>;
  markerEnd?: any;
  markerStart?: any;
  animated?: boolean;
  [key: string]: any;
}

export interface FQIDRef {
  sourceDomainId?: string;
  targetDomainId: string;
  targetEntityId?: string;
  fullFQID: string;
  propertyPath: string;
  filePath?: string;
}

export interface HealthBreakdownItem {
  reason: string;
  delta: number;
}

export interface HealthResult {
  score: number;
  breakdown: HealthBreakdownItem[];
}

export interface EntityRecord {
  domainId: string;
  entityId: string;
  name: string;
  inherits: string | null;
}

export interface EntityIndex {
  byKey: Map<string, EntityRecord>;
  children: Map<string, EntityRecord[]>;
}

export interface EntityTreeNode {
  key: string;
  domainId: string;
  entityId: string;
  name: string | null;
  inherits: string | null;
  missing: boolean;
}

export interface EntityTree {
  nodes: EntityTreeNode[];
  edges: Array<{ id: string; source: string; target: string }>;
  rootKey: string;
  parentKeys: Set<string>;
  childKeys: Set<string>;
  cycleNodes: Set<string>;
}

export interface CycleInfo {
  sccs: string[][];
  cycleNodes: Set<string>;
  cycleEdges: Set<string>;
}

export interface RuleDefinition {
  id: string;
  from: string;
  to: string;
  action: "warn" | "forbid";
  message?: string;
}

export interface RuleViolation {
  ruleId: string;
  rule: RuleDefinition;
  edgeId: string;
  fromId: string;
  toId: string;
  severity: "warn" | "forbid";
}

export interface DepGraph {
  deps: Map<string, Set<string>>;
  domainIds: Set<string>;
  nodeById: Map<string, RFNode>;
}

export interface TopoSortResult {
  levels: string[][];
  cyclic: string[];
  criticalPath: number;
  broken: Array<{ id: string; level: number; brokenDeps: string[] }>;
}

export interface LearningPathStage {
  index: number;
  domains: LearningPathDomain[];
}

export interface LearningPathDomain {
  id: string;
  domainId: string;
  label?: string;
  description?: string;
  tags?: string[];
  fanIn: number;
  fanOut: number;
  entitiesCount?: number;
  fqidRefsCount: number;
}

export interface LearningPath {
  entryPoints: LearningPathDomain[];
  stages: LearningPathStage[];
  totalStages: number;
  totalDomains: number;
  unresolved: LearningPathDomain[];
}

export interface ValidationDiagnostic {
  message: string;
  severity: string;
  labels?: Array<{ message?: string; span?: { start: number; end: number } }>;
}

export interface ValidationRecord {
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
