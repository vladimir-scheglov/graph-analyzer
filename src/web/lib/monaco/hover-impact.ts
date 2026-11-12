import type {
  AttributeRecord,
  EntityLinkage,
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

export function buildLinkageHoverMarkdown(
  linkage: EntityLinkage,
  index: ModelIndex,
): string {
  const lines: string[] = [];
  lines.push(
    `**${linkage.id}**${linkage.name && linkage.name !== linkage.id ? ` — ${linkage.name}` : ""}`,
  );
  lines.push("");
  const dir = linkage.undirected ? "↔" : "→";
  lines.push(
    `\`${linkage.type}\` · \`${linkage.side1Fqid.split("/").pop()}\` ${dir} \`${linkage.side2Fqid.split("/").pop()}\``,
  );

  if (linkage.nameFrom?.side1 || linkage.nameFrom?.side2) {
    lines.push("");
    if (linkage.nameFrom.side1)
      lines.push(`- 1 → 2: «${linkage.nameFrom.side1}»`);
    if (linkage.nameFrom.side2)
      lines.push(`- 2 → 1: «${linkage.nameFrom.side2}»`);
  }

  if (linkage.attributes && linkage.attributes.length > 0) {
    lines.push("");
    lines.push(`**Атрибуты связи (${linkage.attributes.length})**:`);
    for (const a of linkage.attributes.slice(0, 8)) {
      lines.push(
        `- \`${a.id}\` — ${a.dataType}${a.description ? ` · ${a.description}` : ""}`,
      );
    }
    if (linkage.attributes.length > 8)
      lines.push(`- …ещё ${linkage.attributes.length - 8}`);
  }

  // Где используется — все источники, где эта связь упомянута
  const refs: string[] = [];
  const shortId = linkage.id.toLowerCase();

  const matchesRef = (raw: string | undefined | null): boolean => {
    if (!raw) return false;
    const r = raw.toLowerCase();
    const id = r.includes("/") ? r.split("/").pop()! : r;
    return id === shortId;
  };

  for (const w of index.viewWidgets || []) {
    if (w.domainId === linkage.domainId && w.type === "linkage") {
      if (matchesRef(w.linkage))
        refs.push(`виджет \`${w.id}\` во \`${w.parentViewId}\``);
    }
  }
  for (const t of index.trees || []) {
    if (t.domainId !== linkage.domainId) continue;
    const walk = (children: any[] | undefined): boolean => {
      if (!children) return false;
      for (const c of children) {
        if (matchesRef(c.linkage)) return true;
        if (walk(c.children)) return true;
      }
      return false;
    };
    if (walk(t.hierarchy.children)) refs.push(`дерево \`${t.id}\``);
  }
  for (const tl of index.transitiveLinkages || []) {
    if (tl.domainId !== linkage.domainId) continue;
    const walk = (joins: any[] | undefined): boolean => {
      if (!joins) return false;
      for (const j of joins) {
        if (matchesRef(j.linkage)) return true;
        if (walk(j.joins)) return true;
      }
      return false;
    };
    if (walk(tl.joins)) refs.push(`транзитивная связь \`${tl.id}\``);
  }
  for (const a of index.actions || []) {
    if (a.domainId === linkage.domainId && matchesRef(a.linkage))
      refs.push(`действие \`${a.id}\``);
  }
  for (const m of index.mixins || []) {
    if (m.domainId === linkage.domainId && matchesRef(m.linkageFqid))
      refs.push(`примесь \`${m.id}\``);
  }
  for (const r of index.dataRules || []) {
    if (r.domainId === linkage.domainId && matchesRef(r.linkage))
      refs.push(`правило \`${r.id}\``);
  }
  for (const f of index.viewTableFilters || []) {
    if (f.domainId !== linkage.domainId) continue;
    if (f.linkages.some((fl) => fl.linkage && matchesRef(fl.linkage))) {
      refs.push(`фильтр view \`${f.viewId}\``);
    }
  }

  if (refs.length > 0) {
    lines.push("");
    lines.push(`**Используется (${refs.length})**:`);
    for (const r of refs.slice(0, 8)) lines.push(`- ${r}`);
    if (refs.length > 8) lines.push(`- …ещё ${refs.length - 8}`);
  }

  lines.push("");
  lines.push("_Ctrl+Click → перейти к определению_");
  return lines.join("\n");
} 