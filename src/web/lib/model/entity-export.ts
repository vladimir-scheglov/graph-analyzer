// src/web/lib/model/entity-export.ts
import type { EntityRecord, ModelIndex } from "../../../shared/model-types";
import type { PiiHit } from "../../../shared/pii-types";
import type { LintIssue } from "../../../shared/lint-types";
import { countMixins, countRefs } from "./entity-filters";

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
}

function escapeCsv(v: any): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface EntityExportContext {
  index: ModelIndex;
  piiByFqid: Map<string, PiiHit[]>;
  issuesByFqid: Map<string, LintIssue[]>;
}

function rowFor(e: EntityRecord, ctx: EntityExportContext): string[] {
  const pii = ctx.piiByFqid.get(e.fqid.toLowerCase()) || [];
  const piiCritical = pii.filter((h) => h.severity === "critical").length;
  const issues = ctx.issuesByFqid.get(e.fqid.toLowerCase()) || [];
  const issueErrors = issues.filter((i) => i.severity === "error").length;

  return [
    e.fqid,
    e.entityId,
    e.name,
    e.domainId,
    e.kind || "regular",
    e.inherits || "",
    String(e.attributes.length),
    String(countRefs(e, ctx.index)),
    String(countMixins(e, ctx.index)),
    String(pii.length),
    String(piiCritical),
    String(issues.length),
    String(issueErrors),
    e.domainTags.join("; "),
  ];
}

export function exportEntitiesCSV(
  entities: EntityRecord[],
  ctx: EntityExportContext,
): void {
  const header = [
    "fqid",
    "entityId",
    "name",
    "domainId",
    "kind",
    "inherits",
    "attributesCount",
    "refsCount",
    "mixinsCount",
    "piiCount",
    "piiCritical",
    "issuesCount",
    "issuesErrors",
    "tags",
  ];
  const lines = [header.join(",")];
  for (const e of entities) {
    lines.push(rowFor(e, ctx).map(escapeCsv).join(","));
  }
  downloadBlob(
    "\uFEFF" + lines.join("\n"),
    `entities-${stamp()}.csv`,
    "text/csv;charset=utf-8",
  );
}

export function exportEntitiesJSON(
  entities: EntityRecord[],
  ctx: EntityExportContext,
): void {
  const payload = entities.map((e) => {
    const pii = ctx.piiByFqid.get(e.fqid.toLowerCase()) || [];
    const issues = ctx.issuesByFqid.get(e.fqid.toLowerCase()) || [];
    return {
      fqid: e.fqid,
      entityId: e.entityId,
      name: e.name,
      description: e.description,
      domainId: e.domainId,
      kind: e.kind || "regular",
      inherits: e.inherits,
      tags: e.domainTags,
      attributes: e.attributes.map((a) => ({
        id: a.id,
        name: a.name,
        dataType: a.dataType,
        dataTypeKind: a.dataTypeKind,
        referenceEntity: a.referenceEntity || null,
        constraints: a.constraints,
        readonly: !!a.readonly,
      })),
      counts: {
        attributes: e.attributes.length,
        refs: countRefs(e, ctx.index),
        mixins: countMixins(e, ctx.index),
        pii: pii.length,
        issues: issues.length,
      },
      pii: pii.map((h) => ({
        attributeId: h.attributeId,
        category: h.category,
        severity: h.severity,
        regulation: h.regulation,
      })),
      issues: issues.map((i) => ({
        ruleId: i.ruleId,
        rule: i.rule,
        severity: i.severity,
        category: i.category,
        message: i.message,
        hint: i.hint || null,
      })),
    };
  });

  downloadBlob(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: entities.length,
        entities: payload,
      },
      null,
      2,
    ),
    `entities-${stamp()}.json`,
    "application/json",
  );
}
