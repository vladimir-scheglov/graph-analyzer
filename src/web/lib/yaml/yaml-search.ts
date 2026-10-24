import type { LineMap } from "./line-map";

export interface SearchOptions {
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  includeComments: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  useRegex: false,
  caseSensitive: false,
  wholeWord: false,
  includeComments: false,
};

export interface SearchMatch {
  line: number;
  column: number;
  length: number;
  endLine?: number;
  endColumn?: number;
  lineText: string;
  before: string;
  match: string;
  after: string;
  truncatedBefore: boolean;
  truncatedAfter: boolean;
  matchLineCount: number;
}

export interface SearchSectionGroup {
  sectionKey: string;
  sectionLabel: string;
  sectionLine: number;
  matches: SearchMatch[];
}

export interface SearchResult {
  query: string;
  options: SearchOptions;
  groups: SearchSectionGroup[];
  totalMatches: number;
  truncated: boolean;
  error: string | null;
  elapsedMs: number;
}

const CONTEXT_BEFORE = 40;
const CONTEXT_AFTER = 40;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePattern(query: string, opts: SearchOptions): RegExp {
  let source = opts.useRegex ? query : escapeRegExp(query);
  if (opts.wholeWord && !opts.useRegex) {
    source = `\\b${source}\\b`;
  }
  return new RegExp(source, `g${opts.caseSensitive ? "" : "i"}`);
}

interface SectionInterval {
  key: string;
  label: string;
  line: number;
  startLine: number; // inclusive, 1-based
  endLine: number; // exclusive, 1-based
}

function buildSectionIntervals(lineMap: LineMap): SectionInterval[] {
  const sections = [...lineMap.sections].sort((a, b) => a.line - b.line);
  return sections.map((s) => ({
    key: s.key,
    label: s.label,
    line: s.line,
    startLine: s.line,
    endLine: s.line + s.linesCount,
  }));
}

function findSectionAtLine(
  intervals: SectionInterval[],
  line: number,
): SectionInterval | null {
  let lo = 0;
  let hi = intervals.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (intervals[mid].startLine <= line) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const iv = intervals[found];
  return line < iv.endLine ? iv : null;
}

export function searchYaml(
  content: string,
  query: string,
  options: SearchOptions,
  lineMap: LineMap | null,
  maxMatches = 500,
): SearchResult {
  const opts: SearchOptions = {
    useRegex: !!options.useRegex,
    caseSensitive: !!options.caseSensitive,
    wholeWord: !!options.wholeWord,
    includeComments: !!options.includeComments,
  };

  if (query.includes("\n")) {
    return searchMultiline(content, query, opts, lineMap, maxMatches);
  }
  return searchSingleLine(content, query, opts, lineMap, maxMatches);
}

export function searchSingleLine(
  content: string,
  query: string,
  options: SearchOptions,
  lineMap: LineMap | null,
  maxMatches = 500,
): SearchResult {
  const now = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const startedAt = now();

  const opts: SearchOptions = {
    useRegex: !!options.useRegex,
    caseSensitive: !!options.caseSensitive,
    wholeWord: !!options.wholeWord,
    includeComments: !!options.includeComments,
  };

  const empty = (error: string | null): SearchResult => ({
    query,
    options: opts,
    groups: [],
    totalMatches: 0,
    truncated: false,
    error,
    elapsedMs: Math.round(now() - startedAt),
  });

  if (!query) return empty(null);

  let regex: RegExp;
  try {
    regex = compilePattern(query, opts);
  } catch (err: any) {
    return empty(err?.message || "Невалидная регулярка");
  }

  const lines = content.split("\n");
  const intervals = lineMap ? buildSectionIntervals(lineMap) : [];

  const groupsByKey = new Map<string, SearchSectionGroup>();
  let totalMatches = 0;
  let emitted = 0;
  let truncated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (!opts.includeComments && line.trimStart().startsWith("#")) continue;

    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      const matched = m[0];
      // zero-length — сдвигаем, чтобы не зациклиться
      if (matched.length === 0) {
        if (regex.lastIndex >= line.length) break;
        regex.lastIndex++;
        continue;
      }

      totalMatches++;
      if (emitted >= maxMatches) {
        truncated = true;
        if (regex.lastIndex >= line.length) break;
        continue;
      }

      // Секция
      let sectionKey = "__header__";
      let sectionLabel = "Шапка файла";
      let sectionLine = 0;
      if (intervals.length > 0) {
        const iv = findSectionAtLine(intervals, lineNum);
        if (iv) {
          sectionKey = iv.key;
          sectionLabel = iv.label;
          sectionLine = iv.line;
        } else if (lineNum >= intervals[0].startLine) {
          let prev = intervals[0];
          for (const cur of intervals) {
            if (cur.startLine <= lineNum) prev = cur;
            else break;
          }
          sectionKey = prev.key;
          sectionLabel = prev.label;
          sectionLine = prev.line;
        }
      }

      const beforeRaw = line.slice(0, m.index);
      const afterRaw = line.slice(m.index + matched.length);

      const match: SearchMatch = {
        line: lineNum, // 1-based
        column: m.index + 1, // 1-based
        length: matched.length,
        // endLine / endColumn НЕ заполняем — для однострочного матча Range
        // строится как (line, column, line, column + length). Это гарантирует
        // валидность независимо от любых пограничных случаев.
        lineText: line,
        before: beforeRaw,
        match: matched,
        after: afterRaw,
        truncatedBefore: beforeRaw.length > CONTEXT_BEFORE,
        truncatedAfter: afterRaw.length > CONTEXT_AFTER,
        matchLineCount: 1,
        endLine: lineNum,
        endColumn: m.index + 1,
      };

      let group = groupsByKey.get(sectionKey);
      if (!group) {
        group = { sectionKey, sectionLabel, sectionLine, matches: [] };
        groupsByKey.set(sectionKey, group);
      }
      group.matches.push(match);
      emitted++;

      if (regex.lastIndex >= line.length) break;
    }
  }

  const groups = Array.from(groupsByKey.values()).sort((a, b) => {
    if (a.sectionKey === "__header__") return -1;
    if (b.sectionKey === "__header__") return 1;
    return a.sectionLine - b.sectionLine;
  });

  return {
    query,
    options: opts,
    groups,
    totalMatches,
    truncated,
    error: null,
    elapsedMs: Math.round(now() - startedAt),
  };
}

function buildLineStarts(content: string): { starts: number[]; text: string } {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") starts.push(i + 1);
  }
  return { starts, text: content };
}

function offsetToPos(
  starts: number[],
  offset: number,
): { line: number; col: number } {
  // бинарный поиск: последний start ≤ offset
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - starts[lo] + 1 };
}

function lineTextAt(content: string, starts: number[], line: number): string {
  const s = starts[line - 1] ?? 0;
  const e = line < starts.length ? starts[line] - 1 : content.length;
  return content.slice(s, e);
}

function isCommentLine(text: string): boolean {
  return /^\s*#/.test(text);
}

function searchMultiline(
  content: string,
  query: string,
  opts: SearchOptions,
  lineMap: LineMap | null,
  maxMatches: number,
): SearchResult {
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const empty = (error: string | null): SearchResult => ({
    query,
    options: opts,
    groups: [],
    totalMatches: 0,
    truncated: false,
    error,
    elapsedMs: Math.round((performance.now?.() ?? Date.now()) - startedAt),
  });

  if (!query) return empty(null);

  const { starts } = buildLineStarts(content);
  const intervals = lineMap ? buildSectionIntervals(lineMap) : [];

  // Компилируем matcher
  let findNext: (from: number) => { index: number; length: number } | null;
  if (opts.useRegex) {
    let re: RegExp;
    try {
      re = new RegExp(query, `g${opts.caseSensitive ? "" : "i"}`);
    } catch (err: any) {
      return empty(err?.message || "Невалидная регулярка");
    }
    findNext = (from) => {
      re.lastIndex = from;
      const m = re.exec(content);
      if (!m) return null;
      if (m[0].length === 0) {
        // zero-length — пропускаем
        return { index: -1, length: 0 };
      }
      return { index: m.index, length: m[0].length };
    };
  } else {
    const haystack = opts.caseSensitive ? content : content.toLowerCase();
    const needle = opts.caseSensitive ? query : query.toLowerCase();
    findNext = (from) => {
      const idx = haystack.indexOf(needle, from);
      return idx < 0 ? null : { index: idx, length: needle.length };
    };
  }

  const groupsByKey = new Map<string, SearchSectionGroup>();
  let totalMatches = 0;
  let emitted = 0;
  let truncated = false;
  let cursor = 0;

  // Обход всех вхождений
  while (cursor <= content.length) {
    const hit = findNext(cursor);
    if (!hit) break;
    if (hit.index < 0) {
      cursor++;
      if (cursor > content.length) break;
      continue;
    }

    const startOffset = hit.index;
    const endOffset = startOffset + hit.length;
    const startPos = offsetToPos(starts, startOffset);
    const endPos = offsetToPos(starts, Math.max(startOffset, endOffset - 1));
    // exclusive endColumn = endPos.col + 1
    const endColumnExclusive = endPos.col + 1;
    const endLine = endPos.line;

    const matchLineCount = endLine - startPos.line + 1;

    // ============ includeComments ============
    if (!opts.includeComments) {
      let touchesComment = false;
      for (let ln = startPos.line; ln <= endLine; ln++) {
        const lt = lineTextAt(content, starts, ln);
        if (isCommentLine(lt)) {
          touchesComment = true;
          break;
        }
      }
      if (touchesComment) {
        cursor = endOffset;
        continue;
      }
    }

    totalMatches++;

    if (emitted < maxMatches) {
      // ============ Секция ============
      let sectionKey = "__header__";
      let sectionLabel = "Шапка файла";
      let sectionLine = 0;
      if (intervals.length > 0) {
        const iv = findSectionAtLine(intervals, startPos.line);
        if (iv) {
          sectionKey = iv.key;
          sectionLabel = iv.label;
          sectionLine = iv.line;
        } else if (startPos.line >= intervals[0].startLine) {
          let prev = intervals[0];
          for (const cur of intervals) {
            if (cur.startLine <= startPos.line) prev = cur;
            else break;
          }
          sectionKey = prev.key;
          sectionLabel = prev.label;
          sectionLine = prev.line;
        }
      }

      // ============ Контекст ============
      const fullLine = lineTextAt(content, starts, startPos.line);
      const startColIdx = startPos.col - 1;

      // Строка в списке: до первой строки матча
      const firstLineEnd = fullLine.length;
      const beforeRaw = fullLine.slice(0, startColIdx);
      const afterCol = Math.min(
        firstLineEnd,
        startColIdx +
          (matchLineCount === 1 ? hit.length : fullLine.length - startColIdx),
      );
      const afterRaw = fullLine.slice(afterCol);

      const matchText =
        matchLineCount === 1
          ? content.slice(startOffset, endOffset)
          : fullLine.slice(startColIdx) +
            (matchLineCount > 1 ? `…${matchLineCount - 1}стр` : "");

      const before =
        beforeRaw.length > CONTEXT_BEFORE
          ? "…" + beforeRaw.slice(-CONTEXT_BEFORE)
          : beforeRaw;
      const after =
        afterRaw.length > CONTEXT_AFTER
          ? afterRaw.slice(0, CONTEXT_AFTER) + "…"
          : afterRaw;

      const match: SearchMatch = {
        line: startPos.line,
        column: startPos.col,
        length: hit.length,
        endLine,
        endColumn: endColumnExclusive,
        lineText: fullLine,
        before,
        match: matchText,
        after,
        truncatedBefore: beforeRaw.length > CONTEXT_BEFORE,
        truncatedAfter: afterRaw.length > CONTEXT_AFTER,
        matchLineCount,
      };

      let group = groupsByKey.get(sectionKey);
      if (!group) {
        group = { sectionKey, sectionLabel, sectionLine, matches: [] };
        groupsByKey.set(sectionKey, group);
      }
      group.matches.push(match);
      emitted++;
    } else {
      truncated = true;
    }

    cursor = endOffset > cursor ? endOffset : cursor + 1;
  }

  const groups = Array.from(groupsByKey.values()).sort((a, b) => {
    if (a.sectionKey === "__header__") return -1;
    if (b.sectionKey === "__header__") return 1;
    return a.sectionLine - b.sectionLine;
  });

  return {
    query,
    options: opts,
    groups,
    totalMatches,
    truncated,
    error: null,
    elapsedMs: Math.round((performance.now?.() ?? Date.now()) - startedAt),
  };
}