import type {
  AttributeRecord,
  EntityRecord,
  ModelIndex,
} from "../../../shared/model-types";
import { computeFieldLineage } from "../model/field-lineage";

/**
 * Строит markdown для hover на `inherits:` / `attribute:` / `entity:`
 * с полным impact-анализом. Возвращает null, если нечего показать.
 */
export function buildEntityHoverMarkdown(
  entity: EntityRecord,
  index: ModelIndex,
): string {
  const lines: string[] = [];
  lines.push(
    `**${entity.entityId}**${entity.name && entity.name !== entity.entityId ? ` — ${entity.name}` : ""}`,
  );
  if (entity.description) lines.push(entity.description);
  lines.push("");
  lines.push(
    `\`${entity.fqid}\` · ${entity.attributes.length} атрибутов` +
      (entity.inherits
        ? ` · наследует от \`${entity.inherits.split("/").pop()}\``
        : ""),
  );

  // Наследники
  const children = index.entityChildrenByFqid[entity.fqid] || [];
  if (children.length > 0) {
    lines.push("");
    lines.push(
      `**Наследники (${children.length})**: ${children
        .slice(0, 8)
        .map((c) => c.split("/")[1])
        .join(", ")}${children.length > 8 ? "…" : ""}`,
    );
  }

  // Внешние FQID-ссылки
  const externalRefs = index.entities.filter(
    (e) =>
      e.domainId !== entity.domainId &&
      e.attributes.some(
        (a) =>
          a.referenceEntity?.toLowerCase() === entity.fqid.toLowerCase() ||
          a.itemReferenceEntity?.toLowerCase() === entity.fqid.toLowerCase(),
      ),
  );
  if (externalRefs.length > 0) {
    lines.push("");
    lines.push(`**⚠ Внешние ссылки (${externalRefs.length})**:`);
    for (const r of externalRefs.slice(0, 5)) {
      lines.push(`- \`${r.domainId}/${r.entityId}\``);
    }
    if (externalRefs.length > 5) {
      lines.push(`- …ещё ${externalRefs.length - 5}`);
    }
  }

  // PII / lint
  const piiCount = index.pii.hits.filter(
    (h) => h.entityFqid.toLowerCase() === entity.fqid.toLowerCase(),
  ).length;
  const issueCount = index.lint.lintReport.issues.filter(
    (i) => i.entityFqid?.toLowerCase() === entity.fqid.toLowerCase(),
  ).length;
  if (piiCount > 0 || issueCount > 0) {
    lines.push("");
    const badges: string[] = [];
    if (piiCount > 0) badges.push(`🔒 PII: ${piiCount}`);
    if (issueCount > 0) badges.push(`⚠ Issues: ${issueCount}`);
    lines.push(badges.join(" · "));
  }

  lines.push("");
  lines.push("_Ctrl+Click → перейти к определению_");
  return lines.join("\n");
}

export function buildAttributeHoverMarkdown(
  entity: EntityRecord,
  attribute: AttributeRecord,
  index: ModelIndex,
): string {
  const lines: string[] = [];
  lines.push(
    `**${entity.entityId}.${attribute.id}**${attribute.name && attribute.name !== attribute.id ? ` — ${attribute.name}` : ""}`,
  );
  if (attribute.description) lines.push(attribute.description);
  lines.push("");
  lines.push(
    `\`${attribute.dataType}\`${attribute.constraints.length > 0 ? ` · ${attribute.constraints.join(", ")}` : ""}${attribute.readonly ? " · readonly" : ""}`,
  );

  // Field lineage — компактно
  const lineage = computeFieldLineage(entity.fqid, attribute.id, index);
  if (lineage.total > 0) {
    lines.push("");
    lines.push(`**Использование (${lineage.total})**:`);
    const order: Array<keyof typeof lineage.byKind> = [
      "widget",
      "column",
      "dataRule",
      "uiRule",
      "action",
      "sorting",
      "searching",
      "filter",
    ];
    for (const kind of order) {
      const items = lineage.byKind[kind];
      if (items.length === 0) continue;
      lines.push(`- ${kind}: ${items.length}`);
    }
  } else {
    lines.push("");
    lines.push("_⚠ Не используется ни в views, ни в dataRules_");
  }

  // PII
  const pii = index.pii.hits.find(
    (h) =>
      h.entityFqid.toLowerCase() === entity.fqid.toLowerCase() &&
      h.attributeId === attribute.id,
  );
  if (pii) {
    lines.push("");
    lines.push(
      `🔒 **PII** · ${pii.category} · ${pii.severity}${pii.regulation ? ` · ${pii.regulation}` : ""}`,
    );
  }

  lines.push("");
  lines.push("_Ctrl+Click → перейти к определению_");
  return lines.join("\n");
}
