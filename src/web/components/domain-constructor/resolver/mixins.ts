import type { ModelIndexLike } from "./ref-resolver";
import { normalizeFqid } from "./ref-resolver";

/**
 * Резолвер миксинов.
 *
 * L2-упрощение: поддерживаем только `linkage` (атрибуты) и `view.add/delete`
 * (без recursive replace — то уходит в «Код»).
 *
 * `useForChild: true` — миксин наследуется дочерними сущностями
 * (см. evo_003.txt).
 */

export interface ResolvedMixin {
  id: string;
  type: "linkage" | "view";
  weight?: number;
  useForChild: boolean;
  /** Для type: linkage — откуда встраиваются данные. */
  sourceEntityFqid?: string;
  /** Для type: view — какое представление расширяется. */
  views?: unknown[];
}

export class MixinResolver {
  constructor(private modelIndex: ModelIndexLike) {}

  /** Миксины, применимые к сущности: собственные + useForChild от родителей. */
  resolveForEntity(entityFqid: string): ResolvedMixin[] {
    const norm = normalizeFqid(entityFqid);
    const direct = this.readMixins(norm);
    const inherited: ResolvedMixin[] = [];

    // useForChild: пройти по родительской цепочке
    const visited = new Set<string>([norm]);
    let current = norm;
    while (true) {
      const entity = this.modelIndex.entitiesByFqid[current] as
        | { inherits?: string | null }
        | undefined;
      const parent = entity?.inherits ? normalizeFqid(entity.inherits) : null;
      if (!parent || visited.has(parent)) break;
      visited.add(parent);
      const parentMixins = this.readMixins(parent);
      for (const m of parentMixins) {
        if (m.useForChild) inherited.push(m);
      }
      current = parent;
    }

    // Дедупликация по id
    const seen = new Set<string>();
    return [...direct, ...inherited].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  /** Все миксины (для формы «Примеси»). */
  listAll(): ResolvedMixin[] {
    const mixins = (this.modelIndex as any).mixins as
      | Array<{
          id: string;
          type: "linkage" | "view";
          weight?: number;
          useForChild: boolean;
          sourceEntityFqid?: string;
          views?: unknown[];
        }>
      | undefined;
    return (mixins ?? []).map((m) => ({
      id: m.id,
      type: m.type,
      weight: m.weight,
      useForChild: m.useForChild ?? true,
      sourceEntityFqid: m.sourceEntityFqid,
      views: m.views,
    }));
  }

  // ============ Внутреннее ============

  private readMixins(entityFqid: string): ResolvedMixin[] {
    const raw = this.modelIndex.mixinsByEntityFqid[entityFqid] as
      | Array<{
          id: string;
          type: string;
          weight?: number;
          useForChild?: boolean;
          sourceEntityFqid?: string;
          views?: unknown[];
        }>
      | undefined;
    if (!raw) return [];
    return raw
      .filter((m) => m.type === "linkage" || m.type === "view")
      .map((m) => ({
        id: m.id,
        type: m.type as "linkage" | "view",
        weight: m.weight,
        useForChild: m.useForChild ?? true,
        sourceEntityFqid: m.sourceEntityFqid,
        views: m.views,
      }));
  }
}
