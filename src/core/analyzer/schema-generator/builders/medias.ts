import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock } from "../types";

export function buildMedias(
  ctx: EntityGenerationContext,
  options: { skipExisting: boolean; hasPage: boolean },
): {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "medias";
    id: string;
    reason: string;
  }>;
} {
  const candidates = [
    { id: "iconsAdd", iconName: "plus" },
    { id: "iconsEdit", iconName: "pencil" },
    { id: "iconsDelete", iconName: "trash" },
    ...(options.hasPage ? [{ id: "iconsView", iconName: "eye" }] : []),
  ];

  const blocks: GeneratedBlock[] = [];
  const skipped: Array<{
    blockId: string;
    section: "medias";
    id: string;
    reason: string;
  }> = [];

  for (const c of candidates) {
    if (ctx.existing.medias.has(c.id)) {
      skipped.push({
        blockId: `media:${c.id}`,
        section: "medias",
        id: c.id,
        reason: "already-exists",
      });
      continue;
    }
    blocks.push({
      blockId: `media:${c.id}`,
      section: "medias",
      groupPath: ["medias"],
      payload: { id: c.id, type: "icon_name", iconName: c.iconName },
      dependsOn: [],
      dependents: [],
      title: `Иконка ${c.id} (${c.iconName})`,
    });
  }
  return { blocks, skipped };
}
