import type { CheatsheetSection } from "../types";

export const uiPresets: CheatsheetSection = {
  id: "uiPresets",
  label: "UI Presets",
  icon: "palette",
  group: "ui",
  md: `
# UI Presets

## Назначение

\`uiPresets[]\` — именованные наборы CSS-свойств. Применяются через
\`uiRules[].rule.presets[]\` и \`widgets[].presets[]\` / \`groups[].presets[]\` /
\`columns[].presets[]\` при \`effect: variant\`.

## Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`id\` | да | Data ID пресета |
| \`name\` | нет | Отображаемое имя |
| \`description\` | нет | Описание |
| \`props\` | да | Словарь свойств |

**\`props\`** — \`{ [cssProperty]: string | number | boolean }\`. Ключи — CSS-свойства
в kebab-case (\`background-color\`, \`font-weight\`) или известные флаги.

## Пример

\`\`\`yaml
uiPresets:
  - id: criticalRed
    description: Красный фон для критичных записей
    props:
      background-color: '#fee2e2'
      color: '#991b1b'
      font-weight: bold

  - id: successGreen
    description: Зелёный для успешных
    props:
      background-color: '#dcfce7'
      color: '#166534'

  - id: collapsed
    description: Свернуть секцию по умолчанию
    props:
      collapsed: true
\`\`\`

## Использование через uiRules

\`\`\`yaml
uiRules:
  - id: highlightCritical
    name: Подсветить критичные
    target: entity_view
    view: viewIncident
    condition: !rql @doc.severity = 'CRITICAL'
    rule:
      effect: variant
      widgets:
        - widget: editors_severity
          presets:
            - criticalRed
      groups:
        - group: blocks_critical
          presets:
            - criticalRed
\`\`\`

## Известные флаги (\`props\`)

Помимо CSS-свойств, есть специальные:

| Флаг | Что делает |
|---|---|
| \`collapsed: true\` | Свернуть группу |
| \`hidden: true\` | Скрыть (альтернатива \`effect: hidden\`) |

## Правила

- \`id\` уникален в домене.
- Пресет не применяется сам по себе — нужен \`uiRules[].effect: variant\` ИЛИ
  явная ссылка \`presets[]\` на widget / group / column.
- Один пресет можно применять к разным элементам.
- Если \`effect: variant\` задан без presets — линтер ругнётся
  \`uirules/variant-without-presets\`.

## CSS-свойства (частые)

\`\`\`
background-color
color
font-weight
font-style
text-decoration
border
border-radius
padding
margin
opacity
\`\`\`

Значения — строки. Числа и булевы для флагов.

## Связанные секции

- **UI Rules** — \`effect: variant\` + \`presets[]\`
`,
};
