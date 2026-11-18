import { parseDocument, Document, Scalar, isSeq, isMap, isScalar } from "yaml";
import {
  normalizeRqlBlocks,
  preprocess,
  postprocess,
  RQL_MARKER,
  isRqlValue,
  stripRqlPrefix,
} from "./normalize";

export type YamlPath = readonly (string | number)[];

export interface YamlError {
  message: string;
  line: number;
  col: number;
}

export class YamlDocument {
  private originalText: string;
  readonly doc: Document.Parsed;

  constructor(text: string) {
    // 1) Сначала нормализуем многострочные inline-!rql в block-literal
    // 2) Потом заменяем `!rql` на строковый маркер — парсер не знает про тег
    const prepared = preprocess(normalizeRqlBlocks(text));
    this.originalText = prepared;

    this.doc = parseDocument(prepared, {
      keepSourceTokens: true,
      strict: false,
      schema: "core",
    });
  }

  get errors(): YamlError[] {
    return this.doc.errors.map((e) => ({
      message: e.message,
      line: e.linePos?.[0]?.line ?? 0,
      col: e.linePos?.[0]?.col ?? 0,
    }));
  }

  /** Значение по пути — plain JS. Для RQL-полей срезан `<<RQL>> `-префикс. */
  get<T = unknown>(path: YamlPath): T | undefined {
    const raw = this.doc.getIn(path, true);
    if (raw === undefined || raw === null) return undefined;
    const plain = toPlain(raw);
    return stripRqlPrefix(plain) as T;
  }

  /** Сырой YAML-узел (для сохранения комментариев, range, type). */
  getNode(path: YamlPath): unknown {
    return this.doc.getIn(path, true);
  }

  set(path: YamlPath, value: unknown): void {
    this.doc.setIn(path, value);
    this.restoreRqlTypes();
  }

  delete(path: YamlPath): void {
    this.doc.deleteIn(path);
    this.restoreRqlTypes();
  }

  getRange(path: YamlPath): [number, number] | null {
    const node = this.getNode(path) as any;
    return node?.range ?? null;
  }

  toString(): string {
    this.restoreRqlTypes();
    const raw = this.doc.toString({ lineWidth: 0, minContentWidth: 0 });
    // Обратная замена `<<RQL>>` → `!rql`
    return postprocess(raw);
  }

  isDirty(): boolean {
    return preprocess(this.toString()) !== this.originalText;
  }

  markSaved(): void {
    this.originalText = preprocess(this.toString());
  }

  /**
   * Восстановить block-literal для многострочных `<<RQL>>`-скаляров.
   * Нужно, чтобы eemeli/yaml не сериализовал их в одну строку.
   */
  private restoreRqlTypes(): void {
    const walk = (node: any): void => {
      if (!node) return;
      if (isMap(node)) {
        for (const p of node.items) {
          const v = p.value;
          if (isScalar(v) && isRqlValue(v.value)) {
            const str = String(v.value);
            if (str.includes("\n")) v.type = Scalar.BLOCK_LITERAL;
          }
          walk(v);
        }
      } else if (isSeq(node)) {
        for (const it of node.items) {
          if (isScalar(it) && isRqlValue(it.value)) {
            const str = String(it.value);
            if (str.includes("\n")) it.type = Scalar.BLOCK_LITERAL;
          }
          walk(it);
        }
      }
    };
    walk(this.doc.contents);
  }

  /**
   * Append в seq по пути.
   * - null / скаляр / map на месте массива заменяется на пустой seq;
   * - item — значение ИЛИ фабрика (index) => value, если id зависит от индекса;
   * - возвращает индекс вставленного элемента.
   *
   * ВАЖНО: нормализуется только сам массив. Родительские узлы пути должны
   * быть коллекциями — это гарантирует find*Location (поиск по сырым узлам).
   */
  appendToArray(path: YamlPath, item: unknown): number {
    let seq = this.getNode(path);
    if (seq !== undefined && !isSeq(seq)) {
      this.doc.setIn(path, []);
      seq = this.getNode(path);
    }
    const i = isSeq(seq) ? seq.items.length : 0;
    const value =
      typeof item === "function"
        ? (item as (index: number) => unknown)(i)
        : item;
    // если seq не было — setIn сам создаст YAMLSeq по числовому индексу
    this.doc.setIn([...path, i], value);
    this.restoreRqlTypes();
    return i;
  }
}

// ============ YAML-узел → plain JS ============

function toPlain(node: unknown): unknown {
  if (isScalar(node)) return node.value;
  if (isMap(node)) {
    const out: Record<string, unknown> = {};
    for (const pair of node.items) {
      const k = pair.key;
      const key = isScalar(k) ? String(k.value) : String(k);
      out[key] = toPlain(pair.value);
    }
    return out;
  }
  if (isSeq(node)) return node.items.map(toPlain);
  return node;
}

// ============ RQL-поля: запись ============

export function setRql(
  doc: YamlDocument,
  path: YamlPath,
  rql: string | null,
): void {
  if (rql === null || rql === "") {
    doc.doc.setIn(path, null);
    return;
  }
  const scalar = new Scalar(`${RQL_MARKER} ${rql}`);
  if (rql.includes("\n")) scalar.type = Scalar.BLOCK_LITERAL;
  doc.doc.setIn(path, scalar);
}

/** Читает RQL-значение (или null, если поле пустое). */
export function getRql(doc: YamlDocument, path: YamlPath): string | null {
  const v = doc.get<string>(path);
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}
