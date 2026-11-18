import type { ModelIndexLike } from "./ref-resolver";
import { normalizeFqid } from "./ref-resolver";
import type { AttributeSchema } from "../types";

/**
 * Резолвер наследования.
 *
 * Приоритеты (по убыванию):
 *   1. own           — собственные атрибуты сущности
 *   2. parent        — по цепочке `inherits` (первый родитель выше остальных)
 *   3. mixin         — по weight (меньше weight = выше приоритет),
 *                      при равенстве — по id (алфавитный порядок).
 *
 * Циклы в inherits не разрываем здесь — их ловит бэкенд (ModelStats.circularInheritance).
 * Но защищаемся от зацикливания через Set.
 */

export interface ResolvedAttribute {
  attribute: AttributeSchema | Record<string, unknown>;
  /** 'own' | FQID родителя | id миксина */
  from: string;
  origin: "own" | "inherited" | "mixin";
}

export class InheritanceResolver {
  constructor(private modelIndex: ModelIndexLike) {}

  /**
   * Все атрибуты сущности с учётом наследования.
   * Возвращает плоскую карту attrId → ResolvedAttribute.
   */
  resolveAttributes(entityFqid: string): Map<string, ResolvedAttribute> {
    const result = new Map<string, ResolvedAttribute>();
    const norm = normalizeFqid(entityFqid);

    // 1) Собственные
    this.walkEntityAttributes(
      norm,
      (attr, attrId, origin, from) => {
        if (!result.has(attrId)) {
          result.set(attrId, { attribute: attr, from, origin });
        }
      },
      "own",
    );

    // 2) Родительская цепочка
    const visited = new Set<string>([norm]);
    let current = norm;
    while (true) {
      const parentFqid = this.getParent(current);
      if (!parentFqid || visited.has(parentFqid)) break;
      visited.add(parentFqid);
      this.walkEntityAttributes(
        parentFqid,
        (attr, attrId, _origin, from) => {
          if (!result.has(attrId)) {
            result.set(attrId, { attribute: attr, from, origin: "inherited" });
          }
        },
        "inherited",
      );
      current = parentFqid;
    }

    // 3) Миксины (только type: linkage — по документации только они добавляют атрибуты)
    const mixins = this.getLinkageMixinsForEntity(norm);
    mixins
      .sort((a, b) => {
        const wa =
          typeof a.weight === "number" ? a.weight : Number.MAX_SAFE_INTEGER;
        const wb =
          typeof b.weight === "number" ? b.weight : Number.MAX_SAFE_INTEGER;
        if (wa !== wb) return wa - wb;
        return a.id.localeCompare(b.id);
      })
      .forEach((mixin) => {
        const sourceEntityFqid = mixin.sourceEntityFqid
          ? normalizeFqid(mixin.sourceEntityFqid)
          : null;
        if (!sourceEntityFqid) return;
        this.walkEntityAttributes(
          sourceEntityFqid,
          (attr, attrId, _origin, from) => {
            if (!result.has(attrId)) {
              result.set(attrId, {
                attribute: attr,
                from: mixin.id,
                origin: "mixin",
              });
            }
          },
          "mixin",
        );
      });

    return result;
  }

  /** Только собственные атрибуты (без наследования). */
  resolveOwnAttributes(entityFqid: string): Map<string, ResolvedAttribute> {
    const result = new Map<string, ResolvedAttribute>();
    const norm = normalizeFqid(entityFqid);
    this.walkEntityAttributes(
      norm,
      (attr, attrId) => {
        result.set(attrId, { attribute: attr, from: norm, origin: "own" });
      },
      "own",
    );
    return result;
  }

  /**
   * Атрибут с учётом наследования. Если атрибут собственный — origin: 'own'.
   * Иначе — inherited/mixin + from.
   */
  resolveAttribute(
    entityFqid: string,
    attrId: string,
  ): ResolvedAttribute | null {
    return this.resolveAttributes(entityFqid).get(attrId) ?? null;
  }

  // ============ Внутреннее ============

  private getParent(entityFqid: string): string | null {
    const entity = this.modelIndex.entitiesByFqid[entityFqid] as
      | { inherits?: string | null }
      | undefined;
    if (!entity?.inherits) return null;
    return normalizeFqid(entity.inherits);
  }

  private walkEntityAttributes(
    entityFqid: string,
    fn: (
      attr: AttributeSchema | Record<string, unknown>,
      attrId: string,
      origin: "own" | "inherited" | "mixin",
      from: string,
    ) => void,
    origin: "own" | "inherited" | "mixin",
  ): void {
    const entity = this.modelIndex.entitiesByFqid[entityFqid] as
      | { attributes?: Array<Record<string, unknown> & { id: string }> }
      | undefined;
    if (!entity?.attributes) return;
    for (const attr of entity.attributes) {
      if (!attr || typeof attr.id !== "string") continue;
      fn(attr, attr.id, origin, entityFqid);
    }
  }

  private getLinkageMixinsForEntity(entityFqid: string): Array<{
    id: string;
    weight?: number;
    sourceEntityFqid?: string;
    type: "linkage" | "view";
  }> {
    const mixins = this.modelIndex.mixinsByEntityFqid[entityFqid] as
      | Array<{
          id: string;
          weight?: number;
          sourceEntityFqid?: string;
          type: string;
        }>
      | undefined;
    if (!mixins) return [];
    return mixins
      .filter((m) => m.type === "linkage")
      .map((m) => ({
        id: m.id,
        weight: m.weight,
        sourceEntityFqid: m.sourceEntityFqid,
        type: "linkage" as const,
      }));
  }
}
