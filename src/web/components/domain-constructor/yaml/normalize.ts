// yaml/normalize.ts

export const RQL_MARKER = "<<RQL>>";

/**
 * eemeli/yaml не парсит многострочный `!rql <inline>` (без `|`).
 * Преобразуем в `!rql |` с правильным отступом.
 */
export function normalizeRqlBlocks(yaml: string): string {
  const lines = yaml.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(\s*)([^\s:#][^:]*):\s*!rql[ \t]+(?![|>])(.+)$/);

    if (m) {
      const indentStr = m[1];
      const key = m[2];
      const firstValue = m[3];
      const baseIndent = indentStr.length;

      const continuation: string[] = [firstValue];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (next.trim() === "") {
          continuation.push("");
          j++;
          continue;
        }
        const nextIndent = (next.match(/^(\s*)/)?.[1] ?? "").length;
        if (nextIndent > baseIndent) {
          continuation.push(next.slice(baseIndent));
          j++;
        } else break;
      }

      if (continuation.length === 1) {
        out.push(line);
        i++;
        continue;
      }

      const blockIndent = " ".repeat(baseIndent + 2);
      out.push(`${indentStr}${key}: !rql |`);
      for (const l of continuation) out.push(l ? blockIndent + l : "");
      i = j;
    } else {
      out.push(line);
      i++;
    }
  }

  return out.join("\n");
}

/**
 * `!rql` (YAML-тег) → `<<RQL>>` (строковый маркер).
 * Парсер больше не знает про тег → содержимое сохраняется как обычная строка.
 */
export function preprocess(yaml: string): string {
  return yaml.replace(/(:\s*)!rql(\s)/g, `$1${RQL_MARKER}$2`);
}

/** Обратная замена при `toString()`. */
export function postprocess(yaml: string): string {
  return yaml.replace(
    new RegExp(`(:\\s*)${RQL_MARKER.replace(/[<>]/g, "\\$&")}(\\s)`, "g"),
    "$1!rql$2",
  );
}

/** Проверка: значение — это RQL? */
export function isRqlValue(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(RQL_MARKER + " ");
}

/** Срезать префикс `<<RQL>> ` из значения. */
export function stripRqlPrefix(v: unknown): unknown {
  if (isRqlValue(v)) return (v as string).slice(RQL_MARKER.length + 1);
  return v;
}
