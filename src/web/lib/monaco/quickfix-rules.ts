export type QuickFixKind = "camelcase" | "label" | "description";

/**
 * Единая классификация: возвращает тип автофикса или null.
 * Используется:
 *   - buildQuickFix — что именно вставить
 *   - LintModal — счётчик «Исправить все (N)»
 *   - provideCodeActions — какие маркеры показывать в quickfix-подменю
 *
 * ВАЖНО: сюда добавлять только правила, где автофикс БЕЗОПАСЕН.
 * Структурные дубликаты (duplicate-entity-id, duplicate-id/...) сюда
 * намеренно не входят.
 */
export function classifyQuickFix(
  code: string | undefined,
  message: string | undefined,
): QuickFixKind | null {
  const c = String(code || "").toLowerCase();
  const m = String(message || "").toLowerCase();

  const camelRe = /camel|pascal|snake[_\-\s]?case|kebab|верблюж|змеин/i;
  if (camelRe.test(c) || camelRe.test(m)) return "camelcase";

  const labelRe = /label/i;
  const needsSomethingRe =
    /нет|отсутству|не\s+задан|missing|required|должен\s+быть/i;
  if (c.includes("label") && !c.includes("tab") && !c.includes("menu")) {
    return "label";
  }
  if (labelRe.test(m) && needsSomethingRe.test(m)) return "label";

  if (c.includes("description")) return "description";
  if (m.includes("description") && needsSomethingRe.test(m))
    return "description";

  return null;
}

export function isAutoFixable(code?: string, message?: string): boolean {
  return classifyQuickFix(code, message) !== null;
}
