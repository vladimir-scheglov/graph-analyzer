import yaml from "js-yaml";

export type AttrChangeField =
  | "attribute"
  | "dataType"
  | "itemDataType"
  | "referenceEntity"
  | "itemReferenceEntity";

export interface AttrChange {
  id: string;
  /** Что именно изменилось. Для added/removed — "attribute". */
  field: AttrChangeField;
  /** До (для added — ""). */
  typeA: string;
  /** После (для removed — ""). */
  typeB: string;
  kind: "added" | "removed" | "changed";
}

export interface EntityChange {
  id: string;
  name: string;
  attributes: AttrChange[];
  /** Смена родительской сущности (breaking). null — родителя не было/нет. */
  inheritsChange?: { from: string | null; to: string | null };
  isBreaking: boolean;
}

export interface PublishDiff {
  addedEntities: Array<{ id: string; name: string }>;
  removedEntities: Array<{ id: string; name: string }>;
  changedEntities: EntityChange[];
  hasBreakingChanges: boolean;
}

export function computePublishDiff(
  oldYaml: string,
  newYaml: string,
): PublishDiff {
  const result: PublishDiff = {
    addedEntities: [],
    removedEntities: [],
    changedEntities: [],
    hasBreakingChanges: false,
  };

  if (!oldYaml || !newYaml) return result;

  let oldData: any = {};
  let newData: any = {};
  try {
    // ⚠️ Приводим unknown к any, чтобы TS не ругался на отсутствие свойств
    oldData = (yaml.load(oldYaml) as any) || {};
    newData = (yaml.load(newYaml) as any) || {};
  } catch {
    return result; // Если YAML битый, не крашим публикацию
  }

  const oldEntities: any[] = Array.isArray(oldData.entities)
    ? oldData.entities
    : [];
  const newEntities: any[] = Array.isArray(newData.entities)
    ? newData.entities
    : [];

  // Явно указываем типы для Map
  const oldMap = new Map<string, any>(
    oldEntities.map((e: any) => [String(e.id), e]),
  );
  const newMap = new Map<string, any>(
    newEntities.map((e: any) => [String(e.id), e]),
  );

  // 1. Добавленные
  newMap.forEach((e: any, id: string) => {
    if (!oldMap.has(id)) {
      result.addedEntities.push({ id, name: e.name || id });
    }
  });

  // 2. Удалённые
  oldMap.forEach((e: any, id: string) => {
    if (!newMap.has(id)) {
      result.removedEntities.push({ id, name: e.name || id });
      result.hasBreakingChanges = true; // Удаление сущности — это breaking change
    }
  });

  // 3. Изменённые
  newMap.forEach((newE: any, id: string) => {
    const oldE = oldMap.get(id);
    if (!oldE) return;

    const oldAttrs: any[] = Array.isArray(oldE.attributes)
      ? oldE.attributes
      : [];
    const newAttrs: any[] = Array.isArray(newE.attributes)
      ? newE.attributes
      : [];

    const oldAttrMap = new Map<string, any>(
      oldAttrs.map((a: any) => [String(a.id), a]),
    );
    const newAttrMap = new Map<string, any>(
      newAttrs.map((a: any) => [String(a.id), a]),
    );

    const attrChanges: AttrChange[] = [];
    let attrBreaking = false;

    // ── Удалённые ──
    oldAttrMap.forEach((a: any, aid: string) => {
      if (newAttrMap.has(aid)) return;
      attrChanges.push({
        id: aid,
        field: "attribute",
        typeA: a.dataType || "String",
        typeB: "",
        kind: "removed",
      });
      attrBreaking = true;
    });

    // ── Добавленные + изменённые ──
    newAttrMap.forEach((a: any, aid: string) => {
      const oldA = oldAttrMap.get(aid);
      if (!oldA) {
        attrChanges.push({
          id: aid,
          field: "attribute",
          typeA: "",
          typeB: a.dataType || "String",
          kind: "added",
        });
        return;
      }

      // Нормализуем undefined/null/"" → null, чтобы не ловить ложные
      // изменения вида `undefined → null`.
      const dtA = oldA.dataType || null;
      const dtB = a.dataType || null;
      if (dtA !== dtB) {
        attrChanges.push({
          id: aid,
          field: "dataType",
          typeA: dtA || "",
          typeB: dtB || "",
          kind: "changed",
        });
        attrBreaking = true;
      }

      const itemDtA = oldA.itemDataType || null;
      const itemDtB = a.itemDataType || null;
      if (itemDtA !== itemDtB) {
        attrChanges.push({
          id: aid,
          field: "itemDataType",
          typeA: itemDtA || "",
          typeB: itemDtB || "",
          kind: "changed",
        });
        attrBreaking = true;
      }

      const refA = oldA.referenceEntity || null;
      const refB = a.referenceEntity || null;
      if (refA !== refB) {
        attrChanges.push({
          id: aid,
          field: "referenceEntity",
          typeA: refA || "",
          typeB: refB || "",
          kind: "changed",
        });
        attrBreaking = true;
      }

      const itemRefA = oldA.itemReferenceEntity || null;
      const itemRefB = a.itemReferenceEntity || null;
      if (itemRefA !== itemRefB) {
        attrChanges.push({
          id: aid,
          field: "itemReferenceEntity",
          typeA: itemRefA || "",
          typeB: itemRefB || "",
          kind: "changed",
        });
        attrBreaking = true;
      }
    });

    // ── inherits ──
    const inheritsA = typeof oldE.inherits === "string" ? oldE.inherits : null;
    const inheritsB = typeof newE.inherits === "string" ? newE.inherits : null;
    const inheritsChanged = inheritsA !== inheritsB;

    if (attrChanges.length > 0 || inheritsChanged) {
      const isBreaking = attrBreaking || inheritsChanged;
      result.changedEntities.push({
        id,
        name: newE.name || id,
        attributes: attrChanges,
        inheritsChange: inheritsChanged
          ? { from: inheritsA, to: inheritsB }
          : undefined,
        isBreaking,
      });
      if (isBreaking) result.hasBreakingChanges = true;
    }
  });

  return result;
}
