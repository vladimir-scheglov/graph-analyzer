import { KNOWN_FIELDS, type ParsedFilter, type ParsedQuery } from "./types";

/**
 * Парсит строку. Поддерживает:
 *   - `field:value`, `field:"value with spaces"`
 *   - `-field:value`, `!field:value` — отрицание
 *   - свободный текст вперемешку с фильтрами
 *   - `foo:bar` с неизвестным `foo` → попадает в plainTokens как есть
 */
export function parseQuery(raw: string): ParsedQuery {
  const plainTokens: string[] = [];
  const filters: ParsedFilter[] = [];
  const input = raw.trim();
  if (!input) return { plainTokens, filters };

  let i = 0;
  const len = input.length;

  while (i < len) {
    while (i < len && /\s/.test(input[i])) i++;
    if (i >= len) break;

    let negate = false;
    if (input[i] === "-" || input[i] === "!") {
      negate = true;
      i++;
    }

    // Пробуем field:value
    const start = i;
    while (i < len && /[a-zA-Z0-9_]/.test(input[i])) i++;
    const field = input.slice(start, i).toLowerCase();

    if (i < len && input[i] === ":" && field && KNOWN_FIELDS.has(field)) {
      i++; // skip ':'
      let value = "";
      if (input[i] === '"' || input[i] === "'") {
        const q = input[i++];
        while (i < len && input[i] !== q) {
          if (input[i] === "\\" && i + 1 < len) {
            value += input[i + 1];
            i += 2;
          } else {
            value += input[i];
            i++;
          }
        }
        if (i < len && input[i] === q) i++;
      } else {
        const vs = i;
        while (i < len && !/\s/.test(input[i])) i++;
        value = input.slice(vs, i);
      }
      if (value) {
        filters.push({ field, value, negate });
        continue;
      }
      // пустое значение — падаем в plain
    }

    // Откатываем: пересоберём токен целиком
    i = start;
    let token = "";
    let inQ: string | null = null;
    while (i < len) {
      const ch = input[i];
      if (!inQ && /\s/.test(ch)) break;
      if (ch === '"' || ch === "'") {
        if (inQ === ch) {
          inQ = null;
          i++;
          continue;
        }
        if (!inQ) {
          inQ = ch;
          i++;
          continue;
        }
      }
      token += ch;
      i++;
    }
    if (token) plainTokens.push(token);
  }

  return { plainTokens, filters };
}
