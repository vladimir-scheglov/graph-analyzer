import type { EntityRecord, EntityIndex } from "../types";

export function entityKey(domainId: string, entityId: string): string {
  return domainId.toLowerCase() + "/" + entityId.toLowerCase();
}

export function resolveEntityRef(
  ref: string | null | undefined,
  currentDomainId: string,
): { domainId: string; entityId: string } | null {
  if (!ref || typeof ref !== "string") return null;
  const slash = ref.indexOf("/");
  if (slash > 0) {
    return { domainId: ref.slice(0, slash), entityId: ref.slice(slash + 1) };
  }
  return { domainId: currentDomainId, entityId: ref };
}

export function buildEntityIndex(entities: EntityRecord[]): EntityIndex {
  const byKey = new Map<string, EntityRecord>();
  entities.forEach((e) => {
    byKey.set(entityKey(e.domainId, e.entityId), e);
  });

  const children = new Map<string, EntityRecord[]>();
  entities.forEach((e) => {
    if (!e.inherits) return;
    const ref = resolveEntityRef(e.inherits, e.domainId);
    if (!ref) return;
    const parentKey = entityKey(ref.domainId, ref.entityId);
    if (!children.has(parentKey)) children.set(parentKey, []);
    children.get(parentKey)!.push(e);
  });

  return { byKey, children };
}
