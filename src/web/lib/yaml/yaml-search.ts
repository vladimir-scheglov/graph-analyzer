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
  line: number; // 1-based
  column: number; // 1-based
  length: number;
  lineText: string;
  before: string;
  match: string;
  after: string;
  truncatedBefore: boolean;
  truncatedAfter: boolean;
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
        line: lineNum,
        column: m.index + 1,
        length: matched.length,
        lineText: line,
        before:
          beforeRaw.length > CONTEXT_BEFORE
            ? "…" + beforeRaw.slice(-CONTEXT_BEFORE)
            : beforeRaw,
        match: matched,
        after:
          afterRaw.length > CONTEXT_AFTER
            ? afterRaw.slice(0, CONTEXT_AFTER) + "…"
            : afterRaw,
        truncatedBefore: beforeRaw.length > CONTEXT_BEFORE,
        truncatedAfter: afterRaw.length > CONTEXT_AFTER,
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
