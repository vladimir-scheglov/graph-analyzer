import type { YamlDocument } from "../../yaml/document";

export interface MetadataSnapshot {
  id: string;
  type: string;
  version: string;
  name: string;
  description?: string;
  author?: string;
  status?: string;
  date?: string;
  tags?: string[];
}

const METADATA_FIELDS = [
  "id",
  "type",
  "version",
  "name",
  "description",
  "author",
  "status",
  "date",
  "tags",
] as const;

export function readMetadata(doc: YamlDocument): MetadataSnapshot {
  return {
    id: String(doc.get(["id"]) ?? ""),
    type: String(doc.get(["type"]) ?? "domain"),
    version: String(doc.get(["version"]) ?? ""),
    name: String(doc.get(["name"]) ?? ""),
    description: doc.get<string>(["description"]),
    author: doc.get<string>(["author"]),
    status: doc.get<string>(["status"]),
    date: doc.get<string>(["date"]),
    tags: doc.get<string[]>(["tags"]),
  };
}

export function updateMetadataField(
  doc: YamlDocument,
  field: (typeof METADATA_FIELDS)[number],
  value: unknown,
): void {
  // Для верхнеуровневых полей — плоский путь
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn([field] as any);
  } else {
    doc.set([field], value);
  }
}

// ============ Валидация ============

const FQDN_RE =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

/** FQDN: минимум одна точка, буквы/цифры/дефисы, без пробелов. */
export function validateDomainId(id: string): string | null {
  if (!id) return "ID домена обязателен";
  if (id.length > 253) return "Не более 253 символов";
  if (!FQDN_RE.test(id)) {
    return "FQDN: латиница, цифры, дефисы, минимум одна точка (например: iocs.test)";
  }
  return null;
}

/** Semantic Versioning: 1.0.0, 0.0.1, 1.2.3-beta.1 и т.п. */
const SEMVER_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$/;

export function validateVersion(v: string): string | null {
  if (!v) return "Версия обязательна";
  if (!SEMVER_RE.test(v)) {
    return "Формат Semantic Versioning: MAJOR.MINOR.PATCH (например: 1.0.0)";
  }
  return null;
}

/** Name: без пробелов, латиница/кириллица/цифры/точки/подчёркивания/дефисы. */
const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9._-]+$/;

export function validateName(name: string): string | null {
  if (!name) return "Название обязательно";
  if (name.length > 255) return "Не более 255 символов";
  if (!NAME_RE.test(name)) {
    return "Без пробелов; допустимы буквы, цифры, точки, подчёркивания, дефисы";
  }
  return null;
}

export function validateTags(tags: string[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i].trim();
    if (!t) {
      errors.push(`Тег #${i + 1} пустой`);
      continue;
    }
    if (t.length > 63) {
      errors.push(`Тег #${i + 1} длиннее 63 символов`);
    }
    if (seen.has(t)) {
      errors.push(`Дубликат тега: ${t}`);
    }
    seen.add(t);
  }
  return errors;
}
