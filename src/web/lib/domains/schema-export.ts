// src/web/lib/domains/schema-export.ts
import type {
  DomainSchemaSummary,
  ModelIndex,
  SectionKey,
} from "../../../shared/model-types";

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeDomainId(id: string): string {
  return id.replace(/[^a-z0-9.-]/gi, "_");
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
}

// ============ JSON ============

export function exportDomainSchemaJSON(
  schema: DomainSchemaSummary,
  index: ModelIndex,
): void {
  const domainId = schema.domainId;
  const payload = {
    generatedAt: new Date().toISOString(),
    metadata: schema.metadata,
    sections: schema.sections,
    flags: schema.flags,
    allViews: schema.allViews || [],
    // Доп. инфа, которой нет в summary:
    lint: index.lint.lintReport.issues.filter((i) => i.domainId === domainId),
    sonar: index.lint.sonar.byDomain[domainId] || null,
    pii: index.pii.hits.filter((h) =>
      h.entityFqid.toLowerCase().startsWith(domainId.toLowerCase() + "/"),
    ),
  };
  downloadBlob(
    JSON.stringify(payload, null, 2),
    `${safeDomainId(domainId)}-schema-${stamp()}.json`,
    "application/json",
  );
}

// ============ CSV ============

type CsvSection = {
  key: SectionKey;
  header: string[];
  row: (item: any) => string[];
};

const CSV_SECTIONS: CsvSection[] = [
  {
    key: "entities",
    header: ["id", "name", "inherits", "attributesCount"],
    row: (e) => [
      e.id,
      e.name || "",
      e.inherits || "",
      String(e.attributesCount ?? ""),
    ],
  },
  {
    key: "linkages",
    header: ["id", "name", "type", "side1", "side2", "undirected"],
    row: (l) => [
      l.id,
      l.name || "",
      l.type || "",
      l.side1 || "",
      l.side2 || "",
      l.undirected ? "true" : "false",
    ],
  },
  {
    key: "dataTypes",
    header: ["id", "name", "kind", "values", "statuses", "attributes"],
    row: (d) => [
      d.id,
      d.name || "",
      d.kind || "",
      String(d.valuesCount ?? ""),
      String(d.statusesCount ?? ""),
      String(d.attributesCount ?? ""),
    ],
  },
  {
    key: "actions",
    header: ["id", "name", "type"],
    row: (a) => [a.id, a.name || "", a.type || ""],
  },
  {
    key: "views",
    header: ["id", "type", "entity", "label", "isMixin"],
    row: (v) => [
      v.id,
      v.type || "",
      v.entity || "",
      v.label || "",
      v.isMixin ? "true" : "false",
    ],
  },
  {
    key: "menus",
    header: ["id", "route", "label", "type", "view"],
    row: (m) => [
      m.id,
      m.route || "",
      m.label || "",
      m.type || "",
      m.view || "",
    ],
  },
  {
    key: "dataRules",
    header: ["id", "name", "entity", "effect"],
    row: (r) => [r.id, r.name || "", r.entity || "", r.effect || ""],
  },
  {
    key: "sequences",
    header: ["id", "startFrom"],
    row: (s) => [s.id, String(s.startFrom ?? "")],
  },
];

function escapeCsv(v: any): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportDomainSchemaCSV(
  schema: DomainSchemaSummary,
  sectionKey: SectionKey | "all",
): void {
  const sections =
    sectionKey === "all"
      ? CSV_SECTIONS
      : CSV_SECTIONS.filter((s) => s.key === sectionKey);

  const lines: string[] = [];
  for (const s of sections) {
    const section = (schema.sections as any)[s.key];
    if (
      !section ||
      !Array.isArray(section.items) ||
      section.items.length === 0
    ) {
      continue;
    }
    lines.push(`# ${s.key}`);
    lines.push(s.header.join(","));
    for (const item of section.items) {
      lines.push(s.row(item).map(escapeCsv).join(","));
    }
    lines.push("");
  }

  const suffix = sectionKey === "all" ? "all" : sectionKey;
  downloadBlob(
    "\uFEFF" + lines.join("\n"),
    `${safeDomainId(schema.domainId)}-${suffix}-${stamp()}.csv`,
    "text/csv;charset=utf-8",
  );
}
