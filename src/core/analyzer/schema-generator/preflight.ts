import { cloneDeep } from "./util-clone";
import type { LintIssue } from "../../../shared/lint-types";
import type { ModelIndex } from "../../../shared/model-types";
import type { GeneratedBlock, PreflightResult } from "./types";
import { buildModelIndex } from "../model-builder";
import type { RawDomainEntry } from "../model-builder";
import type { ManifestBlockStatus } from "./types";


export interface ApplyBlock {
  block: GeneratedBlock;
  mode: "append" | "replace";
}

function selectApplyBlocks(
  blocks: GeneratedBlock[],
  manifestStatus: Record<string, ManifestBlockStatus> | undefined,
  replaceModified: boolean,
  restoreOrphanedIds: string[] | undefined,
): ApplyBlock[] {
  const status = manifestStatus ?? {};
  const restore = new Set(restoreOrphanedIds ?? []);

  const viewRootIdsNew = new Set<string>();
  const viewRootIdsOrphaned = new Set<string>();
  for (const b of blocks) {
    if (b.section !== "views" || b.parentViewId) continue;
    const st = status[b.blockId];
    if (st === "new" || st == null) viewRootIdsNew.add(b.payload?.id);
    if (st === "orphaned" && restore.has(b.blockId))
      viewRootIdsOrphaned.add(b.payload?.id);
  }

  const out: ApplyBlock[] = [];
  for (const b of blocks) {
    const st = status[b.blockId];
    if (st === "unchanged") continue;
    if (st === "orphaned" && !restore.has(b.blockId)) continue;
    if (st === "modified" && !replaceModified) continue;

    // child в новом или восстанавливаемом root-view — append, не replace
    if (
      b.parentViewId &&
      (viewRootIdsNew.has(b.parentViewId) ||
        viewRootIdsOrphaned.has(b.parentViewId))
    ) {
      out.push({ block: b, mode: "append" });
      continue;
    }
    out.push({
      block: b,
      mode: st === "outdated" || st === "modified" ? "replace" : "append",
    });
  }
  return out;
}


/**
 * Применить один блок к rawData домена (мутирует target.rawData).
 * Для секций, которые не умеем сливать, бросает — лучше упасть в preflight,
 * чем молча применить битую схему.
 */
export function appendBlockToRaw(
  rawData: any,
  block: GeneratedBlock,
  mode: "append" | "replace" = "append",
): void {
  if (block.section === "menus") {
    if (!block.menuRootId)
      throw new Error(`menus block ${block.blockId} without menuRootId`);
    if (!Array.isArray(rawData.menus)) rawData.menus = [];
    const root = rawData.menus.find((m: any) => m?.id === block.menuRootId);
    if (!root) throw new Error(`root_group ${block.menuRootId} not found`);
    if (!Array.isArray(root.items)) root.items = [];
    const idx = root.items.findIndex((it: any) => it?.id === block.payload.id);
    if (idx >= 0) {
      if (mode === "replace") root.items[idx] = block.payload;
      return;
    }
    root.items.push(block.payload);
    return;
  }

  if (block.section === "views") {
    if (!Array.isArray(rawData.views)) rawData.views = [];
    const parentViewId = block.parentViewId;
    if (!parentViewId) {
      const idx = rawData.views.findIndex(
        (v: any) => v?.id === block.payload.id,
      );
      if (idx >= 0) {
        if (mode === "replace") rawData.views[idx] = block.payload;
        return;
      }
      rawData.views.push(block.payload);
      return;
    }
    const parent = rawData.views.find((v: any) => v?.id === parentViewId);
    if (!parent) {
      console.warn(
        `[preflight] skip ${block.blockId}: parent view ${parentViewId} not in merged raw`,
      );
      return;
    }
    const kind = block.blockId.split(":")[0];
    const targetKey =
      kind === "widget"
        ? "widgets"
        : kind === "group"
          ? "groups"
          : kind === "view"
            ? "views"
            : null;
    if (!targetKey) throw new Error(`unknown views block kind: ${kind}`);
    if (!Array.isArray(parent[targetKey])) parent[targetKey] = [];
    const idx = parent[targetKey].findIndex(
      (x: any) => x?.id === block.payload.id,
    );
    if (idx >= 0) {
      if (mode === "replace") parent[targetKey][idx] = block.payload;
      return;
    }
    parent[targetKey].push(block.payload);
    return;
  }

  if (!Array.isArray(rawData[block.section])) rawData[block.section] = [];
  const arr = rawData[block.section];
  const idx = arr.findIndex((x: any) => x?.id === block.payload.id);
  if (idx >= 0) {
    if (mode === "replace") arr[idx] = block.payload;
    return;
  }
  arr.push(block.payload);
}

/**
 * Применяет все блоки к копии rawData домена.
 * Возвращает НОВЫЙ массив всех доменов — с одним изменённым.
 */
function mergeBlocksIntoRawDomains(
  allDomains: RawDomainEntry[],
  targetDomainId: string,
  applyBlocks: ApplyBlock[],
): RawDomainEntry[] {
  return allDomains.map((d) => {
    if (d.id !== targetDomainId) return d;
    const cloned = cloneDeep(d);
    for (const { block, mode } of applyBlocks) {
      appendBlockToRaw(cloned.rawData, block, mode);
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
  manifestStatus?: Record<string, ManifestBlockStatus>,
  replaceModified = false,
  restoreOrphanedIds?: string[],
  beforeIndex?: ModelIndex,
): PreflightResult {
  const startedAt = Date.now();

  // Переиспользуем готовый beforeIndex из batch, чтобы не строить 100 раз
  const before = beforeIndex ?? buildModelIndex(allDomains);

  const applyBlocks = selectApplyBlocks(
    blocks,
    manifestStatus,
    replaceModified,
    restoreOrphanedIds,
  );
  const mergedDomains = mergeBlocksIntoRawDomains(
    allDomains,
    targetDomainId,
    applyBlocks,
  );
  const afterIndex = buildModelIndex(mergedDomains);

  const beforeIssues = before.lint.lintReport.issues.filter(
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
