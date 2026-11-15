// Ключ — имя поля. Значение — Record<секция, tooltip>.
// Секции, где поле встречается, но нет своего текста, используют "*" как fallback.
export const FIELD_HINTS: Record<string, Record<string, string>> = {
  id: {
    entities:
      "**Data ID** — уникальный id сущности. PascalCase, ≤30 символов. Ссылается как `domain.tld/EntityId` из другого домена.",
    views:
      "**View ID**. Для top-level — `entity_*`, `lists_*`, `tree_*`. Для nested — `panels_*`, `forms_*`, `pages_*`. Ссылается из `actions[].view`.",
    dataTypes:
      "**Data ID** типа данных. PascalCase. Ссылается из `attributes[].dataType`.",
    linkages:
      "**Data ID** связи. PascalCase. Ссылается из `widgets[].linkage`, `dataRules[].linkage`.",
    menus: "**Data ID** корневого пункта меню или `menu_*` (пункт).",
    "*": "**Data ID** — уникальный идентификатор в домене.",
  },
  attributes: {
    entities:
      "**attributes** — атрибуты сущности. Поля атрибута: `id`, `name`, `dataType`, `constraints`. Системные (`id`, `createdAt`, `createdBy`, `label`, `updatedAt`, `updatedBy`, `organizationId`, `domainId`, `entityId`, `tenantId`, `version`) добавляются автоматически — их нельзя переопределять.",
    linkages:
      "**attributes** — атрибуты связи (свои поля, отличные от полей сущностей).",
    dataTypes: "**attributes** — колонки пользовательской `Table`.",
    views:
      "**attributes** — колонки таблицы связи (`widgets[].control.columns[]`) или фильтр.",
    dataRules:
      "**attributes** — атрибуты, к которым применяется `effect` правила (`hidden` / `readonly` / `required` / `default` / `allowed`).",
    "*": "**attributes** — список элементов с полями `id`, `name`, `dataType`.",
  },
  entity: {
    attributes:
      "**entity** — целевая сущность для `Reference`-атрибута. Обязательна при `dataType: Reference`. FQID — если сущность в другом домене.",
    linkages:
      "**side1 / side2** — стороны связи. Локально — `EntityId`, кросс-домен — `domain.tld/EntityId`.",
    mixins:
      "**entity** — объект направления примеси: `{ from: <FQID>, to: <FQID> }`. Не строка!",
    views:
      "**entity** — сущность, к которой привязан view. Для `list` — обязательна.",
    dataRules:
      "**entity** — целевая сущность правила (для `target: entity` / `entityAttribute`).",
    "*": "**entity** — ссылка на сущность.",
  },
  label: {
    entities:
      '**label** — шаблон лейбла. Пример: `"{name} ({severity})"`. В фигурных скобках — id атрибутов, подставляются их значения. Начните `{` — увидите список атрибутов.',
    views: "**label** — заголовок представления / карточки.",
    "*": "**label** — человекочитаемый заголовок.",
  },
  sequence: {
    attributes:
      "**sequence** — несегментированный Identifier (счётчик из `sequences[]`). **Взаимоисключающе с `template`** — если указан `template`, `sequence` использовать нельзя.",
    "*": "**sequence** — ссылка на `sequences[].id`.",
  },
  template: {
    attributes:
      "**template** — сегментированный Identifier. Плейсхолдеры: `{@inc}` (обязателен), `{@prefix}`, `{@YYYY}`, `{@YY}`, `{@MM}`, `{@DD}`. **Взаимоисключающе с `sequence`**.",
    "*": "**template** — шаблон сборки Identifier.",
  },
  defaultPrefix: {
    attributes:
      "**defaultPrefix** — используется для `{@prefix}`, если ни одно правило `prefixRules` не сработало. Обязателен, если в `template` есть `{@prefix}`.",
  },
  incrementTemplate: {
    attributes:
      "**incrementTemplate** — строка из 2–10 нулей. Добавляет ведущие нули: `0000` + `inc=16` → `0016`. При переполнении нули не добавляются.",
  },
  inherits: {
    entities:
      "**inherits** (с `s`) — наследование от родительской сущности. Кросс-домен: `domain.tld/EntityId`.\n\nНе путать с `inherit:` (без `s`) у views/groups/menu — это режим наследования (`append`/`override`/`except`).",
  },
  inherit: {
    views:
      "**inherit** (без `s`) — режим наследования. `append` — добавить, `override` — переопределить целиком, `except` — исключить указанные (`except: [...]`).\n\nНе путать с `inherits:` (с `s`) у сущностей.",
    "*": "**inherit** — режим наследования: `append` / `override` / `except`.",
  },
  readonly: {
    attributes:
      "**readonly: true** — атрибут нельзя изменить никогда. Отличается от `constraints: [{kind: readonly}]` в `dataRules` (эффект правила зависит от `condition`).",
  },
  undirected: {
    linkages:
      "**undirected** — ненаправленная связь. `true` допустимо **только** при `type: n_n`. Для `1_1` и `1_n` всегда `false`.",
  },
  side: {
    linkages: "**side** — `1` — сторона `side1`, `2` — сторона `side2`.",
    views:
      "**side** — какая сторона связи отображается в виджете. `1` — `side1`, `2` — `side2`.",
    transitiveLinkages: "**side** — сторона связи, по которой идём в цепочке.",
  },
  searchable: {
    linkages:
      "**searchable** (по умолчанию `true`) — атрибут доступен для поиска. Работает только при `useForSearch: true` у связи.",
  },
  useForSearch: {
    linkages:
      "**useForSearch** (по умолчанию `false`) — включает поиск по связи. Сами атрибуты настраиваются через `searchable: true`.",
  },
  weight: {
    mixins:
      "**weight** — **меньше = выше приоритет**. При равенстве — сортировка по `id`, `view` встраивается раньше `linkage`.",
  },
  priority: {
    menus:
      "**priority** — **больше = выше** (≥ 1000). Прямая противоположность `weight` у mixins!",
  },
  useForChild: {
    mixins:
      "**useForChild** (по умолчанию `true`) — примесь наследуется дочерними сущностями (если у них то же представление).",
  },
  isMixin: {
    views:
      "**isMixin** (по умолчанию `false`) — разрешает использование представления в примеси другого домена. При `true` представление не показывается «обычным» образом.",
  },
  hidden: {
    dataTypes:
      "**hidden** — скрыт только для записи. Для чтения и фильтров значение остаётся доступным.",
  },
  initial: {
    dataTypes:
      "**initial** — id начального статуса Workflow. Должен быть в `statuses[]`. У нового объекта всегда этот статус (`allowed` не применяется при создании).",
  },
  effect: {
    dataRules:
      "**effect** — `hidden` / `readonly` / `required` / `default` / `allowed`.\n\nОграничения по типам:\n- `hidden` — не для Counter; не совмещать с readonly/required/default\n- `readonly` / `required` — не для Counter/Identifier/системных\n- `default` — не для Attachment/Counter/Identifier/Reference/RQL/Table/Workflow\n- `allowed` — не для Array/Counter/RQL/Table",
    uiRules:
      "**effect** — `hidden` / `show` / `hiddenEmpty` / `readonly` / `editable` / `inherit` / `variant`.",
  },
  target: {
    dataRules:
      "**target** — `entity` (вся сущность/атрибуты), `entityAttribute` (строки таблицы / элементы массива, требует `attribute:` + `nested:`), `linkage` (связь и её атрибуты).",
    uiRules: "**target** — `list_view` / `entity_view` / `entity_attribute`.",
  },
  variant: {
    views:
      "**variant** (для tree) — `splitted` (Каталог, 2 окна) / `merged` (дерево внутри списка).",
  },
  displayMode: {
    views:
      "**displayMode** (linkage table) — `grouped` (цепочки в 1 строку через теги) / `flat` (по строке на комбинацию) / не задано — переключатель в UI.",
  },
  mode: {
    views:
      "**mode** — контекст зависит:\n- `table.refresh.mode`: `manual` / `auto` / `all`\n- `join.search.mode`: `entity` / `linkage` / `both`",
  },
  behavior: {
    views:
      "**behavior** (footer modal) — `run` (сценарий без закрытия), `run_close` (без сохранения, закрыть), `run_submit` (сначала сохранить форму, потом сценарий).",
  },
  operation: {
    actions:
      "**operation** — `create` / `edit` для `open_modal`; `create` / `edit` / `view` для `open_page`; `remove` / `edit` / `edit_attribute` / `import` / `export` для `bulk`.",
  },
  page: {
    actions:
      "**page** — `blank` (новое окно) / `current` (текущее). Только для `open_list` / `open_tree` / `open_view`.",
  },
  placement: {
    menus:
      "**placement** — `top` (главное меню) / `settings` (раздел Настройки).",
  },
  noCmsSync: {
    exchangeSettings:
      "⚠ В исходной схеме поле называется `noCmsSynс` с **кириллической `с`** (U+0441). Это исторический артефакт системы, но в коде так.",
  },
  upsertWith: {
    exchangeSettings:
      "**upsertWith** — если задано, используется upsert по этим атрибутам вместо `sdk.cms.sync`. Совпадение → обновление; иначе → создание.",
  },
  exportSystemAttributes: {
    exchangeSettings:
      "**exportSystemAttributes** — список id системных атрибутов через запятую, либо `all`.",
  },
  addLinksView: {
    views:
      "**addLinksView** — список, открываемый при добавлении связи. Отображается в модалке создания.",
  },
  contextPin: {
    actions:
      "**contextPin** — `true` запрещает пользователю снимать контекст в фильтре (для `open_list`).",
  },
  widgetId: {
    actions:
      "**widgetId** — id виджета группировки (для `open_list`). Позволяет переходить из `totalCount` в список.",
  },
  excludeOnGraph: {
    linkages:
      "**excludeOnGraph** — `true` (скрыть), `off` (скрыть по умолчанию, показывать по фильтру), `false` (показывать).",
  },
  iconColor: {
    entities:
      "**iconColor** — цвет иконки на графе. Значения: `red`, `pink`, `lightpink`, `orange`, `peach`, `yellow`, `green`, `lightgreen`, `turquoise`, `lightblue`, `blue`, `violet`, `purple`, `grey`.",
    linkages:
      "**iconColor** — цвет иконки связи на графе (14 стандартных цветов).",
  },
  kind: {
    dataTypes:
      "**kind** (constraints) — `required` / `range` (числа) / `length` / `regexp` / `size` (файлы) / `mime_types` (файлы) / `unique` (String/Integer/UUID/Reference/Array/Table).",
    entities: "**kind** (сущность) — `abstract` / `regular` / `static`.",
    accessRules: "**kind** (правило) — `permission` / `pass` / `condition`.",
  },
  type: {
    actions:
      "**type** — набор обязательных полей см. в описании секции `actions:`.",
    views:
      "**type** (top-level view) — `entity` / `list` / `tabs_list` / `dashboard` / `tree` / `dashboard_tree`.",
    linkages: "**type** — `1_1` / `1_n` / `n_n`.",
  },
  action: {
    views:
      "**action** — ссылка на `actions[].id`. Используется в `table.actions[]`, `columns[].actions[]`, `buttons[]`, `footer[]`, `menu[]`, `widgets[type=action].action`.",
    "*": "**action** — id действия (`actions[].id`).",
  },
  widget: {
    views:
      "**widget** — ссылка на `views[].widgets[].id`. Используется в `groups[].components[]`, `views[].actionPanel[]`, `uiRules.rule.widgets[]`.",
    uiRules:
      "**widget** — id виджета view. Правило применяется к этому виджету (скрыть / показать / изменить стиль).",
    actions:
      "**widget** — id view-виджета связи (`bulkSettings[].linkages.use[]`). Массовое редактирование для этой связи.",
    mixins:
      "**widget** — id виджета в `views[].change.add.components[]` / `change.delete.components[]` / `replace.components[]`.",
    "*": "**widget** — ссылка на `views[].widgets[].id`.",
  },
  rql: {
    views:
      "**rql** — RQL-выражение. Используется в `visualization.variables.rql`, `runs_history.filter`.",
    dataRules:
      "**rql** — RQL-выражение внутри `variables` или `filter`. Для самого правила используйте `condition`.",
    "*": "**rql** — RQL-выражение.",
  },

  variables: {
    views:
      "**variables** — параметры виджета. Для `type: visualization` — объект с `rql` (запрос к данным). Подстановки `{{id}}`, `{{attributeId}}` берутся из контекста объекта.",
    "*": "**variables** — объект переменных виджета.",
  },
};

// Дополнительно для nested-поля `views.views.type`
export const NESTED_VIEW_TYPE_HINT =
  "**type** (nested) — `panel` (компактное) / `modal` (модалка) / `page` (полноэкранная карточка).";

export const GROUP_TYPE_HINT =
  "**type** (группа) — `block` / `form` / `tab` / `tabs` / `resizable_block_pair`.";
