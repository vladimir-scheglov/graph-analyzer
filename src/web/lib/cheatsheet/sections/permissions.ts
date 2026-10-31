import type { CheatsheetSection } from "../types";

export const permissions: CheatsheetSection = {
  id: "permissions",
  label: "Разрешения",
  icon: "key",
  group: "rules",
  md: `
# Разрешения (permissions)

## Назначение

\`permissions[]\` объявляет **именованные разрешения** в домене. Сами по себе
они ничего не делают — используются в \`accessRules[].*[].permission\` или в
сценариях / API.

## Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`id\` | да | Data ID разрешения. camelCase / snake_case |
| \`name\` | нет | Отображаемое имя |
| \`description\` | нет | Описание |

## Пример

\`\`\`yaml
permissions:
  - id: perm_create_incident
    name: Создание инцидента
    description: Разрешает создавать новые инциденты

  - id: perm_edit_incident
    name: Редактирование инцидента

  - id: perm_close_audit
    name: Закрытие аудита
\`\`\`

## Использование

### В accessRules

\`\`\`yaml
accessRules:
  - target: entity
    entity: Incident
    create:
      - kind: permission
        permission: perm_create_incident
\`\`\`

### Через API / сценарий

Сценарий / автоматизация проверяет разрешение:

\`\`\`yaml
actions:
  - id: actions_exportAudit
    type: scenario
    scenario: playbook__export
    workerTag: exporter
\`\`\`

В сценарии разрешение проверяется кодом на стороне воркера.

## Правила

- \`id\` уникален в домене.
- Не системное имя (\`id\`, \`label\`, …).
- При переименовании \`id\` ломаются все ссылки в \`accessRules\`.
- Для cross-domain — FQID в \`permission\`: \`<domain.tld>/<permId>\`.

## Связанные секции

- **Правила доступа** — \`accessRules[]\` использует \`permission\`
`,
};
