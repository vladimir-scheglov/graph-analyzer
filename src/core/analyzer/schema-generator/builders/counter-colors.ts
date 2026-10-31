// src/core/analyzer/schema-generator/builders/counter-colors.ts
import type { ModelIndex } from "../../../../shared/model-types";
import type { GeneratedBlock } from "../types";

export interface CounterColorsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "counterColorPatterns";
    id: string;
    reason: string;
  }>;
}

export function buildCounterColors(
  domainId: string,
  index: ModelIndex,
  options: {
    red?: string;
    yellow?: string;
    skipExisting: boolean;
  },
): CounterColorsResult {
  const red = options.red || "100%";
  const yellow = options.yellow || "50%";
  const blocks: GeneratedBlock[] = [];
  const skipped: CounterColorsResult["skipped"] = [];

  const existingIds = new Set<string>(
    (index.counterColorPatterns || [])
      .filter((p) => p.domainId === domainId)
      .map((p) => p.id),
  );

  for (const e of index.entities) {
    if (e.domainId !== domainId) continue;
    for (const a of e.attributes) {
      if (a.dataType !== "Counter") continue;

      const id = `${e.entityId}${a.id.charAt(0).toUpperCase()}${a.id.slice(1)}Counter`;
      const blockId = `counterColorPattern:${id}`;

      if (existingIds.has(id)) {
        if (options.skipExisting) {
          skipped.push({
            blockId,
            section: "counterColorPatterns",
            id,
            reason: "already-exists",
          });
        }
        continue;
      }

      blocks.push({
        blockId,
        section: "counterColorPatterns",
        groupPath: ["counterColorPatterns"],
        payload: { id, red, yellow },
        dependsOn: [],
        dependents: [],
        title: `Counter ${id} (red ${red}, yellow ${yellow})`,
      });
    }
  }

  return { blocks, skipped };
}
