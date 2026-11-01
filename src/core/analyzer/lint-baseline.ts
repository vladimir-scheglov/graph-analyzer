import type { LintIssue } from "../../shared/lint-types";
import type {
  LintBaselineFile,
  LintBaselineIssue,
  LintBaselineComparison,
  LintBaselineSummary,
} from "../../shared/lint-baseline-types";

export function issueToBaselineRecord(
  issue: LintIssue,
  domainId: string,
): LintBaselineIssue {
  return {
    ruleId: issue.ruleId,
    entityFqid: issue.entityFqid || null,
    attributeId: issue.attributeId || null,
    message: issue.message,
    severity: issue.severity,
    category: issue.category,
    rule: issue.rule,
    hint: issue.hint,
    domainId,
  };
}

/**
 * Ключ сравнения issue ↔ baseline. Совпадение по всем 4 полям = «эта
 * проблема уже была в baseline».
 */
export function baselineKey(rec: {
  ruleId: string;
  message: string;
  /** Опциональные — совместимо с `LintIssue`. */
  entityFqid?: string | null;
  attributeId?: string | null;
}): string {
  return [
    rec.ruleId,
    rec.entityFqid || "",
    rec.attributeId || "",
    rec.message,
  ].join("\u0000");
}

export function buildBaselineForDomain(
  issues: LintIssue[],
  domainId: string,
): LintBaselineFile {
  const domainIssues = issues.filter((i) => i.domainId === domainId);
  return {
    domainId,
    takenAt: new Date().toISOString(),
    issues: domainIssues.map((i) => issueToBaselineRecord(i, domainId)),
  };
}

export function compareWithBaseline(
  currentIssues: LintIssue[],
  baseline: LintBaselineFile | null,
): LintBaselineComparison {
  const domainId = baseline?.domainId || currentIssues[0]?.domainId || "";

  if (!baseline) {
    return {
      domainId,
      hasBaseline: false,
      takenAt: null,
      totalCurrent: currentIssues.length,
      totalBaseline: 0,
      newIssues: currentIssues,
      fixedIssues: [],
    };
  }

  const baselineMap = new Map<string, LintBaselineIssue>();
  for (const rec of baseline.issues) {
    baselineMap.set(baselineKey(rec), rec);
  }

  const currentKeys = new Set<string>();
  const newIssues: LintIssue[] = [];
  for (const issue of currentIssues) {
    const key = baselineKey({
      ruleId: issue.ruleId,
      entityFqid: issue.entityFqid,
      attributeId: issue.attributeId,
      message: issue.message,
    });
    currentKeys.add(key);
    if (!baselineMap.has(key)) newIssues.push(issue);
  }

  const fixedIssues: LintBaselineIssue[] = [];
  for (const [key, rec] of baselineMap) {
    if (!currentKeys.has(key)) fixedIssues.push(rec);
  }

  return {
    domainId,
    hasBaseline: true,
    takenAt: baseline.takenAt,
    totalCurrent: currentIssues.length,
    totalBaseline: baseline.issues.length,
    newIssues,
    fixedIssues,
  };
}

/**
 * Сводка по всем доменам с baseline. Домены без baseline не считаются
 * в totalNew/totalFixed — для них «новых» нет (не с чем сравнивать).
 */
export function summarizeBaselines(
  allIssues: LintIssue[],
  baselines: Record<string, LintBaselineFile>,
): LintBaselineSummary {
  const byDomainId = new Map<string, LintIssue[]>();
  for (const issue of allIssues) {
    if (!byDomainId.has(issue.domainId)) byDomainId.set(issue.domainId, []);
    byDomainId.get(issue.domainId)!.push(issue);
  }

  const byDomain: LintBaselineSummary["byDomain"] = [];
  let totalNew = 0;
  let totalFixed = 0;
  let domainsWithBaseline = 0;

  for (const [domainId, baseline] of Object.entries(baselines)) {
    domainsWithBaseline++;
    const current = byDomainId.get(domainId) || [];
    const cmp = compareWithBaseline(current, baseline);
    if (cmp.newIssues.length > 0 || cmp.fixedIssues.length > 0) {
      byDomain.push({
        domainId,
        totalCurrent: cmp.totalCurrent,
        totalBaseline: cmp.totalBaseline,
        newCount: cmp.newIssues.length,
        fixedCount: cmp.fixedIssues.length,
      });
    }
    totalNew += cmp.newIssues.length;
    totalFixed += cmp.fixedIssues.length;
  }

  byDomain.sort(
    (a, b) => b.newCount - a.newCount || b.fixedCount - a.fixedCount,
  );

  return {
    domainsWithBaseline,
    totalIssues: allIssues.length,
    totalNew,
    totalFixed,
    byDomain,
  };
}
