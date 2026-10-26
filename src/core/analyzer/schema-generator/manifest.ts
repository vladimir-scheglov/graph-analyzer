import fs from "fs";
import path from "path";

export interface ManifestBlockEntry {
  /** FNV-1a hex от payload на момент генерации. */
  hash: string;
  title: string;
  parentViewId?: string;
  generatedAt?: string;
}

export interface EntityManifest {
  profile: string;
  generatedAt: string;
  blocks: Record<string, ManifestBlockEntry>;
}

export interface DomainManifest {
  entities: Record<string, EntityManifest>;
}

export interface GeneratedManifest {
  version: 1;
  domains: Record<string, DomainManifest>;
}

const MANIFEST_FILE = "_generated.json";

function manifestPath(rootDir: string): string {
  return path.join(rootDir, MANIFEST_FILE);
}

export function loadGeneratedManifest(rootDir: string): GeneratedManifest {
  try {
    const p = manifestPath(rootDir);
    if (!fs.existsSync(p)) return { version: 1, domains: {} };
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!data || data.version !== 1 || typeof data.domains !== "object") {
      return { version: 1, domains: {} };
    }
    return data as GeneratedManifest;
  } catch {
    return { version: 1, domains: {} };
  }
}

export interface MergeGeneratedManifestInput {
  domainId: string;
  entityId: string;
  profile: string;
  blocks: Array<{
    blockId: string;
    hash: string;
    title: string;
    parentViewId?: string;
  }>;
  /**
   * blockId, которые были в манифесте, но которых больше нет в YAML.
   * Удаляются из записи entity.
   */
  orphanedIds?: string[];
}

/**
 * Merge semantics:
 *  - добавляем/обновляем записи для `input.blocks`;
 *  - записи из манифеста, которых нет в `input.blocks`, **сохраняем** как
 *    «orphaned» — при следующем открытии UI покажет «был сгенерирован, но
 *    удалён из YAML»;
 *  - пустой `blocks` — удаляем запись entity целиком (пользователь удалил всё).
 *
 * Атомарная запись: tmp + rename.
 */
export function mergeGeneratedManifest(
  rootDir: string,
  input: MergeGeneratedManifestInput,
): void {
  const manifest = loadGeneratedManifest(rootDir);
  if (!manifest.domains[input.domainId]) {
    manifest.domains[input.domainId] = { entities: {} };
  }
  const domain = manifest.domains[input.domainId];

  const existing = domain.entities[input.entityId];
  const mergedBlocks: Record<string, ManifestBlockEntry> = {
    ...(existing?.blocks ?? {}),
  };

  const now = new Date().toISOString();
  for (const b of input.blocks) {
    mergedBlocks[b.blockId] = {
      hash: b.hash,
      title: b.title,
      parentViewId: b.parentViewId,
      generatedAt: now,
    };
  }

  // cleanup orphaned
  if (Array.isArray(input.orphanedIds)) {
    for (const id of input.orphanedIds) {
      delete mergedBlocks[id];
    }
  }

  if (Object.keys(mergedBlocks).length === 0) {
    delete domain.entities[input.entityId];
  } else {
    domain.entities[input.entityId] = {
      profile: input.profile,
      generatedAt: now,
      blocks: mergedBlocks,
    };
  }

  const p = manifestPath(rootDir);
  const tmp = p + ".tmp";
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), "utf8");
  fs.renameSync(tmp, p);
}
