import type { SemanticDiff, ModelIndex } from "../../../shared/model-types";

export type SemVerBump = "major" | "minor" | "patch";

export interface ChangelogEntry {
  kind: "breaking" | "feature" | "fix";
  text: string;
  domainId?: string;
  entityId?: string;
}

export interface ChangelogBlock {
  title: string;
  entries: ChangelogEntry[];
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

export function isValidSemVer(v: string): boolean {
  return SEMVER_RE.test(v);
}

export function parseSemVer(
  v: string,
): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
} | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z-.]+)?/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    prerelease: m[4] ? m[4].slice(1) : null,
  };
}

export function compareSemVer(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

export interface DiffBumpClassification {
  level: SemVerBump;
  reason: string;
}

/**
 * Единое правило классификации SemVer-bump по SemanticDiff.
 * Используется:
 *   - suggestBump(diff)                         — только уровень
 *   - computeVersionImpact(...)                — уровень + reason для диалога
 *
 * MAJOR: удаление сущностей/атрибутов/типов/доменов, смена dataType /
 *        itemDataType / referenceEntity / itemReferenceEntity / inherits;
 * MINOR: добавление сущностей/атрибутов/типов/миксинов/доменов;
 * PATCH: прочие изменения (constraints, description, name, generic и т.д.).
 *
 * Возвращает null, если изменений нет.
 */
export function classifyDiffForBump(
  diff: SemanticDiff,
): DiffBumpClassification | null {
  const s = diff.stats;

  // ── MAJOR: удаление ──
  const removals: string[] = [];
  if (s.entitiesRemoved > 0) removals.push(`сущностей: ${s.entitiesRemoved}`);
  if (s.attributesRemoved > 0)
    removals.push(`атрибутов: ${s.attributesRemoved}`);
  if (s.dataTypesRemoved > 0) removals.push(`типов: ${s.dataTypesRemoved}`);
  if (s.domainsRemoved > 0) removals.push(`доменов: ${s.domainsRemoved}`);

  // ── MAJOR: несовместимые изменения атрибутов / наследования ──
  const breaking: string[] = [];
  for (const c of diff.entities.changed) {
    for (const a of c.attributesChanged) {
      if (a.changes.dataType) breaking.push(`${c.entityId}.${a.id}.dataType`);
      if (a.changes.itemDataType)
        breaking.push(`${c.entityId}.${a.id}.itemDataType`);
      if (a.changes.referenceEntity)
        breaking.push(`${c.entityId}.${a.id}.referenceEntity`);
      if (a.changes.itemReferenceEntity)
        breaking.push(`${c.entityId}.${a.id}.itemReferenceEntity`);
    }
    if (c.inheritsChange) breaking.push(`${c.entityId}.inherits`);
  }

  if (removals.length > 0 || breaking.length > 0) {
    const parts: string[] = [];
    if (removals.length > 0) parts.push(`удалено (${removals.join(", ")})`);
    if (breaking.length > 0) {
      const head = breaking.slice(0, 3).join(", ");
      const suffix =
        breaking.length > 3 ? `, …и ещё ${breaking.length - 3}` : "";
      parts.push(`несовместимо изменено (${head}${suffix})`);
    }
    return { level: "major", reason: parts.join("; ") };
  }

  // ── MINOR: добавление ──
  const additions: string[] = [];
  if (s.entitiesAdded > 0) additions.push(`сущностей: ${s.entitiesAdded}`);
  if (s.attributesAdded > 0) additions.push(`атрибутов: ${s.attributesAdded}`);
  if (s.dataTypesAdded > 0) additions.push(`типов: ${s.dataTypesAdded}`);
  if (s.mixinsAdded > 0) additions.push(`миксинов: ${s.mixinsAdded}`);
  if (s.domainsAdded > 0) additions.push(`доменов: ${s.domainsAdded}`);

  if (additions.length > 0) {
    return { level: "minor", reason: `добавлено (${additions.join(", ")})` };
  }

  // ── PATCH: остальное ──
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
    return { level: "patch", reason: `изменено (${changes.join(", ")})` };
  }

  return null;
}

/**
 * Рекомендованный уровень bump'а. Всегда что-то возвращает —
 * если изменений нет, "patch" (совместимо с прежним контрактом).
 */
export function suggestBump(diff: SemanticDiff): SemVerBump {
  return classifyDiffForBump(diff)?.level ?? "patch";
}

export function applyBump(version: string, bump: SemVerBump): string | null {
  const p = parseSemVer(version);
  if (!p) return null;
  if (bump === "major") return `${p.major + 1}.0.0`;
  if (bump === "minor") return `${p.major}.${p.minor + 1}.0`;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}

/** Генерирует CHANGELOG-блоки из SemanticDiff. */
export function buildChangelogBlocks(diff: SemanticDiff): ChangelogBlock[] {
  const breaking: ChangelogEntry[] = [];
  const features: ChangelogEntry[] = [];
  const fixes: ChangelogEntry[] = [];

  // Domains
  for (const d of diff.domains.added) {
    features.push({
      kind: "feature",
      text: `Добавлен домен ${d.domainId}`,
      domainId: d.domainId,
    });
  }
  for (const d of diff.domains.removed) {
    breaking.push({
      kind: "breaking",
      text: `Удалён домен ${d.domainId}`,
      domainId: d.domainId,
    });
  }
  for (const d of diff.domains.changed) {
    for (const ch of d.changes) {
      if (ch.field === "version") continue;
      fixes.push({
        kind: "fix",
        text: `${d.domainId}: ${ch.field} → ${String(ch.to)}`,
        domainId: d.domainId,
      });
    }
  }

  // Entities
  for (const e of diff.entities.added) {
    features.push({
      kind: "feature",
      text: `Добавлена сущность ${e.entityId}`,
      domainId: e.domainId,
      entityId: e.entityId,
    });
  }
  for (const e of diff.entities.removed) {
    breaking.push({
      kind: "breaking",
      text: `Удалена сущность ${e.entityId}`,
      domainId: e.domainId,
      entityId: e.entityId,
    });
  }
  for (const c of diff.entities.changed) {
    if (c.inheritsChange) {
      breaking.push({
        kind: "breaking",
        text: `${c.entityId}: inherits ${c.inheritsChange.from ?? "—"} → ${c.inheritsChange.to ?? "—"}`,
        domainId: c.domainId,
        entityId: c.entityId,
      });
    }
    if (c.nameChange) {
      fixes.push({
        kind: "fix",
        text: `${c.entityId}: переименовано «${c.nameChange.from}» → «${c.nameChange.to}»`,
        domainId: c.domainId,
        entityId: c.entityId,
      });
    }
    for (const a of c.attributesAdded) {
      features.push({
        kind: "feature",
        text: `${c.entityId}.${a.id}: добавлен атрибут (${a.dataType})`,
        domainId: c.domainId,
        entityId: c.entityId,
      });
    }
    for (const a of c.attributesRemoved) {
      breaking.push({
        kind: "breaking",
        text: `${c.entityId}.${a.id}: удалён атрибут (${a.dataType})`,
        domainId: c.domainId,
        entityId: c.entityId,
      });
    }
    for (const ac of c.attributesChanged) {
      const fields = Object.keys(ac.changes);
      const isBreaking = fields.some(
        (f) =>
          f === "dataType" ||
          f === "referenceEntity" ||
          f === "itemReferenceEntity",
      );
      const text = `${c.entityId}.${ac.id}: ${fields.join(", ")}`;
      if (isBreaking)
        breaking.push({
          kind: "breaking",
          text,
          domainId: c.domainId,
          entityId: c.entityId,
        });
      else
        fixes.push({
          kind: "fix",
          text,
          domainId: c.domainId,
          entityId: c.entityId,
        });
    }
  }

  // DataTypes
  for (const d of diff.dataTypes.added) {
    features.push({
      kind: "feature",
      text: `Добавлен тип ${d.id} (${d.kind})`,
      domainId: d.domainId,
    });
  }
  for (const d of diff.dataTypes.removed) {
    breaking.push({
      kind: "breaking",
      text: `Удалён тип ${d.id} (${d.kind})`,
      domainId: d.domainId,
    });
  }

  // Mixins
  for (const m of diff.mixins.added) {
    features.push({
      kind: "feature",
      text: `Добавлен миксин ${m.id} → ${m.targetEntityFqid}`,
      domainId: m.domainId,
    });
  }
  for (const m of diff.mixins.removed) {
    fixes.push({
      kind: "fix",
      text: `Удалён миксин ${m.id}`,
      domainId: m.domainId,
    });
  }

  // Generic sections
  if (diff.genericSections) {
    for (const [section, d] of Object.entries(diff.genericSections)) {
      for (const e of d.added) {
        features.push({
          kind: "feature",
          text: `${section}: добавлено ${e.id}`,
          domainId: e.domainId,
        });
      }
      for (const e of d.removed) {
        fixes.push({
          kind: "fix",
          text: `${section}: удалено ${e.id}`,
          domainId: e.domainId,
        });
      }
    }
  }

  const blocks: ChangelogBlock[] = [];
  if (breaking.length > 0)
    blocks.push({ title: "⚠️ Breaking changes", entries: breaking });
  if (features.length > 0)
    blocks.push({ title: "✨ Новые возможности", entries: features });
  if (fixes.length > 0)
    blocks.push({ title: "🔧 Прочие изменения", entries: fixes });
  return blocks;
}

/** Markdown-формат для CHANGELOG.md. */
export function buildChangelogMarkdown(
  blocks: ChangelogBlock[],
  opts: {
    version: string;
    previousVersion: string;
    takenAt: string;
    server?: string;
  },
): string {
  const lines: string[] = [];
  lines.push(`# CHANGELOG`);
  lines.push("");
  lines.push(
    `## [${opts.version}] — ${opts.takenAt}${opts.server ? ` @ ${opts.server}` : ""}`,
  );
  lines.push("");
  if (opts.previousVersion && opts.previousVersion !== opts.version) {
    lines.push(`_Предыдущая версия: ${opts.previousVersion}_`);
    lines.push("");
  }
  if (blocks.length === 0) {
    lines.push("_Изменений нет._");
    return lines.join("\n");
  }
  for (const b of blocks) {
    lines.push(`### ${b.title}`);
    lines.push("");
    for (const e of b.entries) {
      const prefix = e.domainId ? `**\`${e.domainId}\`** — ` : "";
      lines.push(`- ${prefix}${e.text}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
