import { entities } from "./sections/entities";
import { linkages } from "./sections/linkages";
import { views } from "./sections/views";
import { widgets } from "./sections/widgets";
import { actions } from "./sections/actions";
import { dataRules } from "./sections/dataRules";
import { dataTypes } from "./sections/dataTypes";
import { mixins } from "./sections/mixins";
import { inheritance } from "./sections/inheritance";
import { trees } from "./sections/trees";
import { uiRules } from "./sections/uiRules";
import { sequences } from "./sections/sequences";
import { menus } from "./sections/menus";
import { medias } from "./sections/medias";
import { exchangeSettings } from "./sections/exchangeSettings";
import { transitiveLinkages } from "./sections/transitiveLinkages";
import { counterColorPatterns } from "./sections/counterColorPatterns";

// P1: секции-справочники
import { validationErrors } from "./sections/validation-errors";
import { fieldReference } from "./sections/field-reference";
import { controlMatrix } from "./sections/control-matrix";
import { systemAttributes } from "./sections/system-attributes";
import { reservedNames } from "./sections/reserved-names";

// ── Рецепты ──
import { filterInList } from "./recipes/filter-in-list";
import { conditionalHide } from "./recipes/conditional-hide";
import { identifierFromDictionary } from "./recipes/identifier-from-dictionary";
import { transitiveLinkage as transitiveLinkageRecipe } from "./recipes/transitive-linkage";
import { treeView } from "./recipes/tree-view";
import { mixinCrossDomain } from "./recipes/mixin-cross-domain";
import { counterColor } from "./recipes/counter-color";
import { uiRuleColumn } from "./recipes/ui-rule-column";
import { exchangeApi } from "./recipes/exchange-api";

// P1: новые рецепты
import { importWithIdentification } from "./recipes/import-with-identification";
import { multilingualSchema } from "./recipes/multilingual-schema";
import { linkedObjectsGroups } from "./recipes/linked-objects-groups";
import { splitTreeCatalog } from "./recipes/split-tree-catalog";
import { accessRules } from "./sections/accessRules";
import { permissions } from "./sections/permissions";
import { localizations } from "./sections/localizations";
import { uiPresets } from "./sections/uiPresets";

import type { CheatsheetRegistry } from "./types";

export type {
  CheatsheetSection,
  CheatsheetRecipe,
  CheatsheetRegistry,
} from "./types";

export const CHEATSHEET: CheatsheetRegistry = {
  sections: [
    // ── Данные ──
    entities,
    dataTypes,
    sequences,
    counterColorPatterns,
    trees,
    transitiveLinkages,
    // ── Модель ──
    linkages,
    mixins,
    inheritance,
    // ── Интерфейс ──
    views,
    widgets,
    uiPresets,
    actions,
    menus,
    medias,
    // ── Правила ──
    dataRules,
    uiRules,
    accessRules,
    permissions,
    validationErrors,
    // ── Обмен ──
    exchangeSettings,
    localizations,
    // ── Справочники ──
    fieldReference,
    controlMatrix,
    systemAttributes,
    reservedNames,
  ],
  recipes: [
    filterInList,
    conditionalHide,
    identifierFromDictionary,
    transitiveLinkageRecipe,
    treeView,
    splitTreeCatalog,
    mixinCrossDomain,
    counterColor,
    uiRuleColumn,
    exchangeApi,
    importWithIdentification,
    multilingualSchema,
    linkedObjectsGroups,
  ],
};
export function getAllCheatsheetItems() {
  return [
    ...CHEATSHEET.sections.map((s) => ({
      kind: "section" as const,
      id: s.id,
      label: s.label,
      icon: s.icon,
      md: s.md,
      group: s.group,
    })),
    ...CHEATSHEET.recipes.map((r) => ({
      kind: "recipe" as const,
      id: r.id,
      label: r.title,
      icon: "auto_awesome",
      md: r.md,
    })),
  ];
}

export function getRecipesForSection(sectionId: string) {
  return CHEATSHEET.recipes.filter((r) => r.sections.includes(sectionId));
}

/**
 * Секции, сгруппированные по полю `group`.
 * Для будущего сайдбара (P2.12). Сейчас не используется UI,
 * но готово к подключению.
 */
export const SECTION_GROUPS: Array<{
  id: string;
  label: string;
  sections: typeof CHEATSHEET.sections;
}> = (() => {
  const order = ["data", "model", "ui", "rules", "exchange", "__refs__"];
  const labels: Record<string, string> = {
    data: "Данные",
    model: "Модель",
    ui: "Интерфейс",
    rules: "Правила",
    exchange: "Обмен",
    __refs__: "Справочники",
  };

  const buckets = new Map<string, typeof CHEATSHEET.sections>();
  for (const s of CHEATSHEET.sections) {
    // секции без group попадают в «Справочники», если id начинается с
    // одного из справочных, иначе — в «Данные» как fallback.
    let key = s.group;
    if (!key) {
      const refIds = new Set([
        "field-reference",
        "control-matrix",
        "system-attributes",
        "reserved-names",
        "validation-errors",
      ]);
      key = refIds.has(s.id) ? "__refs__" : "data";
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(s);
  }

  return order
    .filter((k) => buckets.has(k))
    .map((k) => ({
      id: k,
      label: labels[k] || k,
      sections: buckets.get(k)!,
    }));
})();
