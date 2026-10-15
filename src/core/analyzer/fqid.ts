import type { FQIDParts } from "../../shared/types";

const FQID_PATTERN = /^([a-zA-Z0-9][\w.-]*\.[a-zA-Z0-9][\w.-]*)\/(.+)$/;

export function isFQID(value: unknown): FQIDParts | null {
  if (typeof value !== "string") return null;
  const match = value.match(FQID_PATTERN);
  if (!match) return null;
  return { domainId: match[1], entityId: match[2] };
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

export function entityKey(domainId: string, entityId: string): string {
  return domainId.toLowerCase() + "/" + entityId.toLowerCase();
}
