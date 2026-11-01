import type { LintIssue, LintSeverity, LintRuleCategory } from "./lint-types";

/**
 * Слепок одной lint-проблемы для baseline.
 *
 * Ключ сравнения — `ruleId + entityFqid + attributeId + message`.
 * Намеренно НЕ включаем `propertyPath` и `line`: они меняются при
 * любой вставке/удалении строк выше, и сравнение по ним давало бы
 * «все проблемы новые» на каждый рефакторинг YAML.
 */
export interface LintBaselineIssue {
  ruleId: string;
  entityFqid: string | null;
  attributeId: string | null;
  message: string;
  severity: LintSeverity;
  category: LintRuleCategory;
  rule: string;
  hint?: string;
  domainId: string;
}

export interface LintBaselineFile {
  domainId: string;
  takenAt: string;
  issues: LintBaselineIssue[];
}

export interface LintBaselineComparison {
  domainId: string;
  hasBaseline: boolean;
  takenAt: string | null;
  totalCurrent: number;
  totalBaseline: number;
  newIssues: LintIssue[];
  fixedIssues: LintBaselineIssue[];
}

export interface LintBaselineSummary {
  domainsWithBaseline: number;
  totalIssues: number;
  totalNew: number;
  totalFixed: number;
  byDomain: Array<{
    domainId: string;
    totalCurrent: number;
    totalBaseline: number;
    newCount: number;
    fixedCount: number;
  }>;
}
