import type {
  ActionRecord,
  AttributeRecord,
  DataRuleRecord,
  DataTypeRecord,
  DomainSchemaAllViewItem,
  EntityLinkage,
  EntityRecord,
  MixinRecord,
} from "../../../shared/model-types";
import type { LintIssue } from "../../../shared/lint-types";
import type { PiiHit } from "../../../shared/pii-types";
import type { RFNode } from "../types";

export type ModelSearchKind =
  | "domain"
  | "entity"
  | "attribute"
  | "linkage"
  | "view"
  | "action"
  | "menu"
  | "dataType"
  | "dataRule"
  | "mixin"
  | "pii"
  | "lint";

export interface ModelSearchResult {
  kind: ModelSearchKind;
  /** Уникальный ключ для дедупликации (kind + id). */
  key: string;
  label: string;
  sublabel?: string;
  domainId?: string;
  fqid?: string;
  attributeId?: string;
  /** Чем больше — тем выше в списке. */
  score: number;

  // Payload для dispatch:
  node?: RFNode;
  entity?: EntityRecord;
  attribute?: AttributeRecord;
  viewItem?: DomainSchemaAllViewItem;
  actionRecord?: ActionRecord;
  linkage?: EntityLinkage;
  dataTypeRecord?: DataTypeRecord;
  dataRule?: DataRuleRecord;
  mixin?: MixinRecord;
  menuItem?: { id: string; route: string; label: string; domainId: string };
  piiHit?: PiiHit;
  lintIssue?: LintIssue;
}

export interface ParsedFilter {
  field: string;
  value: string;
  negate: boolean;
}

export interface ParsedQuery {
  plainTokens: string[];
  filters: ParsedFilter[];
}

export interface SearchOutcome {
  results: ModelSearchResult[];
  total: number;
  truncated: boolean;
  error: string | null;
  parsed: ParsedQuery;
  ready: boolean;
}

/** Известные поля — для отсечения «foo:bar» в plain-text. */
export const KNOWN_FIELDS = new Set<string>([
  "entity",
  "attr",
  "attribute",
  "domain",
  "namespace",
  "type",
  "constraint",
  "has",
  "without",
  "inherits",
  "ref",
  "tag",
  "view",
  "viewtype",
  "action",
  "actiontype",
  "linkage",
  "datatype",
  "datarule",
  "effect",
  "mixin",
  "menu",
  "pii",
  "lint",
  "fqid",
]);
