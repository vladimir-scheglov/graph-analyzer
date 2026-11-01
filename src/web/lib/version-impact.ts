// src/web/lib/version-impact.ts
import yaml from "js-yaml";
import { buildModelIndex } from "../../core/analyzer/model-builder";
import { computeSemanticDiff } from "../../core/analyzer/semantic-diff";
import type { ModelSnapshot, SemanticDiff } from "../../shared/model-types";
import { createSnapshotFromModelIndex } from "../../core/analyzer/model-snapshot-pure";

export type VersionLevel = "major" | "minor" | "patch";

export interface VersionImpact {
  level: VersionLevel;
  reason: string;
  diff: SemanticDiff;
}

export interface BumpSuggestion {
  current: string; // "0.0.54"
  suggested: string; // "0.1.0" / "1.0.0" / "0.0.55"
  level: VersionLevel;
  reason: string;
}

function parseSemver(v: string): {
  major: number;
  minor: number;
  patch: number;
} | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
  };
}

/**
 * Поднимает SemVer-версию на уровень level.
 * Возвращает null, если v не чистый SemVer (pre-release/build) —
 * в этом случае bump надо делать вручную.
 */
export function bumpVersion(v: string, level: VersionLevel): string | null {
  const p = parseSemver(v);
  if (!p) return null;
  if (level === "major") return `${p.major + 1}.0.0`;
  if (level === "minor") return `${p.major}.${p.minor + 1}.0`;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}

/**
 * Собирает ModelSnapshot из одного YAML-домена. Используется только
 * для вычисления diff между двумя версиями одного файла.
 *
 * Кросс-доменные ссылки (FQID) локально не резолвятся — но они и не
 * участвуют в решении о bump: сущности/атрибуты/типы данных сравниваются
 * в пределах этого домена.
 */
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
 * Есть ли среди changed-атрибутов изменение типа / target-сущности —
 * такие изменения ломают совместимость (данные не мигрируют, ссылки рвутся).
 */
function hasBreakingAttributeChange(diff: SemanticDiff): boolean {
  for (const changed of diff.entities.changed) {
    for (const attr of changed.attributesChanged) {
      if (
        attr.changes.dataType ||
        attr.changes.referenceEntity ||
        attr.changes.itemDataType ||
        attr.changes.itemReferenceEntity
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Классифицирует изменения между двумя YAML-версиями по SemVer-уровню.
 *
 *   MAJOR — удаление сущностей / атрибутов / типов, смена типа атрибута;
 *   MINOR — добавление сущностей / атрибутов / типов / миксинов;
 *   PATCH — всё остальное (constraints, description, name, generic и т.д.).
 *
 * Возвращает null, если YAML не парсится или изменений нет.
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

  const s = diff.stats;

  // ============ MAJOR: удаление / несовместимые изменения ============
  const removals: string[] = [];
  if (s.entitiesRemoved > 0) removals.push(`сущностей: ${s.entitiesRemoved}`);
  if (s.attributesRemoved > 0)
    removals.push(`атрибутов: ${s.attributesRemoved}`);
  if (s.dataTypesRemoved > 0) removals.push(`типов: ${s.dataTypesRemoved}`);

  const breakingAttr = hasBreakingAttributeChange(diff);

  if (removals.length > 0 || breakingAttr) {
    const parts: string[] = [];
    if (removals.length > 0) parts.push(`удалено (${removals.join(", ")})`);
    if (breakingAttr) parts.push("изменён тип атрибута");
    return { level: "major", reason: parts.join("; "), diff };
  }

  // ============ MINOR: добавление ============
  const additions: string[] = [];
  if (s.entitiesAdded > 0) additions.push(`сущностей: ${s.entitiesAdded}`);
  if (s.attributesAdded > 0) additions.push(`атрибутов: ${s.attributesAdded}`);
  if (s.dataTypesAdded > 0) additions.push(`типов: ${s.dataTypesAdded}`);
  if (s.mixinsAdded > 0) additions.push(`миксинов: ${s.mixinsAdded}`);

  if (additions.length > 0) {
    return {
      level: "minor",
      reason: `добавлено (${additions.join(", ")})`,
      diff,
    };
  }

  // ============ PATCH: остальные изменения ============
  const changes: string[] = [];
  if (s.attributesChanged > 0)
    changes.push(`атрибутов: ${s.attributesChanged}`);
  if (s.entitiesChanged > 0) changes.push(`сущностей: ${s.entitiesChanged}`);
  if (s.inheritanceChanged > 0)
    changes.push(`наследования: ${s.inheritanceChanged}`);
  if (s.mixinsRemoved > 0) changes.push(`миксинов: ${s.mixinsRemoved}`);
  if ((s.genericChanged ?? 0) > 0) changes.push(`прочих: ${s.genericChanged}`);
  if ((s.genericAdded ?? 0) > 0) changes.push(`generic+: ${s.genericAdded}`);
  if ((s.genericRemoved ?? 0) > 0)
    changes.push(`generic−: ${s.genericRemoved}`);
  if (s.domainsChanged > 0) changes.push(`метаданных: ${s.domainsChanged}`);

  if (changes.length > 0) {
    return {
      level: "patch",
      reason: `изменено (${changes.join(", ")})`,
      diff,
    };
  }

  return null;
}

/**
 * Возвращает предложение по bump версии, если он уместен.
 * currentVersion должно совпадать с версией в обоих YAML.
 */
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
