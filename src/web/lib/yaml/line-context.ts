export interface LineContext {
  entityId: string | null;
  section: string;
  ruleId?: string;
}

export function buildLineContexts(text: string): Map<number, LineContext> {
  const lines = text.split("\n");
  const result = new Map<number, LineContext>();

  let section = "";
  let entityId: string | null = null;
  let entityIndent = -1;
  let ruleId: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      result.set(i + 1, { entityId, section, ruleId });
      continue;
    }

    const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // Секция верхнего уровня (entities:, views:, dataRules: и т.д.)
    if (indent === 0) {
      const secMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(?:#.*)?$/);
      if (secMatch) {
        section = secMatch[1];
        entityId = null;
        ruleId = undefined;
        entityIndent = -1;
        result.set(i + 1, { entityId, section, ruleId });
        continue;
      }
    }

    // Начало элемента списка (- id: Device, - id: rule1, и т.д.)
    const blockStart = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
    if (blockStart) {
      const bIndent = blockStart[1].length;
      const newId = blockStart[2].replace(/["']/g, "");

      // Если это внутри секции entities
      if (section === "entities") {
        if (entityIndent < 0 || bIndent <= entityIndent) {
          entityId = newId;
          entityIndent = bIndent;
        }
      } else {
        ruleId = newId;
        // Сбрасываем entityId, если вдруг остались внутри него, а тут начался другой блок
        if (entityIndent >= 0 && bIndent <= entityIndent) {
          entityId = null;
          entityIndent = -1;
        }
      }

      result.set(i + 1, { entityId, section, ruleId });
      continue;
    }

    // Если вышли за пределы сущности по отступу (например, начался attribute на другом уровне)
    if (entityId && entityIndent >= 0 && indent < entityIndent) {
      entityId = null;
      entityIndent = -1;
    }

    result.set(i + 1, { entityId, section, ruleId });
  }

  return result;
}
