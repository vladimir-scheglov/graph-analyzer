import type { GeneratorProfile } from "./types";

export const DOMAIN_SCOPE_PROFILES: ReadonlySet<GeneratorProfile> =
  new Set<GeneratorProfile>([
    "domain-extras",
    "enum-workflow-builder",
    "ui-status-colors",
    "exchange-settings",
    "counter-color",
  ]);

export function isDomainScopeProfile(p: GeneratorProfile): boolean {
  return DOMAIN_SCOPE_PROFILES.has(p);
}
