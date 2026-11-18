import type { YamlDocument } from "../../yaml/document";
import { findViewIndex } from "../views/views-handlers";

// ============ FILTER ============

export function setFilterAttributesType(
  doc: YamlDocument,
  viewId: string,
  type: "all" | "specific",
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const filter = doc.get(["views", vIdx, "table", "filter"]) as any;
  if (type === "all") {
    doc.set(["views", vIdx, "table", "filter", "attributes"], { type: "all" });
  } else {
    doc.set(["views", vIdx, "table", "filter", "attributes"], {
      type: "specific",
      use: filter?.attributes?.use ?? [],
    });
  }
}

export function addFilterAttribute(doc: YamlDocument, viewId: string): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(["views", vIdx, "table", "filter", "attributes", "type"], "specific");
  doc.appendToArray(["views", vIdx, "table", "filter", "attributes", "use"], {
    attribute: "",
  });
}

export function removeFilterAttribute(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn([
    "views",
    vIdx,
    "table",
    "filter",
    "attributes",
    "use",
    i,
  ] as any);
}

export function updateFilterAttribute(
  doc: YamlDocument,
  viewId: string,
  i: number,
  attrId: string,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(
    ["views", vIdx, "table", "filter", "attributes", "use", i, "attribute"],
    attrId,
  );
}

export function setFilterLinkagesType(
  doc: YamlDocument,
  viewId: string,
  type: "all" | "specific",
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const filter = doc.get(["views", vIdx, "table", "filter"]) as any;
  if (type === "all") {
    doc.set(["views", vIdx, "table", "filter", "linkages"], { type: "all" });
  } else {
    doc.set(["views", vIdx, "table", "filter", "linkages"], {
      type: "specific",
      use: filter?.linkages?.use ?? [],
    });
  }
}

export function addFilterLinkage(doc: YamlDocument, viewId: string): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  const use = doc.get(["views", vIdx, "table", "filter", "linkages", "use"]);
  const i = Array.isArray(use) ? use.length : 0;
  doc.set(["views", vIdx, "table", "filter", "linkages", "type"], "specific");
  doc.set(["views", vIdx, "table", "filter", "linkages", "use", i], {
    linkage: "",
    link_attributes: [],
    linkedEntity: [],
  });
}

export function removeFilterLinkage(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn([
    "views",
    vIdx,
    "table",
    "filter",
    "linkages",
    "use",
    i,
  ] as any);
}

export function updateFilterLinkageField(
  doc: YamlDocument,
  viewId: string,
  i: number,
  field: string,
  value: unknown,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(
    ["views", vIdx, "table", "filter", "linkages", "use", i, field],
    value,
  );
}

// ============ SORTING ============

export function addSortingColumn(doc: YamlDocument, viewId: string): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.appendToArray(["views", vIdx, "table", "sortingBy", "columns"], {
    column: "",
    sorting: "",
  });
}

export function removeSortingColumn(
  doc: YamlDocument,
  viewId: string,
  i: number,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.doc.deleteIn(["views", vIdx, "table", "sortingBy", "columns", i] as any);
}

export function updateSortingColumn(
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

export function updateDefaultSorting(
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

// ============ REFRESH ============

export function setRefreshMode(
  doc: YamlDocument,
  viewId: string,
  mode: "manual" | "auto" | "all",
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(["views", vIdx, "table", "refresh", "mode"], mode);
}

export function updateRefreshDefaults(
  doc: YamlDocument,
  viewId: string,
  field: "enabled" | "unit" | "interval",
  value: unknown,
): void {
  const vIdx = findViewIndex(doc, viewId);
  if (vIdx < 0) return;
  doc.set(["views", vIdx, "table", "refresh", "defaults", field], value);
}
