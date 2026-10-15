import type { FQIDReference } from "../../shared/types";
import { isFQID } from "./fqid";

export interface ReferenceCallback {
  (ref: FQIDReference): void;
}

export function findFQIDReferences(
  obj: any,
  currentDomainId: string,
  filePath: string,
  callback: ReferenceCallback,
  currentPath = "",
): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const arrayPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
      if (typeof item === "object" && item !== null) {
        findFQIDReferences(
          item,
          currentDomainId,
          filePath,
          callback,
          arrayPath,
        );
      } else if (typeof item === "string") {
        checkFQIDValue(item, currentDomainId, filePath, arrayPath, callback);
      }
    });
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    const propertyPath = currentPath ? `${currentPath}.${key}` : key;
    if (typeof value === "string") {
      checkFQIDValue(value, currentDomainId, filePath, propertyPath, callback);
    } else if (typeof value === "object" && value !== null) {
      findFQIDReferences(
        value,
        currentDomainId,
        filePath,
        callback,
        propertyPath,
      );
    }
  }
}

function checkFQIDValue(
  value: string,
  currentDomainId: string,
  filePath: string,
  propertyPath: string,
  callback: ReferenceCallback,
): void {
  if (!value || typeof value !== "string") return;
  const fqidMatch = isFQID(value);
  if (!fqidMatch) return;

  const normalizedTarget = fqidMatch.domainId.trim().toLowerCase();
  const normalizedCurrent = currentDomainId.trim().toLowerCase();
  if (normalizedTarget === normalizedCurrent) return;

  callback({
    sourceDomainId: currentDomainId,
    targetDomainId: fqidMatch.domainId,
    targetEntityId: fqidMatch.entityId,
    fullFQID: value,
    filePath,
    propertyPath,
    propertyName: getPropertyName(propertyPath),
  });
}

function getPropertyName(propertyPath: string): string {
  const parts = propertyPath.split(".");
  return parts[parts.length - 1];
}
