import type {
  EntityRecord,
  AttributeRecord,
  DataTypeRecord,
  ModelIndex,
} from "../../../shared/model-types";

export interface GlossaryEntryEntity {
  kind: "entity";
  fqid: string;
  name: string;
  /** Первая буква для указателя. */
  letter: string;
  entity: EntityRecord;
}

export interface GlossaryEntryAttribute {
  kind: "attribute";
  key: string;
  name: string;
  letter: string;
  attribute: AttributeRecord;
  entity: EntityRecord;
}

export interface GlossaryEntryDataType {
  kind: "dataType";
  key: string;
  name: string;
  letter: string;
  dataType: DataTypeRecord;
}

export type GlossaryEntry =
  | GlossaryEntryEntity
  | GlossaryEntryAttribute
  | GlossaryEntryDataType;

export interface GlossarySection {
  letter: string;
  entries: GlossaryEntry[];
}

function firstLetter(s: string): string {
  const ch = (s || "").trim().charAt(0).toUpperCase();
  return /[A-ZА-ЯЁ]/.test(ch) ? ch : "#";
}

/**
 * Собирает алфавитный указатель сущностей.
 */
export function buildEntityGlossary(index: ModelIndex): GlossarySection[] {
  const entries: GlossaryEntryEntity[] = index.entities.map((e) => ({
    kind: "entity",
    fqid: e.fqid,
    name: e.name || e.entityId,
    letter: firstLetter(e.name || e.entityId),
    entity: e,
  }));

  return groupByLetter(entries);
}

/**
 * Собирает алфавитный указатель атрибутов (по отображаемому name).
 */
export function buildAttributeGlossary(index: ModelIndex): GlossarySection[] {
  const entries: GlossaryEntryAttribute[] = [];

  index.entities.forEach((e) => {
    e.attributes.forEach((a) => {
      entries.push({
        kind: "attribute",
        key: `${e.fqid}#${a.id}`,
        name: a.name || a.id,
        letter: firstLetter(a.name || a.id),
        attribute: a,
        entity: e,
      });
    });
  });

  // Дедупликация: если одинаковое name+dataType в одной сущности — оставим одно
  // (маловероятно, но на всякий случай)
  const seen = new Set<string>();
  const filtered = entries.filter((e) => {
    const key = `${e.entity.fqid}#${e.attribute.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return groupByLetter(filtered);
}

/**
 * Собирает алфавитный указатель пользовательских типов данных.
 */
export function buildDataTypeGlossary(index: ModelIndex): GlossarySection[] {
  const entries: GlossaryEntryDataType[] = index.dataTypes.map((d) => ({
    kind: "dataType",
    key: `${d.domainId}#${d.id}`,
    name: d.name || d.id,
    letter: firstLetter(d.name || d.id),
    dataType: d,
  }));

  return groupByLetter(entries);
}

function groupByLetter<T extends GlossaryEntry>(
  entries: T[],
): GlossarySection[] {
  const map = new Map<string, GlossaryEntry[]>();
  entries.forEach((e) => {
    const letter = e.letter;
    if (!map.has(letter)) map.set(letter, []);
    map.get(letter)!.push(e);
  });

  const sorted = Array.from(map.entries()).sort(([a], [b]) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b, "ru");
  });

  return sorted.map(([letter, arr]) => ({
    letter,
    entries: arr.sort((a, b) =>
      a.name.localeCompare(b.name, "ru", { sensitivity: "base" }),
    ),
  }));
}

/**
 * Фильтр по строке — оставляет записи, где query встречается в name.
 */
export function filterGlossarySections(
  sections: GlossarySection[],
  query: string,
): GlossarySection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;

  return sections
    .map((s) => ({
      letter: s.letter,
      entries: s.entries.filter((e) => e.name.toLowerCase().indexOf(q) !== -1),
    }))
    .filter((s) => s.entries.length > 0);
}
