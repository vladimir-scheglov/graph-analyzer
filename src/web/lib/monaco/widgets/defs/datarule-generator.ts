import { insertRawAt } from "../insert";
import type { WidgetContext, WidgetDef } from "../types";

const EFFECTS = [
  "readonly",
  "hidden",
  "required",
  "default",
  "allowed",
] as const;

function buildRule(effect: string, entityId: string): string {
  const head = [
    "target: entity",
    `entity: ${entityId}`,
    `condition: !rql \${1:true}`,
    "rule:",
    `  effect: ${effect}`,
    "  attributes:",
    "    - attribute: ${2:myAttr}",
  ];
  return head.join("\n");
}

function pickEntityId(ctx: WidgetContext): string {
  if (ctx.entity) return ctx.entity.entityId;
  if (ctx.index) {
    const local = ctx.index.entities.find(
      (e: any) => e.domainId === ctx.currentDomain,
    );
    if (local) return local.entityId;
  }
  return "${1:MyEntity}";
}

export const dataruleGeneratorWidget: WidgetDef = {
  id: "datarule-generator",
  title: "Правило данных",
  priority: 78,
  getActions(ctx) {
    if (ctx.section !== "dataRules") return [];
    const hasRule = ctx.blockLines.some((ln) =>
      /^\s*rule\s*:/.test(ctx.model.getLineContent(ln)),
    );
    if (hasRule) return [];

    const entityId = pickEntityId(ctx);
    const lastLine = ctx.blockLines[ctx.blockLines.length - 1];
    const indent = ctx.currentIndent + "  ";

    return EFFECTS.map((e) => ({
      id: "rule-" + e,
      label: e,
      icon: "rule",
      run: (_c, ed, m) => {
        insertRawAt(ed, m, lastLine, indent, buildRule(e, entityId));
      },
    }));
  },
};
