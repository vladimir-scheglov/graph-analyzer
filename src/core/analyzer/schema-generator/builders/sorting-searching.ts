import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock } from "../types";

/** Типы, для которых имеет смысл сортировка (по docs). */
const SORTING_EXCLUDE_TYPES = new Set([
  "Table",
  "Array",
  "Calculation",
  "Attachment",
  "Reference",
  "Configuration",
  "Variable",
  "RQL",
  "Automation",
]);

/** Типы, для которых имеет смысл searching (по docs). */
const SEARCHING_BASE_TYPES = new Set([
  "String",
  "Text",
  "Date",
  "Timestamp",
  "Integer",
  "Uuid",
]);

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export interface SortingSearchingResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "entities";
    id: string;
    reason: string;
    hint?: string;
  }>;
}

/**
 * Генерирует фрагмент `{ id, sorting?, searching? }` для сущности.
 *
 * Семантика:
 *   - sorting есть в YAML → не трогаем;
 *   - searching есть (массив или legacy-объект) → не трогаем;
 *   - обе секции нечего генерить → skip.
 *
 * Сортировка по эвристике: одно правило по первому скалярному атрибуту.
 * Searching по эвристике: все String/Text/Date/Timestamp/Integer/Uuid + custom
 * (Enum/Workflow), кроме Table.
 */
export function buildSortingSearching(
  ctx: EntityGenerationContext,
  options: {
    includeSorting: boolean;
    includeSearching: boolean;
  },
): SortingSearchingResult {
  const E = ctx.entity.entityId;
  const blockId = `entity:${E}`;

  const hasSorting =
    Array.isArray(ctx.entity.sorting) && ctx.entity.sorting.length > 0;
  const hasSearching =
    (Array.isArray(ctx.entity.searching) && ctx.entity.searching.length > 0) ||
    ctx.entity.searchingForm === "object";

  const wantSorting = options.includeSorting && !hasSorting;
  const wantSearching = options.includeSearching && !hasSearching;

  if (!wantSorting && !wantSearching) {
    const bothOff = !options.includeSorting && !options.includeSearching;
    return {
      blocks: [],
      skipped: [
        {
          blockId,
          section: "entities",
          id: E,
          reason: bothOff ? "nothing-to-generate" : "already-exists",
          hint: bothOff
            ? "Включите хотя бы «Сгенерировать sorting» или «Сгенерировать searching» в параметрах профиля"
            : "sorting[] и/или searching[] уже заданы в YAML — удалите их вручную, если нужно перегенерировать",
        },
      ],
    };
  }

  const payload: any = { id: E };

  if (wantSorting) {
    const sortable = ctx.entity.attributes.filter(
      (a) => !SORTING_EXCLUDE_TYPES.has(a.dataType),
    );
    if (sortable.length > 0) {
      // Приоритет: name-like атрибуты первыми, потом остальные.
      const NAME_LIKE = ["name", "label", "title", "subject", "displayName"];
      const preferred = sortable.find((a) => NAME_LIKE.includes(a.id));
      const ordered = preferred
        ? [preferred, ...sortable.filter((a) => a !== preferred)]
        : sortable;
      // Ограничиваем разумно, чтобы не плодить 50 правил
      const limited = ordered.slice(0, 10);

      payload.sorting = limited.map((a) => ({
        id: `sortBy${capitalize(a.id)}`,
        by: [{ attribute: a.id, direction: "asc" }],
      }));
    }
  }

  if (wantSearching) {
    const searchable = ctx.entity.attributes.filter((a) => {
      if (SEARCHING_BASE_TYPES.has(a.dataType)) return true;
      // Enum / Workflow — custom types, kind доступен в ModelIndex.dataTypes,
      // но билдер index не получает. dataTypeKind === "custom" включает
      // Table, но Table в searching не сломает линтер.
      return a.dataTypeKind === "custom";
    });
    if (searchable.length > 0) {
      payload.searching = searchable.map((a) => ({ attribute: a.id }));
    }
  }

  if (!payload.sorting && !payload.searching) {
    return {
      blocks: [],
      skipped: [
        {
          blockId,
          section: "entities",
          id: E,
          reason: "no-suitable-attributes",
          hint: "У сущности нет атрибутов, для которых применимо правило (например, только Table/Array/Calculation)",
        },
      ],
    };
  }

  const parts = [
    payload.sorting ? "sorting" : null,
    payload.searching ? "searching" : null,
  ].filter(Boolean);

  return {
    blocks: [
      {
        blockId,
        section: "entities",
        groupPath: ["entities"],
        payload,
        dependsOn: [],
        dependents: [],
        title: `Обогащение ${E} (${parts.join(" + ")})`,
      },
    ],
    skipped: [],
  };
}
