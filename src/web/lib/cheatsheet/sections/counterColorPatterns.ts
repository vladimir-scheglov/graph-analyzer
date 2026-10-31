import type { CheatsheetSection } from "../types";

export const counterColorPatterns: CheatsheetSection = {
  id: "counterColorPatterns",
  label: "Цветовые схемы счётчиков",
  icon: "timelapse",
  docsRef: "§ Цветовые схемы — стр. 303–305",
  md: `
# Цветовые схемы счётчиков (counterColorPatterns)

## Назначение

Пороги, при которых счётчик (\`dataType: Counter\`) меняет цвет с жёлтого на красный.

## Обязательные поля

| Поле | Описание |
|---|---|
| \`id\` | Data ID |
| \`red\` | Порог красного |
| \`yellow\` | Порог жёлтого |

## Формат значений

- **Проценты**: \`60%\`, \`40%\`
- **Время**: \`1w2d3h5m\` (недели/дни/часы/минуты)

Правило: \`yellow < red\`. Если равны — ошибка.

## Пример: по процентам

\`\`\`yaml
counterColorPatterns:
  - id: counterColorPercentage
    red: "60%"
    yellow: "40%"
\`\`\`

## Пример: по времени

\`\`\`yaml
counterColorPatterns:
  - id: counterColorTime
    red: "1w2d3h5m"
    yellow: "2d"
\`\`\`

## Использование в виджете

\`\`\`yaml
views:
  - id: viewTask
    type: entity
    widgets:
      - id: counterDeadline
        type: attribute
        attribute: deadlineCounter
        counterColorPattern: counterColorTime
\`\`\`

## Использование в колонке списка

\`\`\`yaml
table:
  columns:
    - id: counterCol
      attribute: deadlineCounter
      counterColorPattern: counterColorPercentage
\`\`\`

См. рецепт **Счётчик с цветовой шкалой**.
`,
};
