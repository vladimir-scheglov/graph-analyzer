import { cloneDeep } from "./util-clone";
import type { LintIssue } from "../../../shared/lint-types";
import type { ModelIndex } from "../../../shared/model-types";
import type { GeneratedBlock, PreflightResult } from "./types";
import { buildModelIndex } from "../model-builder";
import type { RawDomainEntry } from "../model-builder";

/**
 * Применить один блок к rawData домена (мутирует target.rawData).
 * Для секций, которые не умеем сливать, бросает — лучше упасть в preflight,
 * чем молча применить битую схему.
 */
export function appendBlockToRaw(rawData: any, block: GeneratedBlock): void {
  if (block.section === "menus") {
    if (!block.menuRootId) {
      throw new Error(`menus block ${block.blockId} without menuRootId`);
    }
    if (!Array.isArray(rawData.menus)) rawData.menus = [];
    const root = rawData.menus.find((m: any) => m?.id === block.menuRootId);
    if (!root) throw new Error(`root_group ${block.menuRootId} not found`);
    if (!Array.isArray(root.items)) root.items = [];
    root.items.push(block.payload);
    return;
  }
  if (!Array.isArray(rawData[block.section])) {
    rawData[block.section] = [];
  }
  rawData[block.section].push(block.payload);
}

/**
 * Применяет все блоки к копии rawData домена.
 * Возвращает НОВЫЙ массив всех доменов — с одним изменённым.
 */
function mergeBlocksIntoRawDomains(
  allDomains: RawDomainEntry[],
  targetDomainId: string,
  blocks: GeneratedBlock[],
): RawDomainEntry[] {
  return allDomains.map((d) => {
    if (d.id !== targetDomainId) return d;
    const cloned = cloneDeep(d);
    for (const b of blocks) {
      appendBlockToRaw(cloned.rawData, b);
    }
    return cloned;
  });
}

function issueKey(issue: LintIssue): string {
  // Все поля, которые могут отличить одну issue от другой.
  // Без этого preflight не отличит «уже была» от «появилась новая».
  return [
    issue.ruleId,
    issue.domainId,
    issue.entityFqid ?? "",
    issue.attributeId ?? "",
    issue.propertyPath ?? "",
    issue.message,
  ].join("\u0000");
}

function diffIssues(
  before: LintIssue[],
  after: LintIssue[],
): { newIssues: LintIssue[]; fixedIssues: LintIssue[] } {
  const beforeSet = new Set(before.map(issueKey));
  const afterSet = new Set(after.map(issueKey));

  return {
    newIssues: after.filter((i) => !beforeSet.has(issueKey(i))),
    fixedIssues: before.filter((i) => !afterSet.has(issueKey(i))),
  };
}

/**
 * Прогоняет линтер дважды — на текущем и на «+ сгенерированные блоки» —
 * и возвращает diff.
 *
 * Внимание: `allDomains` — это ВСЕ домены кэша, не только целевой.
 * Cross-domain правила (FQID-ссылки) должны резолвиться так же,
 * как в реальном прогоне.
 */
export function runPreflight(
  allDomains: RawDomainEntry[],
  targetDomainId: string,
  blocks: GeneratedBlock[],
): PreflightResult {
  const startedAt = Date.now();

  const beforeIndex: ModelIndex = buildModelIndex(allDomains);
  const mergedDomains = mergeBlocksIntoRawDomains(
    allDomains,
    targetDomainId,
    blocks,
  );
  const afterIndex: ModelIndex = buildModelIndex(mergedDomains);

  const beforeIssues = beforeIndex.lint.lintReport.issues.filter(
    (i) => i.domainId === targetDomainId,
  );
  const afterIssues = afterIndex.lint.lintReport.issues.filter(
    (i) => i.domainId === targetDomainId,
  );

  const { newIssues, fixedIssues } = diffIssues(beforeIssues, afterIssues);

  return {
    newIssues,
    fixedIssues,
    conflicts: [],
    elapsedMs: Date.now() - startedAt,
  };
}
