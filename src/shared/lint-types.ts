export type LintSeverity = "error" | "warning" | "info";

export type LintRuleCategory =
  | "naming"
  | "required"
  | "recommended"
  | "reference"
  | "semantic"
  | "validation"
  | "uirules";

export interface LintIssue {
  ruleId: string;
  severity: LintSeverity;
  category: LintRuleCategory;
  /** Человеческое название правила. */
  rule: string;
  /** Описание, что не так. */
  message: string;

  /** Где — FQID сущности, домен, атрибут. */
  domainId: string;
  entityFqid?: string;
  attributeId?: string;
  /** Путь в YAML для клика. */
  propertyPath?: string;

  /** Рекомендация по исправлению. */
  hint?: string;
}

export interface LintReport {
  generatedAt: string;
  issues: LintIssue[];
  stats: {
    total: number;
    bySeverity: Record<LintSeverity, number>;
    byCategory: Record<LintRuleCategory, number>;
    byRule: Array<{
      ruleId: string;
      rule: string;
      severity: LintSeverity;
      count: number;
    }>;
  };
}

export interface SonarScore {
  /** Итоговая оценка 0–100. */
  score: number;
  /** Уровень: A (90+), B (75+), C (60+), D (40+), E (<40). */
  grade: "A" | "B" | "C" | "D" | "E";
  breakdown: Array<{
    category: LintRuleCategory;
    label: string;
    score: number;
    weight: number;
    issueCount: number;
  }>;
}

export interface DomainSonarScores {
  byDomain: Record<string, SonarScore>;
  overall: SonarScore;
}

// Расширение ModelIndex
export interface LintExtension {
  lintReport: LintReport;
  sonar: DomainSonarScores;
}
