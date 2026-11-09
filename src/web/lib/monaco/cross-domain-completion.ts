// src/web/lib/monaco/cross-domain-completion.ts
import type { ModelIndex, EntityLinkage } from "../../../shared/model-types";

/**
 * Резолвит «противоположную» сущность для ссылки. Работает в трёх
 * случаях, которые раньше не покрывались:
 *   1. view — entity-view с `entity: X`
 *   2. view — list-view с `source.entity: X`
 *   3. view — nested (modal/panel/page), у которого owning-entity находится
 *      через цепочку parentViewId
 *
 * Возвращает FQID сущности, к которой можно применять автокомплит
 * для `control.columns[].attribute`, `linkage.attributes[]` и т.д.
 */
export function resolveOwningEntityFqid(
  viewId: string,
  currentDomain: string,
  index: ModelIndex | null,
): string | null {
  if (!index) return null;
  const schema = index.schemasByDomain[currentDomain];
  if (!schema) return null;

  const currentLower = currentDomain.toLowerCase();

  // 1. Прямой view с entity / source.entity
  const direct = schema.sections.views.items.find((v: any) => v.id === viewId);
  if (direct) {
    const raw = direct.entity || direct.sourceEntity;
    if (raw) {
      const s = String(raw);
      return s.includes("/")
        ? s.toLowerCase()
        : `${currentLower}/${s}`.toLowerCase();
    }
  }

  // 2. Nested-view: ищем parentViewId в allViews и рекурсивно
  const all = schema.allViews || [];
  const node = all.find((v) => v.id === viewId);
  if (!node) return null;
  if (!node.parentViewId) return null;

  return resolveOwningEntityFqid(node.parentViewId, currentDomain, index);
}

/**
 * Резолвит FQID сущности-«соседа» для widget.linkage: то, с кем связана
 * owning-entity через linkage.
 */
export function resolveLinkageTargetEntityFqid(
  linkageRef: string,
  owningEntityFqid: string | null,
  currentDomain: string,
  index: ModelIndex | null,
): string | null {
  if (!linkageRef || !index) return null;

  const slash = linkageRef.indexOf("/");
  const domain =
    slash > 0
      ? linkageRef.slice(0, slash).toLowerCase()
      : currentDomain.toLowerCase();
  const id = slash > 0 ? linkageRef.slice(slash + 1) : linkageRef;

  const linkage = index.entityLinkages.find(
    (l) => l.domainId.toLowerCase() === domain && l.id === id,
  );
  if (!linkage) return null;

  if (!owningEntityFqid) {
    // Fallback — берём side2
    return linkage.side2Fqid;
  }
  const owner = owningEntityFqid.toLowerCase();
  if (linkage.side1Fqid.toLowerCase() === owner) return linkage.side2Fqid;
  if (linkage.side2Fqid.toLowerCase() === owner) return linkage.side1Fqid;

  // owning-entity не участвует в linkage — вернуть null, чтобы не подсказывать
  return null;
}

export function findLinkage(
  ref: string,
  currentDomain: string,
  index: ModelIndex | null,
): EntityLinkage | null {
  if (!index) return null;
  const slash = ref.indexOf("/");
  const domain =
    slash > 0 ? ref.slice(0, slash).toLowerCase() : currentDomain.toLowerCase();
  const id = slash > 0 ? ref.slice(slash + 1) : ref;
  return (
    index.entityLinkages.find(
      (l) => l.domainId.toLowerCase() === domain && l.id === id,
    ) || null
  );
}
