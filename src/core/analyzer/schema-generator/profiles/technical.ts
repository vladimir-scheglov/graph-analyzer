import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, GeneratorSectionKey } from "../types";

export interface ProfileResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: GeneratorSectionKey;
    id: string;
    reason: string;
  }>;
}

/**
 * technical — сущности, для которых UI не требуется:
 *   - используются только как Reference-target в других сущностях;
 *   - справочники кодов/статусов, чьё отображение не нужно;
 *   - вспомогательные сущности, которые наполняются автоматизацией.
 *
 * Генерация ничего не создаёт. Профиль существует, чтобы:
 *   1) явно пометить сущность в UI как «UI не требуется» (вместо того, чтобы
 *      пользователь мучительно думал, почему «ничего не сгенерировалось»);
 *   2) в batch-режиме (backlog) записывать в skipped с осмысленной причиной,
 *      а не молча пропускать;
 *   3) в будущем — при регенерации не пытаться «дополнить» её actions/views.
 *
 * Если нужен минимальный entity-view с editors (Reference-target, который
 * открывается в карточке по клику) — используйте профиль `dictionary`.
 */
export function runTechnicalProfile(
  ctx: EntityGenerationContext,
  _options: { skipExisting: boolean },
): ProfileResult {
  const E = ctx.entity.entityId;
  return {
    blocks: [],
    skipped: [
      {
        blockId: `entity:${E}`,
        section: "views",
        id: E,
        reason: "technical-no-ui",
      },
    ],
  };
}
