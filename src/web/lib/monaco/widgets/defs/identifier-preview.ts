import { useGraphStore } from "../../../../state/useGraphStore";
import type { WidgetDef } from "../types";

function generateSample(attr: any): string {
  const now = new Date();
  const prefix = attr.defaultPrefix || "ID";
  const inc = attr.incrementTemplate || "0000";
  let s = attr.template || "{@prefix}-{@inc}";
  s = s
    .replace(/\{@prefix\}/g, prefix)
    .replace(/\{@YYYY\}/g, String(now.getFullYear()))
    .replace(/\{@YY\}/g, String(now.getFullYear()).slice(-2))
    .replace(/\{@MM\}/g, String(now.getMonth() + 1).padStart(2, "0"))
    .replace(/\{@DD\}/g, String(now.getDate()).padStart(2, "0"))
    .replace(/\{@inc\}/g, "1".padStart(inc.length || 1, "0"));
  return s;
}

export const identifierPreviewWidget: WidgetDef = {
  id: "identifier-preview",
  title: "Identifier",
  priority: 88,
  getActions(ctx) {
    if (!ctx.attribute) return [];
    if (ctx.fieldName !== "dataType") return [];
    if (ctx.fieldValue !== "Identifier") return [];
    const sample = generateSample(ctx.attribute);
    return [
      {
        id: "id-preview",
        label: sample,
        icon: "visibility",
        hint: "Пример значения Identifier. Клик — копировать.",
        run: () => {
          navigator.clipboard
            .writeText(sample)
            .then(() => {
              useGraphStore.getState().showSnackbar(`Скопировано: ${sample}`);
            })
            .catch(() => {
              /* ignore */
            });
        },
      },
    ];
  },
};
