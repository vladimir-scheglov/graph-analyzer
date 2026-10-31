import type { ModelIndex } from "../../../../shared/model-types";
import type { EntityGenerationContext } from "../detect";
import { resolveTargetView } from "./transitive-chain";

export type EntityViewResolution =
  | { mode: "create"; viewId: string; skipHint?: undefined }
  | { mode: "use-existing"; viewId: string; skipHint?: undefined }
  | { mode: "skip-ambiguous"; viewId: null; skipHint: string };

/**
 * Резолвит, куда генератору класть widgets/groups/nested для сущности.
 *
 *   - entity-view ровно один и это `view${E}`  → create (root может создаться или скипнуться по skipExisting)
 *   - entity-view ровно один и это НЕ `view${E}` → use-existing (root НЕ создаётся, всё идёт в этот view)
 *   - entity-view несколько                     → skip-ambiguous (UI не поддерживает выбор для CRUD)
 *   - entity-view нет                            → create (создастся `view${E}`)
 */
export function resolveEntityViewForCrud(
  ctx: EntityGenerationContext,
  index: ModelIndex,
): EntityViewResolution {
  const E = ctx.entity.entityId;
  const standard = `view${E}`;

  const resolved = resolveTargetView(
    index,
    ctx.domainId,
    E,
    ["entity"],
    undefined,
    standard,
  );

  if (resolved.reason === "ambiguous") {
    return {
      mode: "skip-ambiguous",
      viewId: null,
      skipHint:
        `В домене несколько entity-view для «${E}» — ` +
        `генератор не угадывает. Оставьте один или переименуйте в ${standard}`,
    };
  }

  if (resolved.reason === "ok" && resolved.id) {
    if (resolved.id === standard) {
      return { mode: "create", viewId: standard };
    }
    return { mode: "use-existing", viewId: resolved.id };
  }

  // not-found / wrong-type / wrong-entity → создать новый стандартный
  return { mode: "create", viewId: standard };
}

export type ListViewResolution =
  | { mode: "create"; viewId: string; skipHint?: undefined }
  | { mode: "use-existing"; viewId: string; skipHint?: undefined }
  | { mode: "skip-ambiguous"; viewId: null; skipHint: string };

/**
 * Резолвит list-view для меню и для самой генерации списка.
 *
 *   - стандартный `lists_${eLower}` есть → create (пересоздать по обычной логике)
 *   - есть другой list-view этой сущности (ровно один) → use-existing
 *   - несколько → skip-ambiguous
 *   - ни одного → create (создастся стандартный)
 */
export function resolveListViewForCrud(
  ctx: EntityGenerationContext,
  index: ModelIndex,
): ListViewResolution {
  const E = ctx.entity.entityId;
  const standard = `lists_${E.toLowerCase()}`;

  const resolved = resolveTargetView(
    index,
    ctx.domainId,
    E,
    ["list"],
    undefined,
    standard,
  );

  if (resolved.reason === "ambiguous") {
    return {
      mode: "skip-ambiguous",
      viewId: null,
      skipHint:
        `В домене несколько list-view для «${E}» — ` +
        `генератор не угадывает. Оставьте один или переименуйте в ${standard}`,
    };
  }

  if (resolved.reason === "ok" && resolved.id) {
    if (resolved.id === standard) return { mode: "create", viewId: standard };
    return { mode: "use-existing", viewId: resolved.id };
  }

  return { mode: "create", viewId: standard };
}