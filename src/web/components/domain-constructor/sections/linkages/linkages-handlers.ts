import type { YamlDocument } from "../../yaml/document";
import { findLinkageIndex } from "../entities/entity-handlers";

// ============ CRUD ============

export function addLinkage(
  doc: YamlDocument,
  data: {
    id: string;
    side1: string;
    side2: string;
    type: "1_1" | "1_n" | "n_n";
    name?: string;
    undirected?: boolean;
  },
): void {
  const arr = doc.get(["linkages"]);
  const idx = Array.isArray(arr) ? arr.length : 0;
  doc.set(["linkages", idx], {
    id: data.id,
    ...(data.name ? { name: data.name } : {}),
    side1: data.side1,
    side2: data.side2,
    type: data.type,
    ...(data.type === "n_n" && data.undirected ? { undirected: true } : {}),
  });
}

export function updateLinkageField(
  doc: YamlDocument,
  linkageId: string,
  field: string,
  value: unknown,
): void {
  const idx = findLinkageIndex(doc, linkageId);
  if (idx < 0) return;
  if (value === undefined) {
    doc.doc.deleteIn(["linkages", idx, field] as any);
  } else {
    doc.set(["linkages", idx, field], value);
  }
}

export function updateLinkageNameFrom(
  doc: YamlDocument,
  linkageId: string,
  side: "side1" | "side2",
  value: string,
): void {
  const idx = findLinkageIndex(doc, linkageId);
  if (idx < 0) return;
  doc.set(["linkages", idx, "nameFrom", side], value);
}

export function deleteLinkage(doc: YamlDocument, linkageId: string): void {
  const idx = findLinkageIndex(doc, linkageId);
  if (idx < 0) return;
  doc.doc.deleteIn(["linkages", idx] as any);
}

// ============ Валидация ============

export function validateLinkageId(id: string): string | null {
  if (!id) return "Идентификатор не может быть пустым";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) {
    return "Только латинские буквы, цифры и _; начинается с буквы";
  }
  if (id.length > 63) return "Не более 63 символов";
  return null;
}

// ============ Семантика ============

export function isSelfLinkage(side1: string, side2: string): boolean {
  return side1.toLowerCase() === side2.toLowerCase();
}

export function isUndirectedApplicable(type: string): boolean {
  return type === "n_n";
}

// ============ Проверки перед сохранением ============

export interface LinkageValidation {
  errors: string[];
  warnings: string[];
}

export function validateLinkageDraft(draft: {
  id: string;
  side1: string;
  side2: string;
  type: "1_1" | "1_n" | "n_n";
  undirected?: boolean;
  nameFrom?: { side1?: string; side2?: string };
  existingIds: Set<string>;
}): LinkageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const idErr = validateLinkageId(draft.id);
  if (idErr) errors.push(idErr);
  if (draft.existingIds.has(draft.id)) errors.push("ID уже используется");
  if (!draft.side1) errors.push("Не указана сущность стороны 1");
  if (!draft.side2) errors.push("Не указана сущность стороны 2");
  if (draft.undirected && draft.type !== "n_n") {
    errors.push("Ненаправленная связь возможна только для типа n_n");
  }

  // Для направленной связи nameFrom.side1 и nameFrom.side2 должны различаться
  if (!draft.undirected && draft.nameFrom) {
    const s1 = (draft.nameFrom.side1 ?? "").trim();
    const s2 = (draft.nameFrom.side2 ?? "").trim();
    if (s1 && s2 && s1.toLowerCase() === s2.toLowerCase()) {
      warnings.push(
        "Для направленной связи глагольные формы сторон должны различаться",
      );
    }
  }

  // Симметричная — одна и та же сущность на обеих сторонах
  if (isSelfLinkage(draft.side1, draft.side2)) {
    if (draft.type === "1_1") {
      warnings.push("Симметричная связь 1-1 — обычно не имеет смысла");
    }
  }

  return { errors, warnings };
}
