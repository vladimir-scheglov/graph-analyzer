import type { FieldState, AttributeSchema } from "../types";
import { InheritanceResolver } from "./inheritance";

/**
 * Вычисление FieldState<T> для полей элементов.
 *
 * Используется в <InheritableField> и <InheritableList>:
 *  - origin: 'own'         — поле задано на элементе;
 *  - origin: 'inherited'   — пришло от родителя, поле read-only
 *                            до тех пор, пока пользователь не переопределит;
 *  - origin: 'overridden'  — пользователь «переопределил» inherited-поле,
 *                            значение редактируется.
 *
 * «Наследование» и «переопределение» — это UI-состояние, в YAML нет
 * отдельного признака. Мы определяем его так:
 *  - если в YAML элемент сам содержит это поле → 'own' (или 'overridden',
 *    если элемент помечен как переопределяющий родителя);
 *  - если поле есть только у родителя → 'inherited'.
 */

export interface FieldStateContext {
  inheritance: InheritanceResolver;
  //modelIndex: ModelIndex;
}

// ============ Атрибуты сущности ============

/**
 * FieldState для полей атрибута.
 * Например, для `name`/`description`/`dataType`/`readonly` унаследованного
 * атрибута origin = 'inherited'.
 */
export function getAttributeFieldState<T>(
  ctx: FieldStateContext,
  entityFqid: string,
  attrId: string,
  field: keyof AttributeSchema,
  ownValue: T | undefined,
): FieldState<T | undefined> {
  const resolved = ctx.inheritance.resolveAttribute(entityFqid, attrId);

  if (!resolved) {
    return { value: ownValue, origin: "own" };
  }

  if (resolved.origin === "own") {
    return { value: ownValue, origin: "own" };
  }

  // Унаследовано — берём значение из родителя
  const parentValue = (resolved.attribute as any)[field] as T | undefined;

  // Если ownValue задан явно (не undefined) — это overridden
  if (ownValue !== undefined) {
    return { value: ownValue, origin: "overridden", from: resolved.from };
  }

  return { value: parentValue, origin: "inherited", from: resolved.from };
}

/**
 * «Можно ли редактировать атрибут?» — нет, если он унаследован
 * и пользователь не нажал «переопределить».
 */
export function isAttributeReadOnly(
  ctx: FieldStateContext,
  entityFqid: string,
  attrId: string,
): boolean {
  const resolved = ctx.inheritance.resolveAttribute(entityFqid, attrId);
  return resolved?.origin !== "own";
}

/**
 * Список «собственных» атрибутов сущности (то, что редактируется).
 * Унаследованные показываются отдельной группой в UI.
 */
export function splitOwnAndInherited(
  ctx: FieldStateContext,
  entityFqid: string,
): {
  own: Array<{ attr: AttributeSchema; id: string }>;
  inherited: Array<{
    attr: AttributeSchema;
    id: string;
    from: string;
    origin: "inherited" | "mixin";
  }>;
} {
  const all = ctx.inheritance.resolveAttributes(entityFqid);
  const own: Array<{ attr: AttributeSchema; id: string }> = [];
  const inherited: Array<{
    attr: AttributeSchema;
    id: string;
    from: string;
    origin: "inherited" | "mixin";
  }> = [];

  for (const [id, resolved] of all) {
    if (resolved.origin === "own") {
      own.push({ attr: resolved.attribute as AttributeSchema, id });
    } else {
      inherited.push({
        attr: resolved.attribute as AttributeSchema,
        id,
        from: resolved.from,
        origin: resolved.origin,
      });
    }
  }
  return { own, inherited };
}

// ============ Универсальный InheritableField ============

/**
 * Для скалярных полей (label, name, description) — origin = 'own',
 * если поле задано на элементе. Наследование касается только `label`
 * (по evo_003.txt: label наследуется, если не задан).
 */
export function getLabelFieldState(
  ctx: FieldStateContext,
  entityFqid: string,
  ownLabel: string | null | undefined,
): FieldState<string | null> {
  if (ownLabel !== undefined && ownLabel !== null) {
    return { value: ownLabel, origin: "own" };
  }

  // label не задан — попробовать найти в родительской цепочке
  const norm = entityFqid.toLowerCase();
  let current = norm;
  const visited = new Set<string>([current]);
  while (true) {
    const entity = (ctx.inheritance as any).modelIndex?.entitiesByFqid?.[
      current
    ] as { inherits?: string | null; label?: string | null } | undefined;
    if (!entity) break;
    if (entity.label) {
      return { value: entity.label, origin: "inherited", from: current };
    }
    const parent = entity.inherits ? entity.inherits.toLowerCase() : null;
    if (!parent || visited.has(parent)) break;
    visited.add(parent);
    current = parent;
  }

  return { value: null, origin: "own" };
}
