import fs from "fs";
import path from "path";
import type {
  ModelIndex,
  ModelSnapshot,
  SnapshotEntity,
  SnapshotAttribute,
  SnapshotMixin,
  SnapshotDataType,
  SnapshotSequence,
  SnapshotDomain,
  SemanticDiff,
  GenericSnapshotEntry,
} from "../../shared/model-types";
import { computeSemanticDiff } from "./semantic-diff";

/**
 * Путь к файлу состояния модели.
 * Лежит ВНЕ cacheDir (в .cache/models/), чтобы refresh его не сносил.
 */
export function getModelSnapshotPath(cacheDir: string): string {
  const cleanDir = cacheDir.replace(/[\\/]+$/, "");
  const parts = cleanDir.split(path.sep);

  const domainsIdx = parts.indexOf("domains");
  if (domainsIdx > 0 && parts[domainsIdx - 1] === ".cache") {
    const hash = parts[parts.length - 1];
    const cacheRoot = parts.slice(0, domainsIdx - 1).join(path.sep);
    return path.join(cacheRoot, ".cache", "models", hash + ".json");
  }

  return path.join(cleanDir, ".model-snapshot.json");
}

export function createSnapshotFromModelIndex(index: ModelIndex): ModelSnapshot {
  return {
    generatedAt: index.generatedAt,
    domains: index.domains.map<SnapshotDomain>((d) => ({
      id: d.id,
      name: d.name,
      version: d.version,
      author: d.author,
      tags: [...d.tags].sort(),
      description: d.description,
    })),
    entities: index.entities.map<SnapshotEntity>((e) => ({
      fqid: e.fqid,
      name: e.name,
      inherits: e.inherits,
      attributes: e.attributes.map<SnapshotAttribute>((a) => ({
        id: a.id,
        name: a.name,
        dataType: a.dataType,
        referenceEntity: a.referenceEntity,
        itemDataType: a.itemDataType,
        itemReferenceEntity: a.itemReferenceEntity,
        constraints: a.constraints,
      })),
    })),
    mixins: index.mixins.map<SnapshotMixin>((m) => ({
      id: m.id,
      domainId: m.domainId,
      targetEntityFqid: m.targetEntityFqid,
      addedTabs: m.addedTabs,
    })),
    dataTypes: index.dataTypes.map<SnapshotDataType>((d) => ({
      id: d.id,
      domainId: d.domainId,
      kind: d.kind,
      valuesCount: d.valuesCount,
    })),
    sequences: index.sequences.map<SnapshotSequence>((s) => ({
      id: s.id,
      domainId: s.domainId,
    })),
    // Копируем явно, чтобы diff видел новые/изменённые секции.
    genericSections:
      index.genericSections && Object.keys(index.genericSections).length > 0
        ? index.genericSections
        : undefined,
  };
}

// ============ Внутреннее хранилище ============

interface StoredModelState {
  snapshot: ModelSnapshot;
  lastDiff: SemanticDiff | null;
}

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(p: string, data: unknown): void {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  } catch (err: any) {
    console.warn(`[model-snapshot] не удалось записать ${p}: ${err.message}`);
  }
}

function hasAnyChanges(d: SemanticDiff): boolean {
  const s = d.stats;
  const base =
    s.entitiesRemoved +
    s.entitiesChanged +
    s.attributesAdded +
    s.attributesRemoved +
    s.attributesChanged +
    s.inheritanceChanged +
    s.mixinsAdded +
    s.mixinsRemoved +
    s.dataTypesAdded +
    s.dataTypesRemoved +
    s.domainsAdded +
    s.domainsRemoved +
    s.domainsChanged;
  if (base > 0) return true;
  const g =
    (s.genericAdded ?? 0) + (s.genericRemoved ?? 0) + (s.genericChanged ?? 0);
  return g > 0;
}

// ============ Публичное API ============

export interface ModelSnapshotResult {
  /** Свежий diff между сохранённым snapshot и текущим состоянием. */
  freshDiff: SemanticDiff | null;
  /** Что показывать в UI: свежий diff, если он непустой, иначе — сохранённый lastDiff. */
  effectiveDiff: SemanticDiff | null;
  /** true — снапшот ещё не был создан. */
  isFirstRun: boolean;
  /** true — в этом запуске обнаружены изменения. */
  hasChanges: boolean;
}

/**
 * Основная логика работы с состоянием модели.
 *
 *  1. Читаем сохранённое состояние (snapshot + lastDiff).
 *  2. Считаем свежий diff между сохранённым snapshot и текущим состоянием.
 *  3. Если свежий diff непустой — обновляем snapshot и lastDiff в файле.
 *  4. Если пустой — файл НЕ трогаем, а показываем сохранённый lastDiff.
 *
 * Поведение на разных запусках:
 *
 *  • Первый запуск: snapshot сохраняется, lastDiff = null, показываем пустой экран.
 *  • Refresh с изменениями: snapshot и lastDiff обновляются, показывается новый diff.
 *  • Обычный запуск после refresh: свежий diff пустой, показывается старый lastDiff.
 *  • Обычный запуск после локальных правок: свежий diff непустой, обновляем.
 */
export function updateModelSnapshot(
  cacheDir: string,
  currentSnapshot: ModelSnapshot,
): ModelSnapshotResult {
  const snapPath = getModelSnapshotPath(cacheDir);
  const stored = readJson<StoredModelState>(snapPath);

  // Первый запуск
  if (!stored || !stored.snapshot) {
    writeJson(snapPath, { snapshot: currentSnapshot, lastDiff: null });
    return {
      freshDiff: null,
      effectiveDiff: null,
      isFirstRun: true,
      hasChanges: false,
    };
  }

  const freshDiff = computeSemanticDiff(stored.snapshot, currentSnapshot);
  const hasChanges = hasAnyChanges(freshDiff);

  if (hasChanges) {
    writeJson(snapPath, { snapshot: currentSnapshot, lastDiff: freshDiff });
    return {
      freshDiff,
      effectiveDiff: freshDiff,
      isFirstRun: false,
      hasChanges: true,
    };
  }

  // Ничего не изменилось — файл не трогаем, показываем прошлый diff
  return {
    freshDiff,
    effectiveDiff: stored.lastDiff,
    isFirstRun: false,
    hasChanges: false,
  };
}
