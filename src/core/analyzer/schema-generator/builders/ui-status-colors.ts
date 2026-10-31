// src/core/analyzer/schema-generator/builders/ui-status-colors.ts
import type { ModelIndex } from "../../../../shared/model-types";
import type { GeneratedBlock } from "../types";
import type { RawDomainEntry } from "../../model-builder";

const DEFAULT_PALETTE = [
  "#94a3b8", // slate
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
];

interface SemanticColorRule {
  pattern: RegExp;
  color: string;
}

const SEMANTIC_RULES: SemanticColorRule[] = [
  { pattern: /unknown|new|draft|init|pending/i, color: "#94a3b8" },
  { pattern: /active|progress|open|review|in_work/i, color: "#6366f1" },
  { pattern: /done|closed|resolved|success|approved/i, color: "#10b981" },
  { pattern: /critical|high|error|fail|reject/i, color: "#ef4444" },
  { pattern: /cancel|archived|deleted/i, color: "#64748b" },
  { pattern: /low/i, color: "#10b981" },
  { pattern: /medium|mid/i, color: "#f59e0b" },
];

function pickColor(id: string, idx: number, palette: string[]): string {
  for (const rule of SEMANTIC_RULES) {
    if (rule.pattern.test(id)) return rule.color;
  }
  return palette[idx % palette.length];
}

export interface UiStatusColorsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "dataTypes";
    id: string;
    reason: string;
  }>;
}

/**
 * Для каждого dataTypes[] kind=Enum|Workflow, где view[] пуст,
 * генерирует полный payload с заполненным view[].
 *
 * Полный payload нужен, потому что preflight.replace заменит dataType целиком —
 * важно сохранить values/statuses/name/description из rawData.
 */
export function buildUiStatusColors(
  domainId: string,
  index: ModelIndex,
  allDomains: RawDomainEntry[],
  options: {
    palette?: string[];
    skipExisting: boolean;
  },
): UiStatusColorsResult {
  const palette =
    options.palette && options.palette.length > 0
      ? options.palette
      : DEFAULT_PALETTE;

  const blocks: GeneratedBlock[] = [];
  const skipped: UiStatusColorsResult["skipped"] = [];

  const rawDomain = allDomains.find((d) => d.id === domainId);
  const rawTypes: any[] = Array.isArray(rawDomain?.rawData?.dataTypes)
    ? rawDomain.rawData.dataTypes
    : [];
  const rawById = new Map<string, any>();
  for (const rt of rawTypes) {
    if (rt?.id) rawById.set(String(rt.id), rt);
  }

  for (const dt of index.dataTypes) {
    if (dt.domainId !== domainId) continue;
    if (dt.kind !== "Enum" && dt.kind !== "Workflow") continue;

    const blockId = `dataType:${dt.id}`;

    const raw = rawById.get(dt.id);
    const view = Array.isArray(raw?.view) ? raw.view : [];
    if (view.length > 0 && options.skipExisting) {
      skipped.push({
        blockId,
        section: "dataTypes",
        id: dt.id,
        reason: "already-exists",
      });
      continue;
    }

    const members = dt.kind === "Enum" ? dt.values || [] : dt.statuses || [];

    if (members.length === 0) {
      skipped.push({
        blockId,
        section: "dataTypes",
        id: dt.id,
        reason: "no-members",
      });
      continue;
    }

    const newView = members.map((m, i) => ({
      [dt.kind === "Enum" ? "value" : "status"]: m,
      color: pickColor(m, i, palette),
    }));

    const payload: any = {
      id: raw?.id ?? dt.id,
      name: raw?.name ?? dt.name ?? dt.id,
      dataType: raw?.dataType ?? dt.kind,
      ...(raw?.description ? { description: raw.description } : {}),
      ...(dt.kind === "Enum"
        ? { values: raw?.values ?? members.map((id) => ({ id, name: id })) }
        : {
            statuses: raw?.statuses ?? members.map((id) => ({ id, name: id })),
            initial: raw?.initial ?? members[0],
            transitions: raw?.transitions ?? [],
            ...(raw?.finals ? { finals: raw.finals } : {}),
          }),
      view: newView,
    };

    blocks.push({
      blockId,
      section: "dataTypes",
      groupPath: ["dataTypes"],
      payload,
      dependsOn: [],
      dependents: [],
      title: `Colors для ${dt.kind} ${dt.id} (${newView.length})`,
    });
  }

  return { blocks, skipped };
}
