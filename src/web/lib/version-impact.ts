import yaml from "js-yaml";
import { buildModelIndex } from "../../core/analyzer/model-builder";
import { computeSemanticDiff } from "../../core/analyzer/semantic-diff";
import type { ModelSnapshot, SemanticDiff } from "../../shared/model-types";
import { createSnapshotFromModelIndex } from "../../core/analyzer/model-snapshot-pure";
import { classifyDiffForBump } from "./model/changelog";

export type VersionLevel = "major" | "minor" | "patch";

export interface VersionImpact {
  level: VersionLevel;
  reason: string;
  diff: SemanticDiff;
}

export interface BumpSuggestion {
  current: string;
  suggested: string;
  level: VersionLevel;
  reason: string;
}

function parseSemver(
  v: string,
): { major: number; minor: number; patch: number } | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
  };
}

export function bumpVersion(v: string, level: VersionLevel): string | null {
  const p = parseSemver(v);
  if (!p) return null;
  if (level === "major") return `${p.major + 1}.0.0`;
  if (level === "minor") return `${p.major}.${p.minor + 1}.0`;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}

function buildSnapshotFromYaml(domainId: string, rawData: any): ModelSnapshot {
  const rawDomains = [
    {
      id: domainId,
      name: rawData?.name || domainId,
      version: rawData?.version || "",
      author: rawData?.author || "",
      tags: Array.isArray(rawData?.tags) ? rawData.tags : [],
      rawData,
    },
  ];
  const index = buildModelIndex(rawDomains);
  return createSnapshotFromModelIndex(index);
}

/**
 * Классифицирует изменения между двумя YAML-версиями. Использует единое
 * правило `classifyDiffForBump` (то же, что и `suggestBump` в changelog.ts) —
 * поэтому CHANGELOG-модалка и диалог bump на публикации дают одинаковую
 * рекомендацию. Возвращает null, если YAML не парсится или изменений нет.
 */
export function computeVersionImpact(
  oldYaml: string,
  newYaml: string,
  domainId: string | null,
): VersionImpact | null {
  let oldData: any;
  let newData: any;
  try {
    oldData = (yaml.load(oldYaml) as any) || {};
    newData = (yaml.load(newYaml) as any) || {};
  } catch {
    return null;
  }

  const effDomainId =
    domainId ||
    String(newData.id || oldData.id || "").toLowerCase() ||
    "unknown";

  let diff: SemanticDiff;
  try {
    const oldSnap = buildSnapshotFromYaml(effDomainId, oldData);
    const newSnap = buildSnapshotFromYaml(effDomainId, newData);
    diff = computeSemanticDiff(oldSnap, newSnap);
  } catch {
    return null;
  }

  const classification = classifyDiffForBump(diff);
  if (!classification) return null;

  return {
    level: classification.level,
    reason: classification.reason,
    diff,
  };
}

export function suggestVersionBump(
  currentVersion: string,
  oldYaml: string,
  newYaml: string,
  domainId: string | null,
): BumpSuggestion | null {
  const impact = computeVersionImpact(oldYaml, newYaml, domainId);
  if (!impact) return null;

  const suggested = bumpVersion(currentVersion, impact.level);
  if (!suggested) return null;

  return {
    current: currentVersion,
    suggested,
    level: impact.level,
    reason: impact.reason,
  };
}
