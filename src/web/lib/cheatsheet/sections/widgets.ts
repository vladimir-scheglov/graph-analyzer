import type { CheatsheetSection } from "../types";

export const widgets: CheatsheetSection = {
  id: "widgets",
  label: "Виджеты",
  icon: "widgets",
  group: "ui",
  docsRef: "§ Виджеты — стр. 430–458",
  md: `
# Виджеты (\`views[].widgets[]\`)

## Назначение

Виджет — атомарный визуальный компонент. Один виджет = один элемент UI
(поле, кнопка, таблица, связь, история).

## Общие поля (все типы)

| Поле | Описание |
|---|---|
| \`id\` | View ID. camelCase, ≤ 63 символов |
| \`type\` | Обязательно — см. список ниже |
| \`description\` | Описание (не выводится в UI) |

## Типы виджетов

| \`type\` | Назначение |
|---|---|
| \`attribute\` | Поле для просмотра/редактирования значения |
| \`action\` | Кнопка / меню действий |
| \`linkage\` | Редактор связей (одна связь) |
| \`linkage_list\` | Список связей (все связи сущности) |
| \`linked_objects_groups\` | Таблица сгруппированных связанных объектов |
| \`join\` | Транзитивная связь (поле через цепочку) |
| \`history\` | История изменений (события аудита) |
| \`runs_history\` | История запусков сценариев |
| \`comments\` | Комментарии |
| \`card\` | Карточка для дашборда |
| \`conversation\` | Переписка |
| \`visualization\` | Визуализация (график/таблица) |
| \`external:<id>\` | Сторонний виджет из внешнего домена |

---

## attribute — поле атрибута

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`attribute\` | да | Data ID Ref (включая системные) |
| \`control\` | нет | \`{ type, ... }\` — редактор |
| \`counterColorPattern\` | нет | Для \`Counter\` — Data ID Ref схемы |
| \`include\` / \`exclude\` | нет | Для \`RQL\` — ограничение редактора |
| \`rowHeight\` | нет | Для \`Array\` — высота в строках |

### \`control.type\`

| \`control.type\` | dataType | Доп. поля |
|---|---|---|
| \`text\` / \`text_area\` | String, Text | — |
| \`select\` / \`radio\` | Enum, Workflow | — |
| \`tag\` / \`level\` | Enum, Workflow | — |
| \`switch\` / \`checkbox\` | Bool | — |
| \`bool_text\` | Bool | \`trueText\`, \`falseText\` |
| \`integer\` / \`integer_slider\` | Integer | \`step\` (для slider) |
| \`decimal\` / \`decimal_slider\` | Decimal | \`step\` |
| \`float\` / \`float_slider\` | Float | \`step\` |
| \`timestamp\` / \`date\` / \`time\` / \`timestamp_range\` | Соотв. | — |
| \`link\` | URL, Reference | — |
| \`file\` / \`drag_drop_area\` | Attachment | \`text\` (для drag_drop_area) |
| \`ip\` / \`cidr\` / \`mac\` | IpAddress / CIDR / MAC | — |
| \`uuid\` | Uuid, Identifier | — |
| \`tree_path\` | — | \`tree\` |

### Примеры

**Bool с текстами:**

\`\`\`yaml
- id: editor_isActive
  type: attribute
  attribute: isActive
  control:
    type: bool_text
    trueText: Активен
    falseText: Неактивен
\`\`\`

**Attachment с drag_drop_area:**

\`\`\`yaml
- id: editor_files
  type: attribute
  attribute: attachments
  control:
    type: drag_drop_area
    text: Перетащите файлы
\`\`\`

**Counter с цветовой схемой:**

\`\`\`yaml
- id: editor_deadline
  type: attribute
  attribute: deadlineCounter
  counterColorPattern: counterColorPercentage
\`\`\`

**RQL с ограничением области:**

\`\`\`yaml
- id: editor_rql
  type: attribute
  attribute: filter
  include:
    - domain: <my.domain>
      entities:
        - entity: Ioc
          attributes:
            - attribute: value
            - attribute: type
          linkages:
            - side: 1
              linkage: Incident_Ioc
\`\`\`

---

## action — кнопка / меню

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`action\` | одно из двух | Одно действие |
| \`actions[]\` | одно из двух | Массив — выпадающее меню |
| \`control\` | нет | \`{ type, icon, text, context }\` |

### \`control.type\`

| \`type\` | Когда |
|---|---|
| \`regular_button\` | Обычная кнопка |
| \`dropdown\` | Только \`bulk + operation: edit_attribute\` |
| \`drag_drop_area\` | Только \`scenario\` / \`open_modal\` |

### Пример

\`\`\`yaml
- id: buttons_editIoc
  type: action
  action: actions_editIoc
  control:
    type: regular_button
    icon: iconsEdit
    label: Изменить

- id: menu_actionsIoc
  type: action
  actions:
    - actions_editIoc
    - actions_removeIoc
  control:
    type: dropdown

- id: drop_importIoc
  type: action
  action: actions_scenarioImportIoc
  control:
    type: drag_drop_area
    text: Перетащите файл для импорта
    context:
      dataType: Attachment    # Array | Attachment | Table
      name: importedFile
\`\`\`

---

## linkage — редактор связей

### Структура

| Поле | Описание |
|---|---|
| \`linkage\` | Data ID Ref / FQID связи |
| \`side\` | 1 (один объект) \| 2 (несколько) |
| \`label\` | Название в UI |
| \`control.type\` | \`select\` / \`multi_select\` / \`table\` |
| \`control.addLinksView\` | Для \`table\` — list-view для модалки создания |
| \`control.columns[]\` | Для \`table\` — колонки |
| \`control.sortingBy\` | Для \`table\` |
| \`control.paging\` | Для \`table\` |
| \`attributes[]\` | Атрибуты связи (для отображения/редактирования) |

### \`side\` vs \`control.type\`

| Связь + side | Допустимый \`control.type\` |
|---|---|
| \`1_1\` | \`select\` |
| \`1_n\` \`side: 1\` | \`select\` |
| \`1_n\` \`side: 2\` | \`multi_select\`, \`table\` |
| \`n_n\` | \`multi_select\`, \`table\` |

### Полный пример (table)

\`\`\`yaml
- id: editors_link_OfficeToCity
  type: linkage
  linkage: OfficeToCity
  side: 2
  label: Офисы в городе
  control:
    type: table
    addLinksView: lists_office
    columns:
      - id: officeName
        attribute: Name
      - id: officeUrl
        attribute: URL
      - id: linkCreatedAt
        attribute: createdAt      # системный атрибут связи
      - id: linkUpdatedAt
        attribute: updatedAt
    sortingBy:
      columns:
        - column: officeName
          sorting: sortOfficeName
      default:
        column: officeName
        direction: asc
    paging:
      sizes: [10, 50]
      defaultSize: 10
  attributes:
    - attribute: linkAttrTimestamp
\`\`\`

### Колонки (\`control.columns[]\`)

| Поле | Описание |
|---|---|
| \`id\` | View ID колонки |
| \`attribute\` | Атрибут **связанной** сущности или связи (включая системные) |
| \`join\` | Для транзитивной связи — id из \`transitiveLinkages.joins\` |

⚠️ Нельзя одновременно \`linkage\` в виджете и \`join\` в колонках — либо одно, либо другое.

---

## linkage_list — список связей

Универсальный обзор **всех** связей сущности с фильтрацией.

### Структура

\`\`\`yaml
- id: editors_allLinks
  type: linkage_list
  rules:
    includes:
      - id: <my.domain>
        only: [linkage_a, linkage_b]
      - id: <other.domain>
        except: [linkage_c]
  entity_lists:
    - entity: Ioc
      list: lists_ioc
    - entity: Incident
      list: lists_incidents
\`\`\`

| Поле | Описание |
|---|---|
| \`rules.includes[]\` | Список доменов и связей для включения |
| \`rules.includes[].id\` | FQID домена |
| \`rules.includes[].only[]\` | Только эти связи |
| \`rules.includes[].except[]\` | Все связи, кроме этих |
| \`rules.excludes[]\` | Аналогично, но **исключение** |
| \`entity_lists[]\` | Какое list-view использовать для каждой связанной сущности |

**Правила:** \`only\` и \`except\` — взаимоисключающие. Между \`includes\` и
\`excludes\` — только одно.

---

## linked_objects_groups — сгруппированные связанные

Таблица с группировкой по атрибутам связанных объектов.

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`linkages[]\` / \`joins[]\` | одно из двух | Источники объектов |
| \`groupingBy[]\` | да | Атрибуты для группировки |
| \`control.type: table\` | да (default) | Единственное значение |
| \`columns[]\` | да | Колонки: атрибуты из \`groupingBy\` + \`totalCount\` |
| \`sortingBy\` | нет | Сортировка |
| \`paging\` | нет | Пагинация |

### Пример

\`\`\`yaml
- id: widget_linkedGroups
  type: linked_objects_groups
  linkages:
    - linkage: Incident_Ioc
      side: 2
    - linkage: Incident_Asset
      side: 2
  groupingBy:
    - attribute: iocType
    - attribute: iocValue
  columns:
    - id: iocType
      attribute: iocType
    - id: iocValue
      attribute: iocValue
    - id: totalCount
      attribute: totalCount
      label: Всего
  sortingBy:
    columns:
      - column: iocType
        sorting: sortByType
\`\`\`

\`attribute: totalCount\` — специальный атрибут «общее число уникальных записей
после группировки». Работает, если в open_list для **каждой** сущности задан
\`widgetId\` этого виджета.

---

## join — транзитивная связь

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`joinId\` | да | id из \`transitiveLinkages[].joins[].id\` |
| \`attribute\` | одно из двух | Атрибут связанной сущности |
| \`aggregate.type: count\` | одно из двух | Количество связанных |
| \`aggregate.condition\` | нет | RQL-фильтр для count |
| \`openView\` | нет | \`action.open_list\` для перехода (при \`aggregate\`) |
| \`displayMode\` | нет | \`flat\` \| \`grouped\` |

### Пример

\`\`\`yaml
- id: widget_officeFromCity
  type: join
  joinId: equipmentcityoffice
  attribute: Name
  label: Офис

- id: widget_officeCount
  type: join
  joinId: equipmentcityoffice
  aggregate:
    type: count
    condition: !rql @row.isActive = true
  openView: actions_openOfficeList
  displayMode: grouped       # flat | grouped
\`\`\`

⚠️ Нельзя одновременно \`attribute\` и \`aggregate\`.

---

## history — история изменений

\`\`\`yaml
- id: widget_history
  type: history
  eventStorageId: '00000000-0000-0000-0000-000000000000'
\`\`\`

\`eventStorageId\` — UUID хранилища событий из автоматизации / аудита.

---

## runs_history — история запусков сценариев

\`\`\`yaml
- id: widget_runs
  type: runs_history
  playbooks:
    include:
      - playbook__export
      - playbook__enrich
    # ИЛИ exclude
\`\`\`

Если \`playbooks\` не задано — все сценарии и скрипты.

Рекомендуется размещать отдельно: блок → виджет → вкладка (только эта).

---

## comments — комментарии

Доп. полей нет. Только \`id\`, \`type\`, \`description\`.

---

## card — карточка для дашборда

\`\`\`yaml
- id: card_incidentsOpen
  type: card
  icon: iconsIncident
  action: actions_openIncidentList
\`\`\`

---

## conversation — переписка

\`\`\`yaml
- id: widget_conversation
  type: conversation
  linkage: Incident_Message       # связь с Message из domain.comm.rvision.ru
  conversationTransports:
    - email
\`\`\`

---

## visualization — визуализация

\`\`\`yaml
- id: widget_chart
  type: visualization
  name: Инциденты по статусам
  variables:
    rql: 'select(count(@id), @status, from(''current'', @Incident, @ioc))'
    chartType: BAR_CHART          # BAR_CHART | LINE_CHART | PIE_CHART | STACKED_BAR_CHART | TABLE | TOTAL
    source: search
    searchEntity:
      - id: lists_incidents
        type: active_list         # active_list | event_storage
    last:
      unit: DAY
      value: 30
    limit: 100
    nameMapping:
      - key: x
        value: status
      - key: y
        value: count
      - key: group_by
        value: severity
  autoUpdate:
    unit: MINUTE
    value: 5
\`\`\`

| \`chartType\` | \`nameMapping.key\` |
|---|---|
| BAR / LINE / STACKED_BAR | \`x\`, \`y\`, \`group_by\` |
| PIE_CHART | \`label\`, \`value\` |
| TOTAL | \`value\` |
| TABLE | имя колонки (произвольное) |

---

## Сторонний виджет

\`\`\`yaml
- id: external:9a2b4c1d-...
  type: external:9a2b4c1d-...
\`\`\`

Регистрируется через API. В схеме — по \`external:<id>\`.

---

## Связанные рецепты

- **Linked objects groups** — \`linkages + groupingBy + totalCount\`
- **Транзитивная связь** — \`join\` + \`transitiveLinkages\`
`,
};
