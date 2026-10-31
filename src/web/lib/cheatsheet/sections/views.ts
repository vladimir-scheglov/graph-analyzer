import type { CheatsheetSection } from "../types";

export const views: CheatsheetSection = {
  id: "views",
  label: "Представления",
  icon: "visibility",
  group: "ui",
  docsRef: "§ Представления — стр. 409–504",
  md: `
# Представления (views)

## Назначение

\`views[]\` описывает интерфейс: списки, карточки, модалки, панели, деревья,
дашборды. Одна схема домена может содержать много views разных типов.

## Типы top-level view

| \`type\` | Назначение |
|---|---|
| \`entity\` | Контейнер карточки сущности (панели, модалки, страницы) |
| \`list\` | Список объектов |
| \`tree\` | Дерево связей |
| \`tabs_list\` | Группа вкладок со списками |
| \`dashboard\` | Дашборд с виджетами |
| \`dashboard_tree\` | Дерево навигации по спискам |

## Общие поля (все типы)

| Поле | Описание |
|---|---|
| \`id\` | View ID. camelCase, ≤ 63 символов |
| \`label\` | Заголовок |
| \`description\` | Описание (не выводится в UI) |
| \`type\` | Обязательно |
| \`inherits\` | Наследование от другой view того же типа |

---

## List-view (\`type: list\`)

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`source\` | да | Источник данных |
| \`source.type\` | да | \`operational\` (единственное значение) |
| \`source.entity\` | да | Сущность, чьи объекты отображаются |
| \`source.joins[]\` | нет | Связи для отображения полей связанных сущностей |
| \`actionPanel[]\` | нет | Кнопки над таблицей |
| \`table\` | да* | Таблица |

\`* — если не задано \`inherits\`.\`

### Полный пример

\`\`\`yaml
views:
  - id: lists_iocs
    type: list
    label: Индикаторы компрометации
    source:
      type: operational
      entity: Ioc
    actionPanel:
      - widget: buttons_createIoc
    table:
      columns:
        - id: type
          attribute: type
          label: Тип
          layout:
            width: { default: 120, min: 80, max: 200 }
        - id: value
          attribute: value
          label: Значение
      filter:
        attributes:
          type: specific
          use:
            - attribute: type
            - attribute: value
        linkages:
          type: specific
          use:
            - linkage: Incident_Ioc
              linkedEntity:
                - attribute: incidentSubject
      sortingBy:
        columns:
          - column: value
            sorting: sorting_value
        default:
          column: value
          direction: asc
      paging:
        sizes: [10, 50, 100]
        defaultSize: 20
      refresh:
        mode: auto
        defaults:
          enabled: true
          unit: minute
          interval: 5
      selection: true
      actions:
        - type: row_click
          action: actions_openIocPanel
        - type: row_context_menu
          items:
            - action: actions_editIoc
              label: Изменить
              icon: iconsEdit
            - action: actions_removeIoc
              label: Удалить
              icon: iconsDelete
      empty:
        message: Данные отсутствуют
\`\`\`

### source.joins — связи для отображения полей связанных сущностей

\`\`\`yaml
source:
  type: operational
  entity: Equipment
  joins:
    - id: linkedOffice
      linkage: EquipmentToOffice
      side: 2
      description: Связь с офисом
\`\`\`

Поля связанной сущности используются в \`table.columns[].attribute\` с \`join: linkedOffice\`.

---

## Entity-view (\`type: entity\`)

### Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`entity\` | да | FQID сущности |
| \`widgets[]\` | да | Виджеты |
| \`groups[]\` | да | Блоки, вкладки, формы |
| \`views[]\` | да | Панели, модалки, страницы (nested) |
| \`isMixin\` | нет | \`true\` — разрешить использовать в миксине другого домена |

### Скелет

\`\`\`yaml
views:
  - id: viewIoc
    type: entity
    entity: Ioc
    widgets:
      - id: editors_iocType
        type: attribute
        attribute: type
      - id: editors_iocValue
        type: attribute
        attribute: value
      - id: buttons_editIoc
        type: action
        action: actions_editIoc
        control:
          type: regular_button
          icon: iconsEdit
    groups:
      - id: blocks_infoIoc
        type: block
        layout:
          direction: column
        components:
          - widget: editors_iocType
          - widget: editors_iocValue
      - id: tabs_infoIoc
        type: tab
        label: Детали
        components:
          - block: blocks_infoIoc
      - id: blocks_forms_newIoc
        type: form
        layout:
          direction: column
        components:
          - widget: editors_iocType
          - widget: editors_iocValue
    views:
      - id: panels_infoIoc
        type: panel
        label: "{type}: {value}"
        menu:
          - action: actions_editIoc
        tabs:
          - tab: tabs_infoIoc
      - id: forms_newIoc
        type: modal
        form: blocks_forms_newIoc
        label: Добавление
        buttons:
          - type: submit
            label: Создать
          - type: close
            label: Отмена
\`\`\`

### Nested views (\`views[].views[]\`)

| \`type\` | Назначение |
|---|---|
| \`panel\` | Компактное представление (по клику на объект) |
| \`modal\` | Модальное окно создания/редактирования |
| \`page\` | Полноэкранная карточка |

**Modal** — обязателен \`form\` (id группы \`type: form\`):
\`\`\`yaml
- id: forms_newIoc
  type: modal
  form: blocks_forms_newIoc
  label: Создание
  buttons:
    - type: submit
      label: Создать
      control:
        type: regular_button
        icon: iconsAdd
    - type: close
      label: Отмена
  footer:
    - action: actions_enrichIoc
      behavior: run_submit          # run | run_close | run_submit
      control:
        type: regular_button
        icon: iconsRefresh
\`\`\`

**Panel** — обязателен \`tabs[]\`:
\`\`\`yaml
- id: panels_infoIoc
  type: panel
  label: "{value}"
  menu:
    - action: actions_editIoc
    - action: actions_removeIoc
  tabs:
    - tab: tabs_infoIoc
    - tab: tabs_linkagesIoc
  onView:
    - action: actions_markViewed   # только set_attribute_value
\`\`\`

**Page** — обязателен \`menuItem\`:
\`\`\`yaml
- id: pages_infoIoc
  type: page
  menuItem: IocsMenu
  actionPanel:
    - widget: buttons_editIoc
  tabs:
    - tab: tabs_infoIoc
  pinnedView:
    block: blocks_headerIoc
    position: top           # top | bottom
    height: 30%             # default 30% если не задано height/maxHeight
    minHeight: 20%
    maxHeight: 50%
\`\`\`

### Наследование сущности

**Top-level \`views[].inherits\`:**

\`\`\`yaml
- id: lists_db
  type: list
  inherits: ci.example.com/lists_ci     # унаследовать от другой view
  source:
    type: operational
    entity: DB
  actionPanel:
    - inherit:
        type: override                  # append | override | except
    - widget: buttons_create
  table:
    columns:
      - inherit:
          type: append                  # добавить к унаследованным
      - id: dbVersion
        attribute: dbVersion
\`\`\`

**Nested \`views[].views[].inherits\`** (panel/modal/page):
\`\`\`yaml
views:
  - id: panels_info_new
    type: panel
    inherits: panels_info
    menu:
      - inherit:
          type: append
    tabs:
      - inherit:
          type: append
      - tab: new_tab
\`\`\`

**Группы \`views[].groups[].inherits\`:**
\`\`\`yaml
- id: tabs_computer_apps
  type: tab
  inherits: block_1
  components:
    - inherit:
        type: append
    - block: blocks_computer
\`\`\`

**ActionPanel / Tab / Menu / Table.columns inherit** — те же \`append | override | except\`.

---

## tabs_list (\`type: tabs_list\`)

Группа вкладок со списками.

\`\`\`yaml
- id: tabs_assets
  type: tabs_list
  label: Активы
  tabs:
    - view: lists_devices
    - view: lists_servers
    - view: ci.example.com/lists_software   # FQID на другой домен
  defaultTab: lists_devices
\`\`\`

- \`tabs[]\` — массив \`{ view }\` — id \`list\`-view (в т.ч. FQID).
- \`defaultTab\` — какая вкладка открывается. Если не задана — первая.

---

## Tree-view (\`type: tree\`)

| Поле | Обязательно | Описание |
|---|---|---|
| \`tree\` | да | Ссылка на \`trees[].id\` |
| \`variant\` | да | \`merged\` \| \`splitted\` |
| \`nodeChunkSize\` | нет | Пагинация узлов (1–100, default 20) |
| \`ordering\` | нет | \`true\` — перетаскивание (требует \`type: orderable\` в дереве) |

### Merged

Дерево + таблица в одном окне.

\`\`\`yaml
- id: treeDevices
  type: tree
  tree: DevicesTree
  variant: merged
  nodeChunkSize: 20
  ordering: false
  table:
    columns:
      - id: treePath
        attribute: id
        label: Путь
        expanded: true
        control:
          type: tree_path
          tree: DevicesTree
        layout:
          width: { default: 300, min: 150, max: 500 }
      - id: name
        attribute: name
        label: Название
    filter:
      - entity: Device
        attributes:
          type: all
      - entity: Server
        attributes:
          type: specific
          use:
            - attribute: serverName
    sortingBy:
      columns:
        - column: name
          sorting: sortByName
    paging:
      sizes: [20, 50, 100]
      defaultSize: 20
    refresh:
      mode: auto
      defaults:
        enabled: true
        unit: minute
        interval: 5
    selection: false
\`\`\`

⚠️ В tree-view \`table.filter\` — **массив** блоков по сущностям дерева (в
отличие от list-view, где filter — объект).

### Splitted

Два окна: слева — дерево, справа — список. Используется в варианте «Каталог».

\`\`\`yaml
- id: treeDevicesSplit
  type: tree
  tree: DevicesTree
  variant: splitted
  list: lists_devices           # обязателен
  catalogTitle: Оборудование    # обязателен
  rootText: Все устройства
  showLeaf: true
  menuOptions:
    - action: actions_addDevice
  views:
    - entity: Device
      view: pages_infoDevice
    - entity: Server
      view: pages_infoServer
\`\`\`

---

## Dashboard (\`type: dashboard\`)

\`\`\`yaml
- id: dash_overview
  type: dashboard
  widgets:
    - widget: card_incidentsOpen
    - widget: card_incidentsCritical
    - widget: card_assets
  layout:
    type: grid
    columns: 3
\`\`\`

\`widgets[]\` — id карточек (\`type: card\`) или доменных виджетов.
\`layout.type: grid\` — единственный вариант, \`columns\` — 1..N.

---

## dashboard_tree (\`type: dashboard_tree\`)

\`\`\`yaml
- id: dash_nav
  type: dashboard_tree
  defaultItem: dash_overview
  tree:
    - view: dash_overview
      label: Обзор
      children:
        - view: dash_incidents
          label: Инциденты
        - view: dash_assets
          label: Активы
    - view: lists_devices
      label: Оборудование
    - autoTree:
        entity: ci.example.com/CI
      label: Конфигурационные единицы
\`\`\`

| Поле узла | Описание |
|---|---|
| \`view\` | \`dashboard\` или \`list\` |
| \`label\` | Отображаемое название |
| \`autoTree.entity\` | FQID — авто-дерево по наследникам сущности |
| \`children[]\` | Вложенные узлы |

⚠️ \`autoTree\` и \`children\` — **взаимоисключающие** на одном уровне.

---

## Table — расширение полей

### \`table.columns[].automatic\`

Автоматический сбор колонок из атрибутов:

\`\`\`yaml
table:
  columns:
    - id: commonName
      attribute: commonName
    - automatic:
        type: all               # only | all | except
    - id: create
      attribute: createdAt
\`\`\`

- \`type: only\` + \`only[]\` — только перечисленные.
- \`type: all\` — все атрибуты сущности + родителей.
- \`type: except\` + \`except[]\` — все, кроме перечисленных.

### \`table.columns[].aggregate\`

Колонка с count по связи:

\`\`\`yaml
- id: linkedCount
  label: Связанных
  join: linkedOffice
  aggregate:
    type: count
    condition: !rql @row.isActive = true
\`\`\`

⚠️ \`aggregate\` игнорирует \`attribute\` в этой колонке.

### \`table.columns[].actions[]\`

Действия при hover на ячейку:

\`\`\`yaml
- id: name
  attribute: name
  actions:
    - action: actions_editIoc
      control:
        type: regular_button
        icon: iconsEdit
\`\`\`

### \`table.columns[].control.type: tree_path\`

Путь от корня дерева:

\`\`\`yaml
- id: treePath
  attribute: id
  control:
    type: tree_path
    tree: DevicesTree
\`\`\`

⚠️ tree_path не поддерживает сортировку и фильтрацию.

### \`table.sortingBy.columns[].automatic\`

\`\`\`yaml
sortingBy:
  columns:
    - automatic:
        type: all          # only | all | except
\`\`\`

### \`table.actions[]\`

| \`type\` | Что |
|---|---|
| \`row_click\` | \`{ type, action }\` — клик по строке |
| \`row_double_click\` | \`{ type, action }\` — двойной клик |
| \`row_context_menu\` | \`{ type, items: [{ action, label?, icon? }] }\` — ≤ 7 items |

---

## Что где

- **Виджеты** — см. раздел «Виджеты»
- **Группы виджетов** — \`blocks / tabs / forms / resizable_block_pair\`
- **Действия** — см. раздел «Действия»

## Связанные рецепты

- **Фильтрация в списке** — \`filter.attributes / filter.linkages\`
- **Дерево-каталог** — \`variant: splitted\`
- **Скрыть колонку таблицы по условию** — \`uiRules\`
`,
};
