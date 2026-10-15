import type { LinkageData } from "../../shared/types";
import { isFQID } from "./fqid";

export interface RawLinkage {
  id: string;
  name?: string;
  type?: string;
  side1?: string;
  side2?: string;
  nameFrom?: { side1?: string; side2?: string };
}

export interface LinkageProcessor {
  (link: LinkageData): void;
}

export function processLinkages(
  sourceDomainId: string,
  linkages: RawLinkage[],
  filePath: string,
  domainExists: (id: string) => boolean,
  onLink: LinkageProcessor,
): void {
  for (const linkage of linkages) {
    if (!linkage || !linkage.id) continue;

    if (linkage.side1) {
      tryCreateLink(
        sourceDomainId,
        linkage.side1,
        linkage,
        filePath,
        "side1",
        domainExists,
        onLink,
      );
    }
    if (linkage.side2) {
      tryCreateLink(
        sourceDomainId,
        linkage.side2,
        linkage,
        filePath,
        "side2",
        domainExists,
        onLink,
      );
    }
  }
}

function tryCreateLink(
  sourceDomainId: string,
  fqid: string,
  linkage: RawLinkage,
  filePath: string,
  side: "side1" | "side2",
  domainExists: (id: string) => boolean,
  onLink: LinkageProcessor,
): void {
  const fqidInfo = isFQID(fqid);
  if (!fqidInfo) return;

  const targetDomainId = fqidInfo.domainId;
  if (
    targetDomainId.trim().toLowerCase() === sourceDomainId.trim().toLowerCase()
  )
    return;

  const side1Raw = linkage.side1 || "";
  const side2Raw = linkage.side2 || "";
  const extractDomain = (raw: string, fallback: string): string => {
    if (!raw) return fallback;
    const slash = raw.indexOf("/");
    return slash > 0 ? raw.slice(0, slash) : fallback;
  };

  const link: LinkageData = {
    id: `${sourceDomainId}_${targetDomainId}_${linkage.id}_${side}`,
    originalId: linkage.id,
    name: linkage.name || linkage.id,
    type: linkage.type || "unknown",
    source: sourceDomainId,
    target: targetDomainId,
    sourceFile: filePath,
    nameFrom: linkage.nameFrom || {},
    sourceEntity: side1Raw,
    targetEntity: side2Raw,
    side1Domain: extractDomain(side1Raw, sourceDomainId),
    side2Domain: extractDomain(side2Raw, sourceDomainId),
    side1Raw,
    side2Raw,
    fqidRef: {
      fullFQID: fqid,
      propertyPath: `linkages.${side}`,
      propertyName: side,
    },
  };

  onLink(link);
}
