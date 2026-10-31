import type { CheatsheetRecipe } from "../types";

export const counterColor: CheatsheetRecipe = {
  id: "counter-color",
  title: "Счётчик с цветовой шкалой",
  description: "Counter с жёлтым и красным порогом",
  sections: ["counterColorPatterns", "entities", "views"],
  md: `
# Счётчик с цветовой шкалой

## Что делаем

Атрибут-счётчик, который желтеет за 40% до дедлайна и краснеет за 60%.

## Шаги

1. Создайте атрибут \`dataType: Counter\`.
2. Создайте \`counterColorPatterns[]\` запись.
3. Сошлитесь на неё в виджете или колонке.

## 1. Атрибут

\`\`\`yaml
entities:
  - id: Task
    attributes:
      - id: deadlineCounter
        name: До дедлайна
        dataType: Counter
\`\`\`

## 2. Цветовая схема

\`\`\`yaml
counterColorPatterns:
  - id: counterColorPercentage
    red: "60%"
    yellow: "40%"
\`\`\`

## 3. Виджет в карточке

\`\`\`yaml
views:
  - id: viewTask
    type: entity
    entity: Task
    widgets:
      - id: counterDeadline
        type: attribute
        attribute: deadlineCounter
        counterColorPattern: counterColorPercentage
        label: До дедлайна
\`\`\`

## 4. Колонка в списке

\`\`\`yaml
table:
  columns:
    - id: counterCol
      attribute: deadlineCounter
      counterColorPattern: counterColorPercentage
      label: До дедлайна
\`\`\`

## Проверка

Запустите счётчик через API: \`POST /api/.../counter/start\` с указанием \`duration\`. Через 40% времени счётчик пожелтеет, через 60% — покраснеет.

## Ограничение

\`yellow < red\` — иначе ошибка валидации. Если значения в процентах — оба в процентах, если во времени — оба во времени.
`,
};
