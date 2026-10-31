import type { CheatsheetRecipe } from "../types";

export const conditionalHide: CheatsheetRecipe = {
  id: "conditional-hide",
  title: "Скрыть атрибут по условию",
  description: "Через dataRules с эффектом hidden и RQL-условием",
  sections: ["dataRules", "entities"],
  md: `
# Скрыть атрибут по условию

## Что делаем

Показываем поле только в определённом статусе / роли / значении другого поля.

## Шаги

1. Откройте секцию \`dataRules\`.
2. Создайте правило с \`target: entity\`.
3. Укажите RQL-условие в \`condition\`.
4. Эффект \`hidden\` + список атрибутов.

## Пример: скрыть секретное поле для не-критичных инцидентов

\`\`\`yaml
dataRules:
  - id: hidden_secret
    name: Скрыть детали
    target: entity
    entity: Incident
    condition: !rql severity != 'CRITICAL'
    rule:
      effect: hidden
      attributes:
        - attribute: secretDetails
        - attribute: internalNotes
\`\`\`

## RQL-подсказки

- Сравнение: \`@doc.status = 'NEW'\`
- Список: \`@doc.severity IN ['CRITICAL', 'HIGH']\`
- Роль: \`hasRole('admin')\`
- Пользователь: \`@CurrentUser.id = @doc.ownerId\`
- Дата: \`@CurrentDate >= '2025-01-01'\`

## Важно

- \`hidden\` + \`required\` на одном атрибуте → ошибка при создании (нельзя заполнить скрытое обязательное).
- \`hidden\` не работает для типа \`Counter\`.
`,
};
