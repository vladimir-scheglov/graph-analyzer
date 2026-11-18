import type { YamlDocument } from "../../yaml/document";
import { findViewIndex } from "./views-handlers";

// ============ table.columns (для tree — то же место, что list) ============

export function addTreeColumn(doc: YamlDocument, viewId: string): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const cols = doc.get(["views", vIdx, "table", "columns"]);
  const i = Array.isArray(cols) ? cols.length : 0;
  doc.set(["views", vIdx, "table", "columns", i], {
    id: `column${i + 1}`,
    attribute: "",
  });
}

export function removeTreeColumn(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn(["views", vIdx, "table", "columns", i] as any);
}

export function updateTreeColumnField(
  doc: YamlDocument,
  viewId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(["views", vIdx, "table", "columns", i, field], value);
}

// ============ filter[] — массив по сущностям ============

export function addTreeFilterEntity(
  doc: YamlDocument,
  viewId: string,
  entityFqid: string,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const arr = doc.get(["views", vIdx, "table", "filter"]);
  const i = Array.isArray(arr) ? arr.length : 0;
  doc.set(["views", vIdx, "table", "filter", i], {
    entity: entityFqid,
    attributes: { type: "all" },
    linkages: { type: "all" },
  });
}

export function removeTreeFilterEntity(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn(["views", vIdx, "table", "filter", i] as any);
}

export function updateTreeFilterAttributesType(
  doc: YamlDocument,
  viewId: string,
  i: number,
  type: "all" | "specific",
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  if (type === "all") {
    doc.set(["views", vIdx, "table", "filter", i, "attributes"], {
      type: "all",
    });
  } else {
    const existing = doc.get([
      "views",
      vIdx,
      "table",
      "filter",
      i,
      "attributes",
      "use",
    ]);
    doc.set(["views", vIdx, "table", "filter", i, "attributes"], {
      type: "specific",
      use: existing ?? [],
    });
  }
}

export function addTreeFilterAttribute(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const use = doc.get([
    "views",
    vIdx,
    "table",
    "filter",
    i,
    "attributes",
    "use",
  ]);
  const j = Array.isArray(use) ? use.length : 0;
  doc.set(
    ["views", vIdx, "table", "filter", i, "attributes", "type"],
    "specific",
  );
  doc.set(["views", vIdx, "table", "filter", i, "attributes", "use", j], {
    attribute: "",
  });
}

export function removeTreeFilterAttribute(
  doc: YamlDocument,
  viewId: string,
  i: number,
  j: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn([
    "views",
    vIdx,
    "table",
    "filter",
    i,
    "attributes",
    "use",
    j,
  ] as any);
}

export function updateTreeFilterAttribute(
  doc: YamlDocument,
  viewId: string,
  i: number,
  j: number,
  attrId: string,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(
    ["views", vIdx, "table", "filter", i, "attributes", "use", j, "attribute"],
    attrId,
  );
}

// linkages — аналогично
export function updateTreeFilterLinkagesType(
  doc: YamlDocument,
  viewId: string,
  i: number,
  type: "all" | "specific",
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  if (type === "all") {
    doc.set(["views", vIdx, "table", "filter", i, "linkages"], { type: "all" });
  } else {
    const existing = doc.get([
      "views",
      vIdx,
      "table",
      "filter",
      i,
      "linkages",
      "use",
    ]);
    doc.set(["views", vIdx, "table", "filter", i, "linkages"], {
      type: "specific",
      use: existing ?? [],
    });
  }
}

export function addTreeFilterLinkage(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const use = doc.get(["views", vIdx, "table", "filter", i, "linkages", "use"]);
  const j = Array.isArray(use) ? use.length : 0;
  doc.set(
    ["views", vIdx, "table", "filter", i, "linkages", "type"],
    "specific",
  );
  doc.set(["views", vIdx, "table", "filter", i, "linkages", "use", j], {
    linkage: "",
    linkAttributes: [],
    linkedEntity: [],
  });
}

export function removeTreeFilterLinkage(
  doc: YamlDocument,
  viewId: string,
  i: number,
  j: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn([
    "views",
    vIdx,
    "table",
    "filter",
    i,
    "linkages",
    "use",
    j,
  ] as any);
}

export function updateTreeFilterLinkage(
  doc: YamlDocument,
  viewId: string,
  i: number,
  j: number,
  linkageId: string,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(
    ["views", vIdx, "table", "filter", i, "linkages", "use", j, "linkage"],
    linkageId,
  );
}

// ============ sortingBy ============

export function addTreeSortingColumn(doc: YamlDocument, viewId: string): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const cols = doc.get(["views", vIdx, "table", "sortingBy", "columns"]);
  const i = Array.isArray(cols) ? cols.length : 0;
  doc.set(["views", vIdx, "table", "sortingBy", "columns", i], {
    column: "",
    sorting: "",
  });
}

export function removeTreeSortingColumn(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn(["views", vIdx, "table", "sortingBy", "columns", i] as any);
}

export function updateTreeSortingColumn(
  doc: YamlDocument,
  viewId: string,
  i: number,
  field: "column" | "sorting",
  value: string,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(["views", vIdx, "table", "sortingBy", "columns", i, field], value);
}

export function updateTreeDefaultSorting(
  doc: YamlDocument,
  viewId: string,
  column: string | undefined,
  direction: "asc" | "desc" | undefined,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  if (!column) {
    doc.doc.deleteIn(["views", vIdx, "table", "sortingBy", "defaults"] as any);
    return;
  }
  doc.set(["views", vIdx, "table", "sortingBy", "defaults"], {
    column,
    direction: direction ?? "asc",
  });
}
