import { diffLines, diffWordsWithSpace } from "diff";

export interface LineDiffMarks {
  added: number[];
  modified: number[];
  unchanged: number[];
}

/** Порог схожести: если < него — считаем строки разными (added, не modified). */
const SIMILARITY_THRESHOLD = 0.4;

/**
 * Нормализация строки для сравнения:
 *  - trim
 *  - убрать "- " в начале
 *  - убрать trailing-комментарий " # …"
 */
function normalizeForCompare(s: string): string {
  let t = s.trim();
  t = t.replace(/^-\s+/, "");
  const hash = t.indexOf(" #");
  if (hash >= 0) t = t.slice(0, hash).trim();
  return t;
}

/**
 * Разбивает "key: value" на key и value.
 * "id: name" → { key: "id", value: "name" }
 * "entities:" → { key: "entities", value: "" }
 * "text"      → { key: "text", value: "" }
 */
function splitKeyValue(normalized: string): { key: string; value: string } {
  const colon = normalized.indexOf(":");
  if (colon <= 0) return { key: normalized, value: "" };
  return {
    key: normalized.slice(0, colon).trim(),
    value: normalized.slice(colon + 1).trim(),
  };
}

function prefixSuffixSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const la = a.length;
  const lb = b.length;
  const maxLen = Math.max(la, lb);
  const minLen = Math.min(la, lb);
  let prefix = 0;
  while (prefix < minLen && a.charCodeAt(prefix) === b.charCodeAt(prefix))
    prefix++;
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    a.charCodeAt(la - 1 - suffix) === b.charCodeAt(lb - 1 - suffix)
  )
    suffix++;
  return (prefix + suffix) / maxLen;
}

/**
 * Похожесть двух строк с учётом структуры YAML.
 *
 * Ключевое отличие от «слепого» prefix/suffix:
 *   - если у обеих строк есть "key:", сравниваем ТОЛЬКО значение;
 *     общий префикс "  - id: " не даёт бесплатного бонуса к similarity
 *   - если ключи разные → 0 (это added, а не modified)
 *   - если хоть у одной нет ":" → fallback на prefix/suffix
 */
function similarity(a: string, b: string): number {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  const ka = splitKeyValue(na);
  const kb = splitKeyValue(nb);

  // Обе с key:value
  if (ka.value !== "" && kb.value !== "") {
    // Ключи разные → точно added
    if (ka.key !== kb.key) return 0;
    // Ключ совпадает → сравниваем значения
    return prefixSuffixSimilarity(ka.value, kb.value);
  }

  // Обе — "key:" (секции, контейнеры без значения)
  if (ka.value === "" && kb.value === "") {
    // Разные ключи → added
    if (ka.key !== kb.key) return 0;
    return 1;
  }

  // Fallback: одна с key, другая без — маловероятно, но возможно
  return prefixSuffixSimilarity(na, nb);
}


interface ChangeBlock {
  removedLines: number[]; // 1-based в oldContent
  addedLines: number[]; // 1-based в newContent
  _removedTexts?: string[];
  _addedTexts?: string[];
}

/**
 * Строит маркеры изменения по построчному diff.
 *
 * Логика:
 *   - Каждый блок `{removed: N, added: M}` подряд разбираем отдельно.
 *   - N === 0 → все M строк = added.
 *   - M === 0 → все N строк = removed (в inline-редакторе не отображаются).
 *   - Иначе — pairing: для каждой пары (removed[i], added[j]) считаем
 *     similarity. Если >= порога → modified; иначе added или removed.
 *   - Pairing жадный: слева направо, только соседние.
 */
function pairBlocks(blocks: ChangeBlock[]): {
  added: number[];
  modified: number[];
  removed: number[];
} {
  const added: number[] = [];
  const modified: number[] = [];
  const removed: number[] = [];

  for (const block of blocks) {
    const { removedLines, addedLines } = block;
    const n = removedLines.length;
    const m = addedLines.length;

    if (n === 0) {
      added.push(...addedLines);
      continue;
    }
    if (m === 0) {
      removed.push(...removedLines);
      continue;
    }

    // Pairing: идём по обоим массивам, сравнивая similarity.
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      // Если остатки совпадают по количеству — сразу пары.
      // Иначе пробуем i-ю removed с j-й added.
      // При низкой похожести решаем, что «лишняя» — added.
      const sim = similarity(
        block._removedTexts?.[i] ?? "",
        block._addedTexts?.[j] ?? "",
      );
      if (sim >= SIMILARITY_THRESHOLD) {
        modified.push(addedLines[j]);
        i++;
        j++;
      } else {
        // Сравним «i+1 removed vs j added» и «i removed vs j+1 added»,
        // чтобы понять, кого именно skip'ать. Это даёт лучший pairing
        // на «вставили новую перед изменённой» и «удалили одну из двух».
        const simNextRemoved =
          i + 1 < n
            ? similarity(
                block._removedTexts?.[i + 1] ?? "",
                block._addedTexts?.[j] ?? "",
              )
            : -1;
        const simNextAdded =
          j + 1 < m
            ? similarity(
                block._removedTexts?.[i] ?? "",
                block._addedTexts?.[j + 1] ?? "",
              )
            : -1;

        if (
          simNextRemoved >= SIMILARITY_THRESHOLD &&
          simNextRemoved >= simNextAdded
        ) {
          // i-я removed — лишняя (удалили строку), переходим к следующей
          removed.push(removedLines[i]);
          i++;
        } else if (simNextAdded >= SIMILARITY_THRESHOLD) {
          // j-я added — лишняя (вставили строку), переходим к следующей
          added.push(addedLines[j]);
          j++;
        } else {
          // Не нашли пары — j-я added = новая строка.
          added.push(addedLines[j]);
          j++;
        }
      }
    }
    // Хвосты
    while (i < n) {
      removed.push(removedLines[i]);
      i++;
    }
    while (j < m) {
      added.push(addedLines[j]);
      j++;
    }
  }

  return { added, modified, removed };
}

export function buildLineDiffMarks(
  savedContent: string,
  currentContent: string,
): LineDiffMarks {
  if (savedContent === currentContent) {
    const lines = savedContent.split("\n").length;
    return {
      added: [],
      modified: [],
      unchanged: Array.from({ length: lines }, (_, i) => i + 1),
    };
  }

  // Единственный путь для любого размера — diffLines + pairing.
  const chunks = diffLines(savedContent, currentContent, {
    newlineIsToken: false,
  });

  const blocks: ChangeBlock[] = [];
  let currentRemoved: number[] = [];
  let currentAdded: number[] = [];
  let currentRemovedTexts: string[] = [];
  let currentAddedTexts: string[] = [];

  let oldLine = 1;
  let newLine = 1;

  const flushBlock = () => {
    if (currentRemoved.length === 0 && currentAdded.length === 0) return;
    blocks.push({
      removedLines: currentRemoved,
      addedLines: currentAdded,
      _removedTexts: currentRemovedTexts,
      _addedTexts: currentAddedTexts,
    } as ChangeBlock);
    currentRemoved = [];
    currentAdded = [];
    currentRemovedTexts = [];
    currentAddedTexts = [];
  };

  for (const chunk of chunks) {
    const rawLines = chunk.value.split("\n");
    const lines =
      rawLines[rawLines.length - 1] === "" ? rawLines.slice(0, -1) : rawLines;

    if (!chunk.added && !chunk.removed) {
      flushBlock();
      oldLine += lines.length;
      newLine += lines.length;
      continue;
    }
    if (chunk.removed) {
      if (currentAdded.length > 0) flushBlock();
      for (const line of lines) {
        currentRemoved.push(oldLine++);
        currentRemovedTexts.push(line);
      }
    } else if (chunk.added) {
      for (const line of lines) {
        currentAdded.push(newLine++);
        currentAddedTexts.push(line);
      }
    }
  }
  flushBlock();

  const paired = pairBlocks(blocks);

  const modifiedOrAdded = new Set<number>([
    ...paired.added,
    ...paired.modified,
  ]);

  const totalLines = currentContent.split("\n").length;
  const unchanged: number[] = [];
  for (let i = 1; i <= totalLines; i++) {
    if (!modifiedOrAdded.has(i)) unchanged.push(i);
  }

  return {
    added: paired.added.sort((x, y) => x - y),
    modified: paired.modified.sort((x, y) => x - y),
    unchanged,
  };
}

/** Без изменений. */
export function applyInlineDiffDecorations(
  editor: any,
  monaco: any,
  marks: LineDiffMarks,
): () => void {
  const decorations: any[] = [];
  const model = editor.getModel();
  if (!model) return () => {};

  const lineCount = model.getLineCount();

  for (const line of marks.modified) {
    if (line < 1 || line > lineCount) continue;
    decorations.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: "dg-inline-diff-modified",
        linesDecorationsClassName: "dg-inline-diff-gutter-modified",
        glyphMarginClassName: "dg-inline-diff-glyph-modified",
        glyphMarginHoverMessage: { value: "Изменено с последнего сохранения" },
        overviewRuler: {
          color: "#f59e0b",
          position: monaco.editor.OverviewRulerLane.Right,
        },
      },
    });
  }

  for (const line of marks.added) {
    if (line < 1 || line > lineCount) continue;
    decorations.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: "dg-inline-diff-added",
        linesDecorationsClassName: "dg-inline-diff-gutter-added",
        glyphMarginClassName: "dg-inline-diff-glyph-added",
        glyphMarginHoverMessage: { value: "Добавлено с последнего сохранения" },
        overviewRuler: {
          color: "#10b981",
          position: monaco.editor.OverviewRulerLane.Right,
        },
      },
    });
  }

  const collection = editor.createDecorationsCollection(decorations);
  return () => collection.clear();
}
