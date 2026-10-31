import yaml from "js-yaml";

export interface AttrChange {
  id: string;
  typeA: string; // было
  typeB: string; // стало
  kind: "added" | "removed" | "changed";
}

export interface EntityChange {
  id: string;
  name: string;
  attributes: AttrChange[];
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
    if (!oldE) return; // Уже обработали в добавленных

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
    let isBreaking = false;

    // Атрибуты: удалённые
    oldAttrMap.forEach((a: any, aid: string) => {
      if (!newAttrMap.has(aid)) {
        attrChanges.push({
          id: aid,
          typeA: a.dataType || "String",
          typeB: "",
          kind: "removed",
        });
        isBreaking = true;
      }
    });

    // Атрибуты: добавленные и изменённые
    newAttrMap.forEach((a: any, aid: string) => {
      const oldA = oldAttrMap.get(aid);
      if (!oldA) {
        attrChanges.push({
          id: aid,
          typeA: "",
          typeB: a.dataType || "String",
          kind: "added",
        });
      } else if (oldA.dataType !== a.dataType) {
        attrChanges.push({
          id: aid,
          typeA: oldA.dataType,
          typeB: a.dataType,
          kind: "changed",
        });
        isBreaking = true; // Смена типа атрибута — breaking change
      }
    });

    if (attrChanges.length > 0) {
      result.changedEntities.push({
        id,
        name: newE.name || id,
        attributes: attrChanges,
        isBreaking,
      });
      if (isBreaking) result.hasBreakingChanges = true;
    }
  });

  return result;
}
