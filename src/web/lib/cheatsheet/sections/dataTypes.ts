import type { CheatsheetSection } from "../types";

export const dataTypes: CheatsheetSection = {
  id: "dataTypes",
  label: "Типы данных",
  icon: "data_object",
  group: "data",
  docsRef: "§ Пользовательские типы данных — стр. 328–346",
  md: `
# Пользовательские типы данных

## Назначение

\`dataTypes[]\` описывает **пользовательские** типы для атрибутов. Три вида:
\`Enum\` (перечисление), \`Workflow\` (статусы), \`Table\` (таблица). Используются
в атрибутах через \`dataType: <id>\`.

## Общие поля для всех типов

| Поле | Обязательно | Тип | Описание |
|---|---|---|---|
| \`id\` | да | Data ID | Идентификатор типа. PascalCase, ≤ 63 символа |
| \`name\` | нет | строка | Название |
| \`description\` | нет | строка | Описание (не выводится в UI) |
| \`dataType\` | да | enum | \`Enum\` / \`Workflow\` / \`Table\` |

---

## Enum — перечисление

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`values\` | да | Массив значений \`{ id, name?, description?, hidden? }\` |
| \`view\` | нет | Массив \`{ value, color }\` — цвета значений |

\`values[].hidden: true\` — значение доступно только для чтения и в фильтрах,
но не выбирается при создании/редактировании.

\`view[].color\` — CSS-цвет: имя (\`blue\`), HEX (\`#0000ff\` или \`#00f\` → \`#0000ff\`).

### Полный пример

\`\`\`yaml
dataTypes:
  - id: enumIocTypes
    name: Типы индикаторов
    description: Классификация индикаторов компрометации
    dataType: Enum
    values:
      - id: IP
        name: IP-адрес
      - id: Domain
        name: Домен
      - id: URL
        name: URL-адрес
      - id: Hash
        name: Хеш
        hidden: true    # доступен только для чтения в UI
    view:
      - value: IP
        color: '#6366f1'
      - value: Domain
        color: blue
      - value: URL
        color: '#10b981'
      - value: Hash
        color: '#94a3b8'
\`\`\`

---

## Workflow — рабочий процесс

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`statuses\` | да | Массив \`{ id, name?, description?, hidden? }\` |
| \`initial\` | да | id начального статуса |
| \`finals\` | нет | Массив id конечных статусов |
| \`transitions\` | да | Массив \`{ from, to }\` — допустимые переходы |
| \`view\` | нет | Массив \`{ status, color }\` — цвета статусов |

**Правила:**
- Минимум 2 статуса.
- \`from: "*"\` — переход из **любого** статуса. \`to: "*"\` — переход в любой.
- Новые статусы можно добавлять в любое место списка, но удалять и менять
  местами существующие — нельзя.

### Полный пример

\`\`\`yaml
dataTypes:
  - id: AuditStatusWorkflow
    name: Статусы аудита
    dataType: Workflow
    initial: NEW
    finals: [CLOSED]
    statuses:
      - id: NEW
        name: Новый
      - id: IN_PROGRESS
        name: В работе
      - id: REVIEW
        name: На проверке
      - id: CLOSED
        name: Закрыт
    transitions:
      - { from: NEW,         to: IN_PROGRESS }
      - { from: IN_PROGRESS, to: REVIEW }
      - { from: REVIEW,      to: CLOSED }
      - { from: IN_PROGRESS, to: NEW }      # возврат в работу
      - { from: "*",         to: CLOSED }   # из любого — в CLOSED
    view:
      - { status: NEW,         color: '#94a3b8' }
      - { status: IN_PROGRESS, color: '#6366f1' }
      - { status: REVIEW,      color: '#f59e0b' }
      - { status: CLOSED,      color: '#10b981' }
\`\`\`

### Действие workflow

Переход в статус через \`actions[]\`:

\`\`\`yaml
actions:
  - id: actions_closeAudit
    name: Закрыть аудит
    type: workflow
    entity: Audit
    attribute: auditStatus
    transition:
      to: CLOSED
\`\`\`

---

## Table — таблица

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`attributes\` | да | Массив колонок — та же структура, что у \`entities[].attributes[]\` |
| \`maxRows\` | нет | Максимум строк |
| \`sorting\` | нет | Массив правил сортировки |
| \`view\` | нет | Представление таблицы: \`columns\`, \`sortingBy\`, \`paging\`, \`rowHeight\` |

### Полный пример

\`\`\`yaml
dataTypes:
  - id: tableArtifacts
    name: Артефакты
    dataType: Table
    maxRows: 100
    attributes:
      - id: name
        name: Название
        dataType: String
        constraints:
          - kind: required
          - kind: length
            min: 1
            max: 200
      - id: size
        name: Размер (КБ)
        dataType: Integer
        constraints:
          - kind: range
            min: 0
      - id: uploadedAt
        name: Загружено
        dataType: Timestamp
      - id: file
        name: Файл
        dataType: Attachment
        constraints:
          - kind: size
            max: 5MB
          - kind: mime_types
            mimeTypes: [application/pdf, application/zip]
    view:
      columns:
        - id: name
          attribute: name
          label: Название
          layout:
            width: { default: 300, min: 150, max: 500 }
        - id: size
          attribute: size
          label: Размер
          layout:
            width: { default: 100, min: 60, max: 150 }
        - id: uploadedAt
          attribute: uploadedAt
          label: Дата
          control:
            type: timestamp
      sortingBy:
        columns:
          - column: uploadedAt
            sorting: sortByDate
        default:
          column: uploadedAt
          direction: desc
      paging:
        sizes: [10, 50, 100]
        defaultSize: 20
      rowHeight: 2
\`\`\`

### Представление таблицы (\`view\`)

| Поле | Описание |
|---|---|
| \`columns[].id\` | View ID колонки |
| \`columns[].attribute\` | Data ID Ref атрибута таблицы |
| \`columns[].label\` | Отображаемое название |
| \`columns[].control\` | \`{ type }\` — редактор (см. матрицу control.type) |
| \`columns[].layout.width\` | \`{ default, min, max }\` — в пикселях |
| \`columns[].rowHeight\` | Высота ячейки в строках |
| \`sortingBy.columns[]\` | \`{ column, sorting }\` — привязка правил |
| \`sortingBy.default\` | \`{ column, direction: asc \| desc }\` |
| \`paging.sizes[]\` | Варианты записей на странице |
| \`paging.defaultSize\` | Значение по умолчанию |
| \`rowHeight\` | Высота строки по умолчанию (строк текста) |

---

## Связанные рецепты

- **Идентификатор из справочника** — \`prefixRules\` для \`Identifier\`
- **Кастомное действие workflow** — от \`dataTypes[].transitions\` к \`action: workflow\`
`,
};
