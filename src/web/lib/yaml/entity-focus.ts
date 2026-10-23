import type {
  DomainSchemaViewItem,
  ModelIndex,
  TreeRecord,
  TransitiveLinkageRecord,
  TransitiveLinkageJoin,
} from "../../../shared/model-types";
import type { LineMap } from "./line-map";

export type FocusKind = "entity" | "linkage";
export type FocusLevel = "primary" | "secondary" | "tertiary";

export interface FocusTarget {
  kind: FocusKind;
  /** Для entity — entityId (без домена); для linkage — linkageId. */
  id: string;
}

export interface FocusOptions {
  includeTertiary?: boolean;
}

export interface FocusResult {
  lineLevel: Map<number, FocusLevel>;
  relatedLines: number;
  totalLines: number;
}

interface LineRange {
  startLine: number;
  endLine: number;
}

// ============ Диапазоны top-level элементов ============

function buildTopLevelRanges(lineMap: LineMap): Map<string, LineRange> {
  const result = new Map<string, LineRange>();
  for (const section of lineMap.sections) {
    const sectionEndExclusive = section.line + section.linesCount;
    const nodes = section.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const start = node.line;
      const next = nodes[i + 1];
      const end = next ? next.line - 1 : sectionEndExclusive - 1;
      result.set(`${section.key}#${node.id}`, {
        startLine: start,
        endLine: end,
      });
    }
  }
  return result;
}

const FOCUS_RANK: Record<FocusLevel, number> = {
  primary: 3,
  secondary: 2,
  tertiary: 1,
};

function markRange(
  lineLevel: Map<number, FocusLevel>,
  range: LineRange,
  level: FocusLevel,
): void {
  for (let l = range.startLine; l <= range.endLine; l++) {
    const cur = lineLevel.get(l);
    if (!cur || FOCUS_RANK[level] > FOCUS_RANK[cur]) {
      lineLevel.set(l, level);
    }
  }
}

// ============ Хелперы для структурных проверок ============

function normalize(entityIdOrFqid: string, domainId: string): string {
  const trimmed = entityIdOrFqid.trim();
  if (!trimmed) return "";
  if (trimmed.includes("/")) return trimmed.toLowerCase();
  return `${domainId}/${trimmed}`.toLowerCase();
}

function treeHierarchyTouchesEntity(
  node: { entity: string; children?: any[] },
  entityLower: string,
): boolean {
  if (String(node.entity).toLowerCase() === entityLower) return true;
  for (const c of node.children || []) {
    if (treeHierarchyTouchesEntity(c, entityLower)) return true;
  }
  return false;
}

function treeTouchesLinkage(
  node: { children?: any[] },
  linkageIdLower: string,
): boolean {
  for (const c of node.children || []) {
    const lk = String(c.linkage || "").toLowerCase();
    const id = lk.includes("/") ? lk.split("/").pop()! : lk;
    if (id === linkageIdLower) return true;
    if (treeTouchesLinkage(c, linkageIdLower)) return true;
  }
  return false;
}

function transitiveTouchesLinkage(
  joins: TransitiveLinkageJoin[],
  linkageIdLower: string,
): boolean {
  for (const j of joins) {
    const lk = String(j.linkage || "").toLowerCase();
    const id = lk.includes("/") ? lk.split("/").pop()! : lk;
    if (id === linkageIdLower) return true;
    if (j.joins && transitiveTouchesLinkage(j.joins, linkageIdLower))
      return true;
  }
  return false;
}

function viewTouchesEntity(
  v: DomainSchemaViewItem,
  entityLower: string,
  domainId: string,
  index: ModelIndex,
): boolean {
  if (v.type === "entity" && v.entity) {
    return normalize(v.entity, domainId) === entityLower;
  }
  if (v.type === "list" && v.sourceEntity) {
    return normalize(v.sourceEntity, domainId) === entityLower;
  }
  if (v.type === "tree" && v.tree) {
    const tree: TreeRecord | undefined = index.trees.find(
      (t) => t.domainId === domainId && t.id === v.tree,
    );
    if (!tree) return false;
    return treeHierarchyTouchesEntity(tree.hierarchy as any, entityLower);
  }
  return false;
}

function viewTouchesLinkage(
  v: DomainSchemaViewItem,
  linkageIdLower: string,
  domainId: string,
  index: ModelIndex,
): boolean {
  for (const w of index.viewWidgets || []) {
    if (w.domainId !== domainId) continue;
    if (w.parentViewId !== v.id) continue;
    if (w.type === "linkage" && w.linkage) {
      const lk = w.linkage.toLowerCase();
      const id = lk.includes("/") ? lk.split("/").pop()! : lk;
      if (id === linkageIdLower) return true;
    }
  }
  for (const j of index.viewSourceJoins || []) {
    if (j.domainId !== domainId) continue;
    if (j.viewId !== v.id) continue;
    const lk = j.linkage.toLowerCase();
    const id = lk.includes("/") ? lk.split("/").pop()! : lk;
    if (id === linkageIdLower) return true;
  }
  for (const f of index.viewTableFilters || []) {
    if (f.domainId !== domainId) continue;
    if (f.viewId !== v.id) continue;
    for (const lk of f.linkages) {
      if (!lk.linkage) continue;
      const l = lk.linkage.toLowerCase();
      const id = l.includes("/") ? l.split("/").pop()! : l;
      if (id === linkageIdLower) return true;
    }
  }
  return false;
}

// ============ Secondary-ключи ============

function collectSecondaryForEntity(
  entityFqid: string,
  domainId: string,
  index: ModelIndex,
): Array<{ sectionKey: string; id: string }> {
  const out: Array<{ sectionKey: string; id: string }> = [];
  const entityLower = entityFqid.toLowerCase();

  // linkages
  for (const l of index.entityLinkages) {
    if (l.domainId !== domainId) continue;
    if (l.side1Fqid === entityLower || l.side2Fqid === entityLower) {
      out.push({ sectionKey: "linkages", id: l.id });
    }
  }
  // наследники
  for (const e of index.entities) {
    if (e.domainId !== domainId) continue;
    if (e.inherits === entityLower) {
      out.push({ sectionKey: "entities", id: e.entityId });
    }
  }
  // actions
  for (const a of index.actions || []) {
    if (a.domainId !== domainId) continue;
    if (a.entity === entityLower) out.push({ sectionKey: "actions", id: a.id });
  }
  // dataRules
  for (const r of index.dataRules || []) {
    if (r.domainId !== domainId) continue;
    if (r.entity === entityLower)
      out.push({ sectionKey: "dataRules", id: r.id });
  }
  // mixins
  for (const m of index.mixins || []) {
    if (m.domainId !== domainId) continue;
    if (
      m.targetEntityFqid === entityLower ||
      m.sourceEntityFqid === entityLower
    ) {
      out.push({ sectionKey: "mixins", id: m.id });
    }
  }
  // trees
  for (const t of index.trees || []) {
    if (t.domainId !== domainId) continue;
    if (treeHierarchyTouchesEntity(t.hierarchy as any, entityLower)) {
      out.push({ sectionKey: "trees", id: t.id });
    }
  }
  // views
  const schema = index.schemasByDomain?.[domainId];
  if (schema) {
    for (const v of schema.sections.views.items) {
      if (viewTouchesEntity(v, entityLower, domainId, index)) {
        out.push({ sectionKey: "views", id: v.id });
      }
    }
  }
  return out;
}

function collectSecondaryForLinkage(
  linkageId: string,
  domainId: string,
  index: ModelIndex,
): Array<{ sectionKey: string; id: string }> {
  const out: Array<{ sectionKey: string; id: string }> = [];
  const linkageIdLower = linkageId.toLowerCase();

  const linkage = (index.entityLinkages || []).find(
    (l) => l.domainId === domainId && l.id === linkageId,
  );
  if (!linkage) return out;

  // сущности sides
  const side1Entity = index.entitiesByFqid[linkage.side1Fqid];
  if (side1Entity && side1Entity.domainId === domainId) {
    out.push({ sectionKey: "entities", id: side1Entity.entityId });
  }
  const side2Entity = index.entitiesByFqid[linkage.side2Fqid];
  if (
    side2Entity &&
    side2Entity.domainId === domainId &&
    side2Entity.entityId !== side1Entity?.entityId
  ) {
    out.push({ sectionKey: "entities", id: side2Entity.entityId });
  }

  // actions
  for (const a of index.actions || []) {
    if (a.domainId !== domainId) continue;
    if (!a.linkage) continue;
    const lk = a.linkage.toLowerCase();
    const id = lk.includes("/") ? lk.split("/").pop()! : lk;
    if (id === linkageIdLower) out.push({ sectionKey: "actions", id: a.id });
  }
  // dataRules
  for (const r of index.dataRules || []) {
    if (r.domainId !== domainId) continue;
    if (!r.linkage) continue;
    const lk = r.linkage.toLowerCase();
    const id = lk.includes("/") ? lk.split("/").pop()! : lk;
    if (id === linkageIdLower) out.push({ sectionKey: "dataRules", id: r.id });
  }
  // mixins
  for (const m of index.mixins || []) {
    if (m.domainId !== domainId) continue;
    if (!m.linkageFqid) continue;
    const lk = m.linkageFqid.toLowerCase();
    const id = lk.includes("/") ? lk.split("/").pop()! : lk;
    if (id === linkageIdLower) out.push({ sectionKey: "mixins", id: m.id });
  }
  // trees
  for (const t of index.trees || []) {
    if (t.domainId !== domainId) continue;
    if (treeTouchesLinkage(t.hierarchy as any, linkageIdLower)) {
      out.push({ sectionKey: "trees", id: t.id });
    }
  }
  // transitiveLinkages
  for (const tl of index.transitiveLinkages || []) {
    if (tl.domainId !== domainId) continue;
    if (transitiveTouchesLinkage(tl.joins, linkageIdLower)) {
      out.push({ sectionKey: "transitiveLinkages", id: tl.id });
    }
  }
  // views
  const schema = index.schemasByDomain?.[domainId];
  if (schema) {
    for (const v of schema.sections.views.items) {
      if (viewTouchesLinkage(v, linkageIdLower, domainId, index)) {
        out.push({ sectionKey: "views", id: v.id });
      }
    }
  }
  return out;
}

// ============ Публичная функция ============

export function computeFocus(
  target: FocusTarget,
  lineMap: LineMap,
  index: ModelIndex,
  domainId: string,
  content: string,
  options: FocusOptions = {},
): FocusResult {
  const includeTertiary = options.includeTertiary === true;
  const lineLevel = new Map<number, FocusLevel>();
  const ranges = buildTopLevelRanges(lineMap);

  const primaryKey =
    target.kind === "entity"
      ? `entities#${target.id}`
      : `linkages#${target.id}`;
  const primaryRange = ranges.get(primaryKey);
  if (primaryRange) markRange(lineLevel, primaryRange, "primary");

  let secondary: Array<{ sectionKey: string; id: string }> = [];
  if (target.kind === "entity") {
    const fqid = `${domainId}/${target.id}`.toLowerCase();
    secondary = collectSecondaryForEntity(fqid, domainId, index);
  } else {
    secondary = collectSecondaryForLinkage(target.id, domainId, index);
  }

  for (const s of secondary) {
    const r = ranges.get(`${s.sectionKey}#${s.id}`);
    if (r) markRange(lineLevel, r, "secondary");
  }

  if (includeTertiary && target.kind === "entity") {
    const relatedLinkages = secondary
      .filter((s) => s.sectionKey === "linkages")
      .map((s) => s.id);
    const relatedViews = secondary
      .filter((s) => s.sectionKey === "views")
      .map((s) => s.id);

    const fqid = `${domainId}/${target.id}`.toLowerCase();
    const tertiary = collectTertiaryForEntity(
      fqid,
      domainId,
      index,
      relatedLinkages,
      relatedViews,
    );
    for (const s of tertiary) {
      const r = ranges.get(`${s.sectionKey}#${s.id}`);
      if (r) markRange(lineLevel, r, "tertiary");
    }
  }

  const totalLines = content.length === 0 ? 1 : content.split("\n").length;
  return { lineLevel, relatedLines: lineLevel.size, totalLines };
}

// ============ Tertiary-ключи (dataTypes / sequences / counterColorPatterns) ============

function collectTertiaryForEntity(
  entityFqid: string,
  domainId: string,
  index: ModelIndex,
  relatedLinkages: string[],
  relatedViews: string[],
): Array<{ sectionKey: string; id: string }> {
  const out: Array<{ sectionKey: string; id: string }> = [];
  const entityLower = entityFqid.toLowerCase();

  const customTypeIds = new Set(
    (index.dataTypes || [])
      .filter((d) => d.domainId === domainId)
      .map((d) => d.id),
  );
  const sequenceIds = new Set(
    (index.sequences || [])
      .filter((s) => s.domainId === domainId)
      .map((s) => s.id),
  );
  const patternIds = new Set(
    (index.counterColorPatterns || [])
      .filter((p) => p.domainId === domainId)
      .map((p) => p.id),
  );

  const knownDataTypes = new Set<string>();
  const knownSequences = new Set<string>();
  const knownPatterns = new Set<string>();

  const addFromAttr = (a: {
    dataType: string;
    itemDataType?: string;
    sequence?: string;
  }): void => {
    if (a.dataType && customTypeIds.has(a.dataType)) {
      knownDataTypes.add(a.dataType);
    }
    if (a.itemDataType && customTypeIds.has(a.itemDataType)) {
      knownDataTypes.add(a.itemDataType);
    }
    if (a.sequence) {
      const seq = a.sequence.includes("/")
        ? a.sequence.split("/").pop()!
        : a.sequence;
      if (sequenceIds.has(seq)) knownSequences.add(seq);
    }
  };

  const entity = index.entitiesByFqid[entityLower];
  if (entity) {
    for (const a of entity.attributes || []) addFromAttr(a);
  }

  for (const lid of relatedLinkages) {
    const lk = (index.entityLinkages || []).find(
      (l) => l.domainId === domainId && l.id === lid,
    );
    if (lk) for (const a of lk.attributes || []) addFromAttr(a);
  }

  const viewEls = index.viewElementsByDomain?.[domainId];
  if (viewEls) {
    for (const viewId of relatedViews) {
      const elements = viewEls[viewId];
      if (!elements) continue;
      for (const w of elements.widgetsWithType || []) {
        if (w.counterColorPattern && patternIds.has(w.counterColorPattern)) {
          knownPatterns.add(w.counterColorPattern);
        }
      }
      for (const c of elements.columnsWithType || []) {
        if (c.counterColorPattern && patternIds.has(c.counterColorPattern)) {
          knownPatterns.add(c.counterColorPattern);
        }
      }
    }
  }

  knownDataTypes.forEach((id) => out.push({ sectionKey: "dataTypes", id }));
  knownSequences.forEach((id) => out.push({ sectionKey: "sequences", id }));
  knownPatterns.forEach((id) =>
    out.push({ sectionKey: "counterColorPatterns", id }),
  );

  return out;
}