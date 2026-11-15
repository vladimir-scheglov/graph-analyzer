import { replaceValueInLine } from "../insert";
import type { WidgetContext, WidgetDef } from "../types";

const REF_FIELDS = new Set(["entity", "inherits", "side1", "side2", "linkage"]);

function findCandidates(
  ctx: WidgetContext,
  field: string,
  value: string,
): Array<{ fqid: string; domain: string }> {
  const idx = ctx.index;
  if (!idx) return [];
  const lower = value.toLowerCase();
  const cur = ctx.currentDomain.toLowerCase();
  const out: Array<{ fqid: string; domain: string }> = [];

  if (field === "linkage") {
    for (const l of idx.entityLinkages || []) {
      if (l.domainId.toLowerCase() === cur) continue;
      if (l.id.toLowerCase() !== lower) continue;
      out.push({ fqid: `${l.domainId}/${l.id}`, domain: l.domainId });
    }
  } else {
    for (const key of Object.keys(idx.entitiesByFqid || {})) {
      const e = idx.entitiesByFqid[key];
      if (e.domainId.toLowerCase() === cur) continue;
      if (e.entityId.toLowerCase() !== lower) continue;
      out.push({ fqid: e.fqid, domain: e.domainId });
    }
  }
  return out;
}

function valueExistsLocally(
  ctx: WidgetContext,
  field: string,
  value: string,
): boolean {
  if (value.includes("/")) return true;
  const idx = ctx.index;
  if (!idx) return true;
  const local = `${ctx.currentDomain}/${value}`.toLowerCase();
  if (field === "linkage") {
    return idx.entityLinkages.some(
      (l) => `${l.domainId}/${l.id}`.toLowerCase() === local,
    );
  }
  return !!idx.entitiesByFqid[local];
}

export const fixMissingFqidWidget: WidgetDef = {
  id: "fix-missing-fqid",
  title: "Отсутствующая ссылка",
  priority: 95,
  getActions(ctx) {
    if (!ctx.fieldName || !REF_FIELDS.has(ctx.fieldName)) return [];
    const value = (ctx.fieldValue || "").trim().replace(/^["']|["']$/g, "");
    if (!value || value.includes("/")) return [];
    if (valueExistsLocally(ctx, ctx.fieldName, value)) return [];

    const candidates = findCandidates(ctx, ctx.fieldName, value);
    if (candidates.length === 0) return [];

    return candidates.slice(0, 4).map((c) => ({
      id: "fix-" + c.fqid,
      label: "→ " + c.domain.split(".")[0] + "/…",
      icon: "travel_explore",
      hint: `Заменить на ${c.fqid}`,
      run: (cc, ed, m) => {
        replaceValueInLine(ed, m, cc.currentLine, value, c.fqid);
      },
    }));
  },
};
