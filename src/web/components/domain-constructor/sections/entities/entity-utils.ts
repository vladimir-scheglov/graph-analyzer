import type { AttributeSchema } from "../../types";

// ============ Транслитерация и генерация ID ============
const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function translit(input: string): string {
  return input
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      const mapped = TRANSLIT[lower];
      if (mapped === undefined) return ch;
      return ch === lower
        ? mapped
        : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .join("");
}

function words(name: string): string[] {
  return translit(name)
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function toCamelCase(name: string): string {
  const w = words(name);
  if (!w.length) return "";
  return (
    w[0].charAt(0).toLowerCase() +
    w[0].slice(1) +
    w
      .slice(1)
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join("")
  );
}

export function toPascalCase(name: string): string {
  return words(name)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join("");
}

/** Уникальный Data ID (≤30) из названия; base — fallback. */
export function suggestId(
  name: string,
  style: "camel" | "pascal",
  existing: Set<string>,
  base = style === "camel" ? "attribute" : "Entity",
): string {
  let id = style === "camel" ? toCamelCase(name) : toPascalCase(name);
  if (!id || !/^[A-Za-z]/.test(id)) id = base;
  id = id.slice(0, 30);
  return uniqueId(id, existing);
}

export function uniqueId(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, 30 - suffix.length) + suffix;
    if (!existing.has(candidate)) return candidate;
  }
  return base.slice(0, 24) + Date.now().toString(36).slice(-5);
}

// ============ Типы данных: группы, цвета, иконки ============
export interface TypeGroupMeta {
  key: string;
  label: string;
  hue: string;
  glyph: string;
  types: string[];
}

export const TYPE_GROUPS: TypeGroupMeta[] = [
  {
    key: "string",
    label: "Строки",
    hue: "--ent-blue",
    glyph: "Т",
    types: ["String", "Text"],
  },
  {
    key: "number",
    label: "Числа",
    hue: "--ent-amber",
    glyph: "#",
    types: ["Integer", "Decimal", "Float"],
  },
  {
    key: "time",
    label: "Дата и время",
    hue: "--ent-violet",
    glyph: "◷",
    types: ["Timestamp", "Date", "Time", "TimestampRange"],
  },
  {
    key: "net",
    label: "Сеть и URL",
    hue: "--ent-cyan",
    glyph: "⌁",
    types: ["IpAddress", "CIDR", "MAC", "URL"],
  },
  {
    key: "bool",
    label: "Логические",
    hue: "--ent-green",
    glyph: "◐",
    types: ["Bool"],
  },
  {
    key: "ref",
    label: "Ссылки и списки",
    hue: "--ent-magenta",
    glyph: "→",
    types: ["Reference", "Enum", "Workflow"],
  },
  {
    key: "struct",
    label: "Структуры",
    hue: "--ent-orange",
    glyph: "▦",
    types: ["Array", "Table"],
  },
  {
    key: "special",
    label: "Специальные",
    hue: "--ent-teal",
    glyph: "★",
    types: [
      "Identifier",
      "Counter",
      "Uuid",
      "Attachment",
      "Calculation",
      "RQL",
      "Automation",
      "Configuration",
      "Variable",
    ],
  },
];

export function typeGroup(dataType: string): TypeGroupMeta {
  return (
    TYPE_GROUPS.find((g) => g.types.includes(dataType)) ?? {
      key: "custom",
      label: "Пользовательский",
      hue: "--ent-magenta",
      glyph: "◆",
      types: [dataType],
    }
  );
}

export const ALL_DATA_TYPES = [
  "String",
  "Text",
  "Integer",
  "Decimal",
  "Float",
  "Bool",
  "Timestamp",
  "Date",
  "Time",
  "TimestampRange",
  "IpAddress",
  "CIDR",
  "MAC",
  "URL",
  "Uuid",
  "Reference",
  "Array",
  "Table",
  "Enum",
  "Workflow",
  "Identifier",
  "Counter",
  "Attachment",
  "Calculation",
  "RQL",
  "Automation",
  "Configuration",
  "Variable",
];

export const ARRAY_ITEM_TYPES = [
  "String",
  "Text",
  "Integer",
  "Decimal",
  "Float",
  "Bool",
  "Timestamp",
  "Date",
  "Time",
  "TimestampRange",
  "IpAddress",
  "CIDR",
  "MAC",
  "URL",
  "Uuid",
  "Reference",
  "Enum",
  "Workflow",
  "Attachment",
];

// ============ Системные атрибуты ============
export const SYSTEM_ATTRIBUTES: Array<{
  id: string;
  name: string;
  dataType: string;
}> = [
  { id: "id", name: "Идентификатор объекта", dataType: "Uuid" },
  { id: "label", name: "Лейбл", dataType: "String" },
  { id: "createdAt", name: "Дата создания", dataType: "Timestamp" },
  { id: "createdBy", name: "Создал", dataType: "Reference" },
  { id: "updatedAt", name: "Дата изменения", dataType: "Timestamp" },
  { id: "updatedBy", name: "Изменил", dataType: "Reference" },
  { id: "domainId", name: "Идентификатор домена", dataType: "String" },
  { id: "entityId", name: "Идентификатор сущности", dataType: "String" },
  { id: "entityName", name: "Название сущности", dataType: "String" },
  { id: "organizationId", name: "Организация", dataType: "Reference" },
  { id: "version", name: "Версия объекта", dataType: "Integer" },
];

export const GRAPH_COLORS = [
  "blue",
  "lightblue",
  "green",
  "lightgreen",
  "yellow",
  "red",
  "peach",
  "turquoise",
  "grey",
  "violet",
  "orange",
  "purple",
  "pink",
  "lightpink",
] as const;

export const GRAPH_COLOR_HEX: Record<string, string> = {
  blue: "#3b82f6",
  lightblue: "#7dd3fc",
  green: "#22c55e",
  lightgreen: "#86efac",
  yellow: "#eab308",
  red: "#ef4444",
  peach: "#fdba74",
  turquoise: "#2dd4bf",
  grey: "#94a3b8",
  violet: "#8b5cf6",
  orange: "#f97316",
  purple: "#a855f7",
  pink: "#ec4899",
  lightpink: "#f9a8d4",
};

// ============ Импорт атрибутов из текста ============
export interface DraftAttribute {
  name: string;
  id: string;
  dataType: string;
  required: boolean;
  readonly: boolean;
}

export interface ParsedImport {
  rows: DraftAttribute[];
  format: "json" | "table" | "lines" | "empty";
  error?: string;
}

const TYPE_WORDS: Array<[RegExp, string]> = [
  [/^(строка|string|str|текст строкой)$/i, "String"],
  [/^(текст|text|многострочный|описание)$/i, "Text"],
  [/^(целое|integer|int|число|число целое)$/i, "Integer"],
  [/^(decimal|дробное|число с точностью)$/i, "Decimal"],
  [/^(float|вещественное|плавающая)$/i, "Float"],
  [/^(булево|bool|boolean|да\/нет|логическое|флаг)$/i, "Bool"],
  [/^(дата и время|timestamp|datetime|момент)$/i, "Timestamp"],
  [/^(дата|date)$/i, "Date"],
  [/^(время|time)$/i, "Time"],
  [/^(диапазон|timestamp-range|tsrange|период)$/i, "TimestampRange"],
  [/^(ip|ip-адрес|ipaddress|айпи)$/i, "IpAddress"],
  [/^(cidr|подсеть)$/i, "CIDR"],
  [/^(mac|мак|mac-адрес)$/i, "MAC"],
  [/^(url|ссылка url|адрес)$/i, "URL"],
  [/^(uuid|гуид)$/i, "Uuid"],
  [/^(reference|референс|ссылка|связанный объект)$/i, "Reference"],
  [/^(array|массив|список значений)$/i, "Array"],
  [/^(table|таблица)$/i, "Table"],
  [/^(enum|перечисление)$/i, "Enum"],
  [/^(workflow|рабочий процесс|статус)$/i, "Workflow"],
  [/^(identifier|идентификатор|код)$/i, "Identifier"],
  [/^(counter|счетчик|счётчик)$/i, "Counter"],
  [/^(attachment|файл|вложение)$/i, "Attachment"],
];

export function inferDataType(raw: string | undefined): string {
  if (!raw) return "String";
  const v = String(raw).trim();
  if (ALL_DATA_TYPES.includes(v)) return v;
  for (const [re, type] of TYPE_WORDS) if (re.test(v)) return type;
  return "String";
}

function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return /^(да|true|1|yes|обязательное|обязательный|\+)$/i.test(
    String(v ?? "").trim(),
  );
}

export function parseAttributesText(
  text: string,
  existingIds: Set<string>,
): ParsedImport {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], format: "empty" };

  const used = new Set(existingIds);
  const makeRow = (
    name: string,
    idRaw: unknown,
    typeRaw: unknown,
    requiredRaw: unknown,
    readonlyRaw: unknown,
    i: number,
  ): DraftAttribute => {
    const cleanName = String(name ?? "").trim() || `Поле ${i + 1}`;
    const idCandidate = String(idRaw ?? "").trim();
    const id =
      idCandidate && /^[A-Za-z][A-Za-z0-9_]*$/.test(idCandidate)
        ? uniqueId(idCandidate.slice(0, 30), used)
        : suggestId(cleanName, "camel", used);
    used.add(id);
    return {
      name: cleanName,
      id,
      dataType: inferDataType(typeRaw as string),
      required: parseBool(requiredRaw),
      readonly: parseBool(readonlyRaw),
    };
  };

  // --- JSON ---
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : [data];
      const rows = arr.map((item: any, i: number) => {
        if (typeof item === "string")
          return makeRow(item, undefined, undefined, undefined, undefined, i);
        return makeRow(
          item.name ??
            item["название"] ??
            item["имя"] ??
            item.label ??
            item.title,
          item.id,
          item.dataType ?? item.type ?? item["тип"],
          item.required ?? item["обязательное"],
          item.readonly ?? item["только чтение"],
          i,
        );
      });
      return { rows, format: "json" };
    } catch (e) {
      return {
        rows: [],
        format: "json",
        error: "Не удалось разобрать JSON: " + (e as Error).message,
      };
    }
  }

  // --- Таблица (TSV / ;) или список строк ---
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const delim = lines.some((l) => l.includes("\t"))
    ? "\t"
    : lines.some((l) => l.includes(";"))
      ? ";"
      : null;

  if (!delim) {
    return {
      rows: lines.map((l, i) =>
        makeRow(l, undefined, undefined, undefined, undefined, i),
      ),
      format: "lines",
    };
  }

  const split = (l: string) => l.split(delim).map((c) => c.trim());
  const first = split(lines[0]).map((c) => c.toLowerCase());
  const isHeader = first.some((c) =>
    /^(name|название|имя|id|ид|идентификатор|type|тип|datatype|required|обяз\w*|readonly)$/.test(
      c,
    ),
  );

  let col = { name: 0, id: -1, type: -1, required: -1, readonly: -1 };
  let body = lines;
  if (isHeader) {
    body = lines.slice(1);
    first.forEach((c, idx) => {
      if (/^(name|название|имя|label|поле)/.test(c)) col.name = idx;
      else if (/^(id|ид|идентификатор)/.test(c)) col.id = idx;
      else if (/^(type|тип|datatype)/.test(c)) col.type = idx;
      else if (/^(required|обяз)/.test(c)) col.required = idx;
      else if (/^(readonly|только)/.test(c)) col.readonly = idx;
    });
    if (col.id === 0 && col.name === 0) col.name = first.length > 1 ? 1 : 0;
  } else if (first.length >= 2) {
    col = { name: 0, id: -1, type: 1, required: 2, readonly: -1 };
  }

  const rows = body.map((l, i) => {
    const cells = split(l);
    return makeRow(
      cells[col.name],
      col.id >= 0 ? cells[col.id] : undefined,
      col.type >= 0 ? cells[col.type] : undefined,
      col.required >= 0 ? cells[col.required] : undefined,
      col.readonly >= 0 ? cells[col.readonly] : undefined,
      i,
    );
  });
  return { rows, format: "table" };
}

// ============ Прочее ============
export function attrRequired(attr: AttributeSchema): boolean {
  return (attr.constraints ?? []).some((c) => c.kind === "required");
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
