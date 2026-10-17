export interface LineContext {
  entityId: string | null;
  section: string;
  ruleId?: string;
}

/**
 * Строит карту: строка → контекст (сущность/секция).
 *
 * Ключевое отличие от предыдущей версии:
 *   entity-контекст держится до конца блока (`- id:` на верхнем уровне секции),
 *   а не сбрасывается на любой строке с тем же indent, что и у поля entity.
 */
export function buildLineContexts(text: string): Map<number, LineContext> {
  const lines = text.split("\n");
  const result = new Map<number, LineContext>();

  let section = "";
  let entityId: string | null = null;
  let blockIndent = -1; // indent у текущего top-level `- id:` блока
  let ruleId: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      result.set(i + 1, { entityId, section, ruleId });
      continue;
    }

    const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // Секция верхнего уровня
    if (indent === 0) {
      const secMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(?:#.*)?$/);
      if (secMatch) {
        section = secMatch[1];
        entityId = null;
        blockIndent = -1;
        ruleId = undefined;
        result.set(i + 1, { entityId, section, ruleId });
        continue;
      }
    }

    // Начало нового top-level блока `- id:` (rule, view, entity, ...)
    const blockStart = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
    if (blockStart) {
      const bIndent = blockStart[1].length;
      if (blockIndent < 0 || bIndent <= blockIndent) {
        blockIndent = bIndent;
        entityId = null;
        ruleId = blockStart[2];
      }
      result.set(i + 1, { entityId, section, ruleId });
      continue;
    }

    // Поле entity: — задаёт контекстную сущность
    const entityMatch = line.match(/^(\s+)(?:-\s+)?entity\s*:\s*([^\s#]+)/);
    if (entityMatch) {
      entityId = entityMatch[2].replace(/["']/g, "");
      result.set(i + 1, { entityId, section, ruleId });
      continue;
    }

    // Сброс контекста только при выходе из блока
    if (blockIndent >= 0 && indent < blockIndent) {
      entityId = null;
      blockIndent = -1;
      ruleId = undefined;
    }

    result.set(i + 1, { entityId, section, ruleId });
  }

  return result;
}
