import { useMemo } from "react";
import type { EntitySchema, AttributeSchema } from "../../types";
import type { ModelIndexLike } from "../../resolver/ref-resolver";

export interface InheritedAttribute {
  attr: AttributeSchema;
  from: string;
  origin: "inherited" | "mixin";
}

/**
 * Унаследованные атрибуты: по цепочке `inherits` и от linkage-примесей.
 * Не заходит в собственные атрибуты — только то, чего нет в entity.attributes.
 */
export function useInheritedAttributes(
  entity: EntitySchema,
  modelIndex: ModelIndexLike,
): InheritedAttribute[] {
  return useMemo(() => {
    const ownIds = new Set(entity.attributes.map((a) => a.id));
    const seen = new Set<string>();
    const out: InheritedAttribute[] = [];

    // 1) Родительская цепочка
    let currentFqid: string | null = entity.inherits
      ? entity.inherits.toLowerCase()
      : null;
    const visited = new Set<string>();

    while (currentFqid && !visited.has(currentFqid)) {
      visited.add(currentFqid);
      const parent = modelIndex.entitiesByFqid[currentFqid] as
        | { attributes?: any[]; inherits?: string | null }
        | undefined;
      if (!parent) break;

      for (const attr of parent.attributes ?? []) {
        if (!attr?.id) continue;
        if (ownIds.has(attr.id) || seen.has(attr.id)) continue;
        seen.add(attr.id);
        out.push({
          attr: attr as AttributeSchema,
          from: currentFqid,
          origin: "inherited",
        });
      }

      currentFqid = parent.inherits ? parent.inherits.toLowerCase() : null;
    }

    // 2) Linkage-миксины
    const mixins = (modelIndex.mixinsByEntityFqid[
      entity.inherits?.toLowerCase() ?? ""
    ] ?? []) as any[];
    // (пока упрощённо — берём только миксины текущей сущности; для useForChild
    //  от родителей это делает MixinResolver, но в UI-таблице показываем только
    //  собственные миксины — этого достаточно для read-only-таблицы)
    for (const mixin of mixins) {
      if (mixin.type !== "linkage") continue;
      const sourceFqid = mixin.sourceEntityFqid?.toLowerCase();
      if (!sourceFqid) continue;
      const source = modelIndex.entitiesByFqid[sourceFqid] as
        | { attributes?: any[] }
        | undefined;
      if (!source) continue;
      for (const attr of source.attributes ?? []) {
        if (!attr?.id) continue;
        if (ownIds.has(attr.id) || seen.has(attr.id)) continue;
        seen.add(attr.id);
        out.push({
          attr: attr as AttributeSchema,
          from: mixin.id,
          origin: "mixin",
        });
      }
    }

    return out;
  }, [entity, modelIndex]);
}
