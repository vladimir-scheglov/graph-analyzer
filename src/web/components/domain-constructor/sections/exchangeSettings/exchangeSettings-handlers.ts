import type { YamlDocument } from "../../yaml/document";

export function enableExchange(doc: YamlDocument): void {
  if (!doc.get(["exchangeSettings"])) {
    doc.set(["exchangeSettings"], { enable: true, entities: {} });
  } else {
    doc.set(["exchangeSettings", "enable"], true);
  }
}

export function disableExchange(doc: YamlDocument): void {
  if (!doc.get(["exchangeSettings"])) return;
  doc.set(["exchangeSettings", "enable"], false);
}

export function updateExchangeTop(
  doc: YamlDocument,
  field: "label" | "description" | "noCmsSync" | "enable",
  value: unknown,
): void {
  if (!doc.get(["exchangeSettings"])) {
    doc.set(["exchangeSettings"], {});
  }
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["exchangeSettings", field] as any);
  } else {
    doc.set(["exchangeSettings", field], value);
  }
}

export function updateAttributeFormat(
  doc: YamlDocument,
  type: "Date" | "Time" | "Timestamp" | "TimestampRange",
  value: string,
): void {
  if (!doc.get(["exchangeSettings"])) doc.set(["exchangeSettings"], {});
  if (!value) {
    doc.doc.deleteIn(["exchangeSettings", "attributeFormats", type] as any);
  } else {
    doc.set(["exchangeSettings", "attributeFormats", type], value);
  }
}

// ============ entities ============

export function enableEntityExchange(
  doc: YamlDocument,
  entityId: string,
): void {
  if (!doc.get(["exchangeSettings"])) doc.set(["exchangeSettings"], {});
  if (!doc.get(["exchangeSettings", "entities"]))
    doc.set(["exchangeSettings", "entities"], {});
  doc.set(["exchangeSettings", "entities", entityId], { enable: true });
}

export function disableEntityExchange(
  doc: YamlDocument,
  entityId: string,
): void {
  if (!doc.get(["exchangeSettings", "entities", entityId])) return;
  doc.doc.deleteIn(["exchangeSettings", "entities", entityId] as any);
}

export function updateEntityExchangeField(
  doc: YamlDocument,
  entityId: string,
  field: string,
  value: unknown,
): void {
  if (!doc.get(["exchangeSettings", "entities", entityId])) return;
  if (value === undefined || value === null || value === "") {
    doc.doc.deleteIn(["exchangeSettings", "entities", entityId, field] as any);
  } else {
    doc.set(["exchangeSettings", "entities", entityId, field], value);
  }
}
