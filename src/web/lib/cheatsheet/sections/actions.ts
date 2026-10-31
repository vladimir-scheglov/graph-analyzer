import type { CheatsheetSection } from "../types";

export const actions: CheatsheetSection = {
  id: "actions",
  label: "Действия",
  icon: "bolt",
  docsRef: "§ Действия в домене — стр. 396–408",
  md: `
# Действия (actions)

## Назначение

Действие — операция над объектом: открыть карточку, создать, удалить, запустить сценарий.

## Частые типы

| \`type\` | Назначение |
|---|---|
| \`open_modal\` | Создание / редактирование |
| \`open_panel\` | Компактное представление |
| \`open_page\` | Полноэкранная карточка |
| \`open_list\` | Список с контекстом |
| \`open_tree\` | Дерево |
| \`remove\` | Удаление объекта |
| \`bulk\` | Массовое действие в списке |
| \`set_attribute_value\` | Установить значение атрибута |
| \`automation\` | Запуск автоматизации |
| \`scenario\` | Запуск сценария / playbook |

## Пример: создание объекта

\`\`\`yaml
actions:
  - id: actions_createIoc
    name: Добавить
    type: open_modal
    modal: forms_newIoc
    entity: Ioc
    operation: create
\`\`\`

## Пример: открытие панели

\`\`\`yaml
actions:
  - id: actions_openIocPanel
    name: Детали
    type: open_panel
    panel: panels_infoIoc
    entity: Ioc
\`\`\`

## Пример: массовое удаление

\`\`\`yaml
actions:
  - id: actions_bulkRemoveIocs
    name: Удалить
    type: bulk
    entity: Ioc
    operation: remove
\`\`\`

## Пример: запуск playbook с хуками

Только для \`type: scenario\`:

\`\`\`yaml
actions:
  - id: actions_exportSummary
    name: Экспорт оценки
    type: scenario
    scenario: playbook__export_summary_values
    hooks:
      onComplete:
        artifacts:
          autodownload: true
      onError:
        notify:
          msg: "В процессе экспорта возникли ошибки"
          includeLinkToScenario: true
\`\`\`

## Связанные рецепты

- **Скрыть атрибут по условию** — \`dataRules\`
`,
};
