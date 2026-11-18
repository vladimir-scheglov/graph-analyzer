// ============ Типы ============

export interface FunctionSignature {
  name: string;
  /** Категория для группировки в completion. */
  category:
    | "query"
    | "control"
    | "compare"
    | "logic"
    | "arith"
    | "string"
    | "date"
    | "array"
    | "user"
    | "agg"
    | "cast"
    | "uuid"
    | "null";
  /** Краткое описание. */
  detail: string;
  /** Сигнатура, например: `if(cond, then, else)`. */
  signature: string;
  /** Возвращаемый тип (для диагностики, опционально). */
  returns?: string;
}

export interface AliasDef {
  /** Полное имя: @doc, @row, @CurrentDate, @CurrentUser.id. */
  name: string;
  detail: string;
  category: "object" | "context" | "system";
}

export interface OperatorDef {
  /** '=', '!=', '<>', '<', '<=', '>', '>=', 'LIKE', 'NOT LIKE',
   *  'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL', 'BETWEEN', 'AND', 'OR', 'NOT'. */
  name: string;
  detail: string;
  category: "compare" | "logic" | "pattern" | "null" | "range";
}

// ============ Системные @-алиасы ============

export const ALIASES: AliasDef[] = [
  { name: "@doc", detail: "Текущий объект", category: "object" },
  {
    name: "@row",
    detail:
      "Текущая строка таблицы (только target: entityAttribute с type: table)",
    category: "context",
  },
  {
    name: "@index",
    detail: "Индекс элемента массива / строки таблицы (0-based)",
    category: "context",
  },
  {
    name: "@CurrentTimestamp",
    detail: "Текущая дата и время (ms)",
    category: "system",
  },
  {
    name: "@CurrentDateTime",
    detail: "Текущая дата и время (ms), аналог @CurrentTimestamp",
    category: "system",
  },
  {
    name: "@CurrentDate",
    detail: "Текущая дата (YYYY-MM-DD)",
    category: "system",
  },
  { name: "@CurrentTime", detail: "Текущее время (Time)", category: "system" },
  {
    name: "@CurrentDayOfWeek",
    detail: "День недели: monday … sunday",
    category: "system",
  },
  {
    name: "@CurrentUser",
    detail: "Текущий пользователь (объект)",
    category: "system",
  },
  {
    name: "@CurrentUser.id",
    detail: "ID текущего пользователя",
    category: "system",
  },
  {
    name: "@CurrentUser.username",
    detail: "Имя текущего пользователя",
    category: "system",
  },
];

// ============ Специальные функции Domain RQL ============

export const FUNCTIONS: FunctionSignature[] = [
  // ---- Query / CTE ----
  {
    name: "select",
    category: "query",
    detail: "Вложенный запрос",
    signature: "select(expr, …)",
  },
  {
    name: "from",
    category: "query",
    detail: "Источник: домен + сущность/связь",
    signature: "from('domain' | 'current', @entity, [@alias])",
  },
  {
    name: "with",
    category: "query",
    detail: "CTE",
    signature: "with(@alias, select(…))",
  },
  {
    name: "join",
    category: "query",
    detail: "INNER JOIN",
    signature: "join('domain' | @cte, @entity, on(…))",
  },
  {
    name: "innerJoin",
    category: "query",
    detail: "INNER JOIN",
    signature: "innerJoin(…)",
  },
  {
    name: "leftJoin",
    category: "query",
    detail: "LEFT JOIN",
    signature: "leftJoin(…)",
  },
  {
    name: "rightJoin",
    category: "query",
    detail: "RIGHT JOIN",
    signature: "rightJoin(…)",
  },
  {
    name: "fullJoin",
    category: "query",
    detail: "FULL JOIN",
    signature: "fullJoin(…)",
  },
  {
    name: "on",
    category: "query",
    detail: "Условие соединения",
    signature: "on(expr)",
  },
  {
    name: "where",
    category: "query",
    detail: "Фильтр",
    signature: "where(expr)",
  },
  {
    name: "group",
    category: "query",
    detail: "Группировка",
    signature: "group(field, …)",
  },
  {
    name: "having",
    category: "query",
    detail: "HAVING",
    signature: "having(expr)",
  },
  {
    name: "order",
    category: "query",
    detail: "Сортировка",
    signature: "order(asc(expr) | desc(expr))",
  },
  {
    name: "asc",
    category: "query",
    detail: "По возрастанию",
    signature: "asc(expr)",
  },
  {
    name: "desc",
    category: "query",
    detail: "По убыванию",
    signature: "desc(expr)",
  },
  { name: "limit", category: "query", detail: "Лимит", signature: "limit(n)" },

  // ---- Управляющие ----
  {
    name: "CAST",
    category: "cast",
    detail: "Приведение типа",
    signature: "CAST(expr, 'TYPE')",
  },
  {
    name: "ARRAY",
    category: "array",
    detail: "Создать массив",
    signature: "ARRAY(x, …)",
  },
  {
    name: "UNNEST",
    category: "array",
    detail: "Развернуть массив в коллекцию",
    signature: "UNNEST(arr)",
  },
  {
    name: "extract",
    category: "control",
    detail: "Значение ключа из URL/Attachment",
    signature: "extract(attr, 'key', ['TYPE'])",
  },
  {
    name: "if",
    category: "control",
    detail: "Условное ветвление",
    signature: "if(cond, then, else)",
  },
  {
    name: "multiIf",
    category: "control",
    detail: "Множественное ветвление",
    signature: "multiIf(cond1, then1, …, else)",
  },

  // ---- Сравнение (функциональный стиль) ----
  { name: "eq", category: "compare", detail: "a = b", signature: "eq(a, b)" },
  { name: "ne", category: "compare", detail: "a != b", signature: "ne(a, b)" },
  {
    name: "notEquals",
    category: "compare",
    detail: "a != b",
    signature: "notEquals(a, b)",
  },
  { name: "lt", category: "compare", detail: "a < b", signature: "lt(a, b)" },
  {
    name: "less",
    category: "compare",
    detail: "a < b",
    signature: "less(a, b)",
  },
  {
    name: "lte",
    category: "compare",
    detail: "a <= b",
    signature: "lte(a, b)",
  },
  {
    name: "lessOrEquals",
    category: "compare",
    detail: "a <= b",
    signature: "lessOrEquals(a, b)",
  },
  { name: "gt", category: "compare", detail: "a > b", signature: "gt(a, b)" },
  {
    name: "greater",
    category: "compare",
    detail: "a > b",
    signature: "greater(a, b)",
  },
  {
    name: "gte",
    category: "compare",
    detail: "a >= b",
    signature: "gte(a, b)",
  },
  {
    name: "greaterOrEquals",
    category: "compare",
    detail: "a >= b",
    signature: "greaterOrEquals(a, b)",
  },
  {
    name: "like",
    category: "compare",
    detail: "LIKE",
    signature: "like(a, 'pattern')",
  },
  {
    name: "ilike",
    category: "compare",
    detail: "LIKE без учёта регистра",
    signature: "ilike(a, 'pattern')",
  },
  {
    name: "match",
    category: "compare",
    detail: "Regex match",
    signature: "match(a, 'regex')",
  },
  {
    name: "imatch",
    category: "compare",
    detail: "Regex match без учёта регистра",
    signature: "imatch(a, 'regex')",
  },
  {
    name: "in",
    category: "compare",
    detail: "a IN b",
    signature: "in(a, set)",
  },
  {
    name: "notIn",
    category: "compare",
    detail: "a NOT IN b",
    signature: "notIn(a, set)",
  },
  {
    name: "between",
    category: "compare",
    detail: "a BETWEEN b AND c",
    signature: "between(a, b, c)",
  },
  {
    name: "isNull",
    category: "null",
    detail: "a IS NULL",
    signature: "isNull(a)",
  },
  {
    name: "isNotNull",
    category: "null",
    detail: "a IS NOT NULL",
    signature: "isNotNull(a)",
  },

  // ---- Логика ----
  { name: "and", category: "logic", detail: "И", signature: "and(a, b, …)" },
  { name: "or", category: "logic", detail: "ИЛИ", signature: "or(a, b, …)" },
  { name: "not", category: "logic", detail: "НЕ", signature: "not(a)" },

  // ---- Арифметика ----
  { name: "plus", category: "arith", detail: "a + b", signature: "plus(a, b)" },
  {
    name: "minus",
    category: "arith",
    detail: "a - b",
    signature: "minus(a, b)",
  },
  {
    name: "multiply",
    category: "arith",
    detail: "a * b",
    signature: "multiply(a, b)",
  },
  {
    name: "divide",
    category: "arith",
    detail: "a / b",
    signature: "divide(a, b)",
  },
  { name: "negate", category: "arith", detail: "-a", signature: "negate(a)" },
  { name: "abs", category: "arith", detail: "|a|", signature: "abs(a)" },
  {
    name: "modulo",
    category: "arith",
    detail: "a % b",
    signature: "modulo(a, b)",
  },

  // ---- Строки / массивы ----
  {
    name: "LENGTH",
    category: "string",
    detail: "Длина строки или массива",
    signature: "LENGTH(x)",
  },
  {
    name: "has",
    category: "array",
    detail: "Массив содержит значение",
    signature: "has(arr, value)",
  },
  {
    name: "hasAll",
    category: "array",
    detail: "Все элементы подмножества содержатся",
    signature: "hasAll(arr, subset)",
  },
  {
    name: "hasAny",
    category: "array",
    detail: "Хотя бы один элемент содержится",
    signature: "hasAny(arr, subset)",
  },

  // ---- Дата / время ----
  {
    name: "DATE_PART",
    category: "date",
    detail:
      "Извлечь компонент: 'year'|'month'|'day'|'hour'|'minute'|'second'|'week'|'dow'|'doy'",
    signature: "DATE_PART('component', expr)",
  },
  {
    name: "TSRANGE",
    category: "date",
    detail: "Диапазон времени",
    signature: "TSRANGE(start, end, ['[)'|'[]'|'()'|'(]'])",
  },
  {
    name: "tsrangeBefore",
    category: "date",
    detail: "Диапазон заканчивается до",
    signature: "tsrangeBefore(range, other)",
  },
  {
    name: "tsrangeAfter",
    category: "date",
    detail: "Диапазон начинается после",
    signature: "tsrangeAfter(range, other)",
  },
  {
    name: "tsrangeIncludes",
    category: "date",
    detail: "Диапазон включает",
    signature: "tsrangeIncludes(range, other)",
  },
  {
    name: "tsrangeIntersects",
    category: "date",
    detail: "Диапазоны пересекаются",
    signature: "tsrangeIntersects(range, other)",
  },
  {
    name: "tsrangeInterval",
    category: "date",
    detail: "Длительность диапазона ('minutes'|'hours'|'days')",
    signature: "tsrangeInterval(range, ['days'])",
  },

  // ---- Пользователь ----
  {
    name: "isSuperAdmin",
    category: "user",
    detail: "Текущий пользователь — суперадминистратор",
    signature: "isSuperAdmin()",
  },
  {
    name: "hasRole",
    category: "user",
    detail: "Текущий пользователь имеет роль",
    signature: "hasRole('role' | 'uuid')",
  },
  {
    name: "hasUserGroup",
    category: "user",
    detail: "Текущий пользователь входит в группу",
    signature: "hasUserGroup(['name' | 'uuid'])",
  },

  // ---- UUID ----
  {
    name: "genrandomuuid",
    category: "uuid",
    detail: "Сгенерировать UUID v4",
    signature: "genrandomuuid()",
  },

  // ---- Агрегаты ----
  {
    name: "count",
    category: "agg",
    detail: "Количество (обязателен аргумент, не *)",
    signature: "count(field)",
  },
  { name: "sum", category: "agg", detail: "Сумма", signature: "sum(field)" },
  { name: "avg", category: "agg", detail: "Среднее", signature: "avg(field)" },
  { name: "min", category: "agg", detail: "Минимум", signature: "min(field)" },
  { name: "max", category: "agg", detail: "Максимум", signature: "max(field)" },
];

// ============ Операторы (для основного выражения, не внутри функций) ============

export const OPERATORS: OperatorDef[] = [
  { name: "=", detail: "Равно", category: "compare" },
  { name: "!=", detail: "Не равно", category: "compare" },
  { name: "<>", detail: "Не равно", category: "compare" },
  { name: "<", detail: "Меньше (числа и даты)", category: "compare" },
  { name: "<=", detail: "Меньше или равно", category: "compare" },
  { name: ">", detail: "Больше (числа и даты)", category: "compare" },
  { name: ">=", detail: "Больше или равно", category: "compare" },
  { name: "LIKE", detail: "Шаблон (строки)", category: "pattern" },
  { name: "NOT LIKE", detail: "Не соответствует шаблону", category: "pattern" },
  { name: "IN", detail: "Входит во множество", category: "compare" },
  { name: "NOT IN", detail: "Не входит во множество", category: "compare" },
  { name: "IS NULL", detail: "Пустое значение", category: "null" },
  { name: "IS NOT NULL", detail: "Не пустое", category: "null" },
  { name: "BETWEEN", detail: "В диапазоне", category: "range" },
  { name: "AND", detail: "Логическое И", category: "logic" },
  { name: "OR", detail: "Логическое ИЛИ", category: "logic" },
  { name: "NOT", detail: "Логическое НЕ", category: "logic" },
];

// ============ Поиск функций по имени ============

const FN_MAP = new Map<string, FunctionSignature>();
for (const fn of FUNCTIONS) FN_MAP.set(fn.name.toLowerCase(), fn);

export function findFunction(name: string): FunctionSignature | undefined {
  return FN_MAP.get(name.toLowerCase());
}

// ============ Type alias для TYPE в CAST() ============

export const CAST_TYPES = [
  "BOOLEAN",
  "INTEGER",
  "BIGINT",
  "FLOAT",
  "DECIMAL",
  "DATE",
  "TIME",
  "TEXT",
  "INET",
  "inet[]",
  "text[]",
  "integer[]",
];
