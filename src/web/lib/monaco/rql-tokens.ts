const RQL_KEYWORDS = new Set([
  "select",
  "from",
  "where",
  "group",
  "having",
  "order",
  "limit",
  "join",
  "on",
  "in",
  "as",
  "and",
  "or",
  "not",
  "is",
  "null",
  "like",
  "between",
  "true",
  "false",
  "exists",
  "asc",
  "desc",
  "cast",
  "distinct",
  "from_ext",
  "join_ext",
  "array_agg",
]);

const RQL_FUNCTIONS = new Set([
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "eq",
  "ne",
  "lt",
  "gt",
  "lte",
  "gte",
  "has",
  "hasall",
  "hasany",
  "hasrole",
  "hasusergroup",
  "issuperadmin",
]);

const RQL_FIELDS = new Set([
  "condition",
  "expression",
  "constraint",
  "rql",
  "query",
]);

// Используем стандартные имена, чтобы не зависеть от кастомных правил темы
const LEGEND_TOKENS = [
  "rqlKeyword",
  "rqlFunction",
  "rqlAlias",
  "rqlString",
  "rqlNumber",
  "rqlOperator",
] as const;

const T = {
  keyword: 0, // → rqlKeyword
  function: 1, // → rqlFunction
  alias: 2, // → rqlAlias
  string: 3, // → rqlString
  number: 4, // → rqlNumber
  operator: 5, // → rqlOperator
} as const;

type RqlTokenType = keyof typeof T;

interface RqlToken {
  start: number;
  length: number;
  type: RqlTokenType;
}

interface RqlRange {
  line: number;
  startCol: number;
  endCol: number;
}

function countIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n += ch === "\t" ? 2 : 1;
  return n;
}

function stripYamlComment(s: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i).trimEnd();
    }
  }
  return s;
}

function stripYamlQuotes(value: string): { inner: string; offset: number } {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return { inner: value.slice(1, -1), offset: 1 };
  }
  return { inner: value, offset: 0 };
}

function findRqlRanges(model: any): RqlRange[] {
  const ranges: RqlRange[] = [];
  const lineCount = model.getLineCount();

  let inBlock = false;
  let blockStartLine = -1;
  let blockKeyIndent = -1;

  const flushBlock = (endLineExclusive: number) => {
    for (let ln = blockStartLine; ln < endLineExclusive; ln++) {
      const t = model.getLineContent(ln);
      if (!t.trim()) continue;
      const ind = countIndent(t);
      if (ind <= blockKeyIndent) continue;
      ranges.push({ line: ln, startCol: ind + 1, endCol: t.length + 1 });
    }
    inBlock = false;
    blockStartLine = -1;
    blockKeyIndent = -1;
  };

  for (let i = 1; i <= lineCount; i++) {
    const raw = model.getLineContent(i);

    if (inBlock) {
      if (raw.trim() === "") continue;
      const ind = countIndent(raw);
      if (ind <= blockKeyIndent) {
        flushBlock(i);
      } else {
        continue;
      }
    }

    const prefixMatch = raw.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*/);
    if (!prefixMatch) continue;

    const field = prefixMatch[1];
    const keyIndent = countIndent(
      prefixMatch[0].slice(0, prefixMatch[0].indexOf(field)),
    );
    let searchFrom = prefixMatch[0].length;

    const restRaw = raw.slice(searchFrom);
    const restClean = stripYamlComment(restRaw);

    const rqlTag = restClean.match(/^\s*!rql\b\s*(.*)$/);
    const isRqlField = RQL_FIELDS.has(field);
    if (!rqlTag && !isRqlField) continue;

    let valueRaw = rqlTag ? rqlTag[1] : restClean;

    if (/^[|>][+\-]?\s*$/.test(valueRaw)) {
      inBlock = true;
      blockStartLine = i + 1;
      blockKeyIndent = keyIndent;
      continue;
    }

    if (!valueRaw.trim()) continue;

    if (rqlTag) {
      const tagIdx = raw.indexOf("!rql", searchFrom);
      if (tagIdx < 0) continue;
      searchFrom = tagIdx + 4;
      while (searchFrom < raw.length && /\s/.test(raw[searchFrom]))
        searchFrom++;
    }

    const { inner, offset } = stripYamlQuotes(valueRaw);
    searchFrom += offset;
    if (!inner) continue;

    const endCol1 = searchFrom + inner.length + 1;
    if (endCol1 > raw.length + 1) continue;

    ranges.push({ line: i, startCol: searchFrom + 1, endCol: endCol1 });
  }

  if (inBlock) flushBlock(lineCount + 1);
  return ranges;
}

function tokenizeRql(text: string): RqlToken[] {
  const tokens: RqlToken[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Строки
    if (ch === "'" || ch === '"') {
      const q = ch;
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\" && j + 1 < text.length) {
          j += 2;
          continue;
        }
        if (text[j] === q) {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ start: i, length: j - i, type: "string" });
      i = j;
      continue;
    }

    // @alias
    if (ch === "@") {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_.]/.test(text[j])) j++;
      if (j > i + 1) {
        tokens.push({ start: i, length: j - i, type: "alias" });
        i = j;
        continue;
      }
      i++;
      continue;
    }

    // Числа
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9.]/.test(text[j])) j++;
      tokens.push({ start: i, length: j - i, type: "number" });
      i = j;
      continue;
    }

    // Слова
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
      const word = text.slice(i, j).toLowerCase();
      if (RQL_KEYWORDS.has(word)) {
        tokens.push({ start: i, length: j - i, type: "keyword" });
      } else if (RQL_FUNCTIONS.has(word)) {
        tokens.push({ start: i, length: j - i, type: "function" });
      }
      i = j;
      continue;
    }

    // Операторы
    const two = text.slice(i, i + 2);
    if (two === "<>" || two === "!=" || two === "<=" || two === ">=") {
      tokens.push({ start: i, length: 2, type: "operator" });
      i += 2;
      continue;
    }
    if ("=<>+-*/%".includes(ch)) {
      tokens.push({ start: i, length: 1, type: "operator" });
      i++;
      continue;
    }

    // Скобки и запятые — тоже операторы, чтобы не были оранжевыми
    if ("()[],;".includes(ch)) {
      tokens.push({ start: i, length: 1, type: "operator" });
      i++;
      continue;
    }

    i++;
  }
  return tokens;
}

function buildSemanticData(model: any, ranges: RqlRange[]): Uint32Array {
  const data: number[] = [];
  let prevLine = -1;
  let prevCol = -1;

  for (const r of ranges) {
    const lineText = model.getLineContent(r.line);
    const start0 = r.startCol - 1;
    const end0 = r.endCol - 1;
    if (start0 < 0 || end0 > lineText.length || start0 >= end0) continue;
    const sub = lineText.slice(start0, end0);
    const tokens = tokenizeRql(sub);

    for (const t of tokens) {
      const line0 = r.line - 1;
      const col0 = start0 + t.start;
      let deltaLine: number;
      let deltaCol: number;
      if (prevLine < 0) {
        deltaLine = line0;
        deltaCol = col0;
      } else {
        deltaLine = line0 - prevLine;
        deltaCol = deltaLine === 0 ? col0 - prevCol : col0;
      }
      data.push(deltaLine, deltaCol, t.length, T[t.type], 0);
      prevLine = line0;
      prevCol = col0;
    }
  }
  return new Uint32Array(data);
}

let registered = false;
let cachedVersion = -1;
let cachedData: Uint32Array | null = null;

export function registerRqlSemanticTokens(monaco: any): void {
  if (registered) return;
  registered = true;

  const legend = {
    tokenTypes: LEGEND_TOKENS.slice() as string[],
    tokenModifiers: [] as string[],
  };

  monaco.languages.registerDocumentSemanticTokensProvider("yaml", {
    getLegend: () => legend,
    provideDocumentSemanticTokens: (
      model: any,
      lastResultId: string | null,
    ) => {
      const versionId = model.getVersionId();
      const resultId = String(versionId);
      if (
        cachedData &&
        lastResultId === resultId &&
        versionId === cachedVersion
      ) {
        return { resultId, data: cachedData };
      }
      const ranges = findRqlRanges(model);
      const data = buildSemanticData(model, ranges);
      cachedVersion = versionId;
      cachedData = data;

      return { resultId, data };
    },
    releaseDocumentSemanticTokens: () => {},
  });
}
