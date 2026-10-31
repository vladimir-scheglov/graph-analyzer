import type { CheatsheetSection } from "../types";
import { FIELD_DEFINITIONS } from "../field-meta";

/**
 * Группировка контекстов FIELD_DEFINITIONS по логическим секциям схемы.
 * Ключи — заголовки групп в шпаргалке. Значения — ключи FIELD_DEFINITIONS.
 */
const FIELD_GROUPS: Array<{ title: string; contexts: string[] }> = [
  {
    title: "Сущности и атрибуты",
    contexts: [
      "entity",
      "attribute",
      "attributeConstraint",
      "arrayItem",
      "calculation",
      "prefixRule",
      "prefixRuleSource",
      "sortingItem",
      "sortingByItem",
      "identificationItem",
      "identificationRuleItem",
      "reconciliationItem",
      "reconciliationDefaultItem",
      "reconciliationMergeStrategy",
      "projectionItem",
      "searchingItem",
      "searchingAttributesItem",
      "graphView",
      "treeNodeType",
      "treeNodeOf",
      "externals",
      "override",
      "overrideAttribute",
      "bindAlias",
    ],
  },
  {
    title: "Связи",
    contexts: ["linkage", "linkageAttribute", "nameFrom"],
  },
  {
    title: "Типы данных",
    contexts: ["dataType", "enumValue", "workflowStatus", "transition"],
  },
  {
    title: "Представления и карточки",
    contexts: [
      "view",
      "viewNested",
      "viewButton",
      "viewButtonControl",
      "viewButtonAction",
      "viewMenuAction",
      "viewFooterAction",
      "viewActionPanelItem",
      "viewTab",
      "viewPinnedView",
      "viewGroupComponent",
      "viewGroupLayout",
      "inheritSettings",
      "viewDashboardLayout",
    ],
  },
  {
    title: "Виджеты",
    contexts: [
      "widget",
      "viewWidgetControl",
      "viewWidgetLinkageControl",
      "viewWidgetLinkageColumn",
      "viewWidgetLinkageAttribute",
      "viewWidgetLinkageAttributes",
      "viewWidgetLinkageAttributeControl",
      "viewWidgetActionControl",
      "viewWidgetConversation",
      "viewWidgetDragDropContext",
      "viewWidgetInclude",
      "viewWidgetIncludeEntity",
      "viewWidgetIncludeLinkage",
    ],
  },
  {
    title: "Таблица, фильтр, сортировка",
    contexts: [
      "viewTable",
      "viewTableColumn",
      "viewTableColumnLayout",
      "viewTableColumnWidth",
      "viewTableColumnControl",
      "viewTableColumnActions",
      "viewTableColumnAggregate",
      "viewTableFilter",
      "viewTableFilterAttributes",
      "viewTableFilterAttributesUse",
      "viewTableFilterLinkages",
      "viewTableFilterLinkagesUse",
      "viewTableSortingBy",
      "viewTableSortingByColumn",
      "viewTableSortingByDefault",
      "viewTablePaging",
      "viewTableRefresh",
      "viewTableRefreshDefaults",
      "viewTableAction",
      "viewTableActionItem",
      "viewTableEmpty",
    ],
  },
  {
    title: "Действия",
    contexts: [
      "action",
      "actionValue",
      "actionControl",
      "actionAutomation",
      "actionTransition",
      "actionOpenBoardsFromGraph",
      "actionBulk",
      "actionBulkAttributes",
      "actionBulkLinkages",
      "actionBulkAttributeUse",
      "actionBulkLinkageUse",
      "actionBulkSettings",
      "actionHooks",
      "actionHookLifecycle",
      "actionHookArtifacts",
      "actionHookNotify",
    ],
  },
  {
    title: "Правила данных",
    contexts: [
      "dataRule",
      "dataRuleRule",
      "dataRuleAttributeAction",
      "dataRuleLinkageAction",
      "dataRuleNested",
      "dataRuleNestedAttribute",
      "dataRuleNestedItem",
    ],
  },
  {
    title: "UI Rules и пресеты",
    contexts: [
      "uiRule",
      "uiRuleContext",
      "uiRuleRule",
      "uiRuleWidget",
      "uiRuleGroup",
      "uiRuleColumn",
      "uiRuleNested",
      "uiRuleNestedAttribute",
      "uiRuleNestedItem",
      "uiPreset",
    ],
  },
  {
    title: "Деревья и транзитивные связи",
    contexts: [
      "tree",
      "treeHierarchy",
      "treeChildren",
      "treeSorting",
      "treeSortingBy",
      "treeSortingByBy",
      "transitiveLinkage",
      "transitiveJoin",
      "transitiveJoinSearch",
    ],
  },
  {
    title: "Меню и медиа",
    contexts: ["menuRoot", "menuItem", "media"],
  },
  {
    title: "Примеси",
    contexts: [
      "mixin",
      "mixinView",
      "mixinViewTo",
      "mixinChange",
      "mixinChangeAdd",
      "mixinEntity",
      "mixinPosition",
      "mixinTabRef",
      "mixinActionRef",
      "mixinColumnRef",
    ],
  },
  {
    title: "Обмен данными",
    contexts: [
      "exchangeSettings",
      "exchangeAttributeFormats",
      "exchangeEntity",
      "exchangeEntitySettings",
    ],
  },
  {
    title: "Доступ и разрешения",
    contexts: ["accessRule", "accessRuleItem", "accessRuleException", "permission"],
  },
  {
    title: "Локализации",
    contexts: ["localization", "localizationKey"],
  },
  {
    title: "Последовательности и счётчики",
    contexts: ["sequence", "counterColorPattern"],
  },
];

/** Экранирование `|` в ячейках markdown-таблицы. */
function mdCell(s: string): string {
  return String(s || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Собирает markdown одного контекста (заголовок + таблица полей). */
function buildContextMd(contextKey: string): string {
  const fields = FIELD_DEFINITIONS[contextKey];
  if (!fields || fields.length === 0) return "";

  const lines: string[] = [];
  lines.push(`### \`${contextKey}\``);
  lines.push("");
  lines.push("| Поле | Тип | Обяз. | Описание |");
  lines.push("|---|---|:---:|---|");
  for (const f of fields) {
    const req = f.required ? "✓" : "";
    lines.push(
      `| \`${mdCell(f.name)}\` | ${mdCell(f.type)} | ${req} | ${mdCell(f.description)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** Полный md секции — собирается один раз при импорте модуля. */
const MD = (() => {
  const lines: string[] = [];
  lines.push("# Справочник полей YAML");
  lines.push("");
  lines.push(
    "Все поля по контекстам. **Обязательные** помечены ✓. " +
      "Этот справочник синхронизирован с автокомплитом Monaco — " +
      "список полей берётся из того же источника.",
  );
  lines.push("");

  for (const group of FIELD_GROUPS) {
    const present = group.contexts.filter(
      (c) => FIELD_DEFINITIONS[c] && FIELD_DEFINITIONS[c].length > 0,
    );
    if (present.length === 0) continue;

    lines.push(`## ${group.title}`);
    lines.push("");
    for (const ctx of present) {
      lines.push(buildContextMd(ctx));
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "Всего контекстов: " +
      FIELD_GROUPS.reduce((s, g) => s + g.contexts.length, 0) +
      ". Полный список полей и типов — на вкладке «Автокомплит» в редакторе схем.",
  );
  return lines.join("\n");
})();

export const fieldReference: CheatsheetSection = {
  id: "field-reference",
  label: "Справочник полей",
  icon: "list",
  group: "data",
  md: MD,
};