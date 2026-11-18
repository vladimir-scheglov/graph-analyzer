import type { ModelIndexLike } from "../resolver/ref-resolver";

/**
 * Где именно применяется RQL. Определяет:
 *  - какие @-алиасы доступны (@row / @index только в nested);
 *  - какие атрибуты можно подставлять (entity / attribute / linkage);
 *  - какие FQID-домены доступны в from()/join().
 */

export type RqlPlacement =
  | { kind: "dataRule.condition"; target: "entity"; entityFqid: string }
  | {
      kind: "dataRule.condition";
      target: "entityAttribute";
      entityFqid: string;
      attrId: string;
      nestedType: "table" | "array";
    }
  | { kind: "dataRule.condition"; target: "linkage"; linkageId: string }
  | {
      kind: "dataRule.attribute.expression" | "dataRule.attribute.constraint";
      entityFqid: string;
      attrId: string;
      effect: string;
    }
  | {
      kind: "dataRule.linkage.expression" | "dataRule.linkage.constraint";
      linkageId: string;
      effect: string;
    }
  | {
      kind: "uiRule.condition";
      viewId: string;
      target: "list_view" | "entity_view" | "entity_attribute";
    }
  | { kind: "column.aggregate.condition"; entityFqid: string }
  | { kind: "join.aggregate.condition"; entityFqid: string }
  | { kind: "rqlAttribute"; entityFqid: string };

export interface RqlContext {
  placement: RqlPlacement;
  /** Текущий домен (из metadata.id). */
  currentDomainId: string;
  modelIndex: ModelIndexLike;
}

/** @row / @index доступны только в entityAttribute с nestedType. */
export function allowsRowAlias(ctx: RqlContext): boolean {
  return (
    ctx.placement.kind === "dataRule.condition" &&
    ctx.placement.target === "entityAttribute"
  );
}

export function allowsIndexAlias(ctx: RqlContext): boolean {
  return (
    ctx.placement.kind === "dataRule.condition" &&
    ctx.placement.target === "entityAttribute"
  );
}

/** Есть ли @link alias (только в linkage-контексте). */
export function allowsLinkAlias(ctx: RqlContext): boolean {
  return (
    (ctx.placement.kind === "dataRule.condition" &&
      ctx.placement.target === "linkage") ||
    ctx.placement.kind === "dataRule.linkage.expression" ||
    ctx.placement.kind === "dataRule.linkage.constraint"
  );
}
