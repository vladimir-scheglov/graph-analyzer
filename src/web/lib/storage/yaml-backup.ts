// src/web/lib/storage/yaml-backup.ts
import { idbDelete, idbGet, idbGetAll, idbPut } from "./idb";

const STORE = "yaml-backups";
const LEGACY_PREFIX = "dg-yaml-backup:";

export interface YamlBackupRecord {
  filePath: string;
  content: string;
  savedContentHash: string;
  savedAt: number;
}

/**
 * API для бэкапа редактируемого YAML.
 * Заменяет прежний `sessionStorage.setItem('dg-yaml-backup:...')`.
 *
 * Прозрачно мигрирует старые записи из sessionStorage при первом обращении.
 * Все методы идемпотентны и сериализуются внутри IDB (last-write-wins).
 */
export const yamlBackups = {
  async get(filePath: string): Promise<YamlBackupRecord | null> {
    const fromIdb = await idbGet<YamlBackupRecord>(STORE, filePath);
    if (fromIdb) return fromIdb;
    return migrateFromSessionStorage(filePath);
  },

  async put(record: YamlBackupRecord): Promise<void> {
    await idbPut(STORE, record);
  },

  async delete(filePath: string): Promise<void> {
    await idbDelete(STORE, filePath);
    // На случай, если миграция не успела — подчищаем legacy
    try {
      sessionStorage.removeItem(LEGACY_PREFIX + filePath);
    } catch {
      /* ignore */
    }
  },

  async has(filePath: string): Promise<boolean> {
    return (await this.get(filePath)) !== null;
  },

  /**
   * Удаляет старые бэкапы. Раньше этим занимался сам браузер (sessionStorage
   * чистился при закрытии вкладки). С IDB бэкапы переживают перезапуск,
   * поэтому нужен явный TTL, иначе мусор копится.
   *
   * Вызывать один раз при старте приложения.
   */
  async cleanup(maxAgeDays = 30): Promise<number> {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const all = await idbGetAll<YamlBackupRecord>(STORE);
    let removed = 0;
    for (const rec of all) {
      if (rec.savedAt < cutoff) {
        await idbDelete(STORE, rec.filePath);
        removed++;
      }
    }
    return removed;
  },
};

async function migrateFromSessionStorage(
  filePath: string,
): Promise<YamlBackupRecord | null> {
  const key = LEGACY_PREFIX + filePath;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.content !== "string" ||
      typeof parsed?.savedContentHash !== "string" ||
      typeof parsed?.savedAt !== "number"
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    const record: YamlBackupRecord = {
      filePath,
      content: parsed.content,
      savedContentHash: parsed.savedContentHash,
      savedAt: parsed.savedAt,
    };
    await idbPut(STORE, record);
    sessionStorage.removeItem(key);
    return record;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}
