import type { CheatsheetSection } from "../types";

export const dataRules: CheatsheetSection = {
  id: "dataRules",
  label: "Правила данных",
  icon: "rule",
  docsRef: "§ Правила данных в домене — стр. 376–393",
  md: `
# Правила данных (dataRules)

## Назначение

Условные ограничения: скрыть поле, сделать обязательным, ограничить список допустимых значений.

## Обязательные поля

| Поле | Описание |
|---|---|
| \`id\` | Data ID |
| \`name\` | Название |
| \`target\` | \`entity\` / \`entityAttribute\` / \`linkage\` |
| \`condition\` | RQL-выражение или \`true\` |
| \`rule.effect\` | \`hidden\` / \`readonly\` / \`required\` / \`default\` / \`allowed\` |

## Эффекты

| \`effect\` | Что делает | Когда использовать |
|---|---|---|
| \`hidden\` | Скрыть в UI и API | Атрибут не нужен в этом статусе |
| \`readonly\` | Запретить редактирование | Значение задаётся системой |
| \`required\` | Сделать обязательным | Требуется заполнить в определённом статусе |
| \`default\` | Значение по умолчанию | Подставить значение из RQL |
| \`allowed\` | Ограничить допустимые значения | Фильтр для Reference / Enum |

## Пример: обязательные поля в определённом статусе

\`\`\`yaml
dataRules:
  - id: required_attributes
    name: Обязательные поля
    target: entity
    entity: Incident
    condition: !rql incidentStatus = 'Подтвержден'
    rule:
      effect: required
      attributes:
        - attribute: incidentGuid
          message: "Укажите GUID"
        - attribute: registrationDate
          message: "Укажите дату регистрации"
\`\`\`

## Пример: скрыть поле по условию

\`\`\`yaml
dataRules:
  - id: hidden_secret
    name: Скрыть секретное поле
    target: entity
    entity: Incident
    condition: !rql severity != 'CRITICAL'
    rule:
      effect: hidden
      attributes:
        - attribute: secretDetails
\`\`\`

## Пример: значение по умолчанию из RQL

\`\`\`yaml
dataRules:
  - id: default_author
    name: Автор по умолчанию
    target: entity
    entity: Incident
    condition: true
    rule:
      effect: default
      attributes:
        - attribute: authorId
          expression: !rql SELECT gen_random_uuid()
\`\`\`

## Пример: ограничить список Reference

\`\`\`yaml
dataRules:
  - id: allowed_owner
    name: Только активные пользователи
    target: entity
    entity: Incident
    condition: true
    rule:
      effect: allowed
      attributes:
        - attribute: ownerId
          constraint: !rql @doc.isActive = true
\`\`\`

## Связанные рецепты

- **Скрыть атрибут по условию**
`,
};
