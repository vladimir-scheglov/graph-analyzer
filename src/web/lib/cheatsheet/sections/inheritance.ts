import type { CheatsheetSection } from "../types";

export const inheritance: CheatsheetSection = {
  id: "inheritance",
  label: "Наследование",
  icon: "account_tree",
  group: "model",
  docsRef: "§ Наследование в домене — стр. 287–295",
  md: `
# Наследование

## Что наследуется автоматически

При \`inherits: <Parent>\` сущность **автоматически** получает:

- \`label\` — если не задан явно
- Атрибуты — в запросах и в UI (виджеты создаются только в своих представлениях)
- Правила данных — применимы к родителю и потомку
- Действия — доступны, если на них ссылается виджет потомка
- Интерфейсы — виджеты, группы, карточки (при определённых условиях)

**Не наследуется автоматически:**

- \`sorting[]\` — нужно своё правило сортировки (можно через FQID атрибуты родителя)
- \`projection[]\` — своё
- \`searching[]\` — своё

---

## \`entities[].inherits\`

Один родитель, Data ID Ref (локально) или FQID (кросс-домен).

\`\`\`yaml
entities:
  - id: Device
    attributes:
      - { id: hostname, dataType: String }

  - id: Server
    inherits: Device           # локально
    attributes:
      - { id: serverLocation, dataType: String }

  - id: DB
    inherits: db.example.com/DB # FQID
\`\`\`

### Ссылки на атрибуты родителя

| Где находится | Как ссылаться |
|---|---|
| Атрибут **своего** | \`attribute: myAttr\` |
| Атрибут **родителя** в том же домене | \`attribute: Device.hostname\` |
| Атрибут родителя в **другом** домене | \`attribute: ref.domain/Device.hostname\` |

**Правило:** ссылка на атрибут — **от сущности, в которой он объявлен**.

\`\`\`yaml
# Домен-источник
id: ref.domain
entities:
  - id: admin
    attributes:
      - { id: admin_name, dataType: String }

# Основной домен
id: main.domain
entities:
  - id: user
    inherits: ref.domain/admin
    attributes:
      - { id: username, dataType: String }
views:
  - id: user_view
    type: entity
    entity: user
    widgets:
      - id: editors_adminName
        type: attribute
        attribute: ref.domain/admin.admin_name   # полная ссылка
\`\`\`

---

## \`views[].inherits\` — наследование списка

\`\`\`yaml
views:
  - id: lists_db
    type: list
    inherits: ci.example.com/lists_ci     # другой домен, можно FQID
    source:
      type: operational
      entity: DB                          # source НЕ наследуется, обязателен
    actionPanel:
      - inherit:
          type: override                  # append | override | except
      - widget: buttons_create
    table:
      columns:
        - inherit:
            type: append
        - id: dbVersion
          attribute: dbVersion
\`\`\`

**Что наследуется:**

| Поле | Как |
|---|---|
| \`actionPanel\` | Через \`inherit\`: \`append\` / \`override\` / \`except\` |
| \`table.columns\` | Через \`inherit\`: \`append\` / \`override\` / \`except\` |
| \`table.sortingBy\` | Автоматически, **дополняется** |
| \`table.filter\` | Автоматически, **дополняется** |
| \`source.joins\` | Автоматически, **дополняется** |
| \`table.paging\` | Автоматически, **переопределяется** |
| \`table.refresh\` | Автоматически, **переопределяется** |
| \`table.selection\` | Автоматически, **переопределяется** |

⚠️ \`source\` **не наследуется**, обязателен.

---

## \`views[].views[].inherits\` — наследование карточки

Применяется к \`panel\` / \`modal\` / \`page\`.

\`\`\`yaml
views:
  - id: panels_info_new
    type: panel
    inherits: panels_info         # та же сущность или родитель
    menu:
      - inherit:
          type: append            # по умолчанию
    tabs:
      - inherit:
          type: append
      - tab: new_tab              # добавить в конец
\`\`\`

**Что наследуется:**

| Поле | Как |
|---|---|
| \`menu\` | Через \`inherit\` |
| \`tabs\` | Через \`inherit\` |
| \`label\` | Автоматически, **переопределяется** |
| \`onView\` | Автоматически, **переопределяется** |
| \`footer\` | Автоматически, **переопределяется** |
| \`block\` (page) | Автоматически, **переопределяется** |
| \`pinnedView\` (page) | Автоматически, **переопределяется** |

---

## \`views[].groups[].inherits\` — наследование группы

\`\`\`yaml
groups:
  - id: tabs_computer_apps
    type: tab
    inherits: block_1              # та же сущность или родитель
    components:
      - inherit:
          type: append             # append | override | except
      - block: blocks_computer
\`\`\`

**Что наследуется:**

| Поле | Как |
|---|---|
| \`components\` | Через \`inherit\` |
| \`label\` | Автоматически, **переопределяется** |
| \`layout\` | Автоматически, **переопределяется** |

⚠️ \`inherits\` требует **того же типа** группы (block → block, tab → tab).

---

## \`inherit.type\`

| \`type\` | Что делает |
|---|---|
| \`append\` | Наследует **все** элементы + добавляет перечисленные (по умолчанию) |
| \`override\` | **Не наследует**. Обязательно перечислить свои |
| \`except\` | Наследует всё, **кроме** перечисленных в \`except[]\` |

\`\`\`yaml
- inherit:
    type: except
    except:
      - action: actions_removeParent
      - widget: editors_secretField
\`\`\`

---

## Где есть \`inherit\`

| Контекст | Поле |
|---|---|
| \`views[].actionPanel[]\` | \`inherit\` |
| \`views[].table.columns[]\` | \`inherit\` |
| \`views[].views[].menu[]\` | \`inherit\` |
| \`views[].views[].tabs[]\` | \`inherit\` |
| \`views[].views[].actionPanel[]\` | \`inherit\` |
| \`views[].groups[].components[]\` | \`inherit\` |
| \`mixins[].views[].change.delete\` | — не \`inherit\`, а \`delete\` |

---

## Наследование в примесях (\`useForChild\`)

По умолчанию примесь **наследуется** всеми дочерними сущностями целевой.

\`\`\`yaml
mixins:
  - id: mixin_audit
    useForChild: true       # default
    # ...
\`\`\`

- \`useForChild: true\` — примесь применяется к **целевой сущности + всем потомкам**.
- \`useForChild: false\` — только к целевой.

Унаследованные столбцы примеси **добавляются** в target-list-view.

---

## Наследование правил данных

\`\`\`yaml
dataRules:
  - id: rule_onParent
    entity: Device              # применится только к Device
    rule: { effect: required, attributes: [{ attribute: hostname }] }

  - id: rule_onChild
    entity: Server              # применится к Server (потомку Device)
    condition: !rql @doc.Device.hostname IS NULL
    rule: { effect: required, attributes: [{ attribute: serverLocation }] }
\`\`\`

Правило **на родителя** не применяется к потомкам. Правило **на потомка** может
использовать атрибуты родителя.

---

## Наследование действий

Действие, объявленное для родителя, **доступно потомку**, если в представлении
потомка есть виджет этого действия:

\`\`\`yaml
# Действие родителя
actions:
  - id: actions_editDevice
    type: open_modal
    modal: forms_editDevice
    entity: Device
    operation: edit

# Виджет у потомка — ссылается на действие родителя
views:
  - id: viewServer
    type: entity
    entity: Server
    widgets:
      - id: buttons_editServer
        type: action
        action: actions_editDevice        # ← действие родителя
        control:
          type: regular_button
          icon: iconsEdit
\`\`\`

**Не наследуется:** действие создания — потомок наследует его через виджет
родителя, но с учётом \`entity\` родителя. Для потомка обычно описывают своё
действие создания.

---

## Что важно помнить

- Ссылка на атрибут родителя — **только** через сущность-объявитель
  (\`Entity.attr\` или \`domain/Entity.attr\`).
- Наследование **не** тянет \`sorting\` / \`projection\` / \`searching\` —
  пишите свои.
- При \`override\` в \`inherit\` **обязательно** перечислите свои элементы,
  иначе получите пустую секцию.

## Связанные рецепты

- **Наследование с переиспользованием виджетов** — пошагово
- **Миксин из другого домена** — \`type: view\` + \`fromView\`
`,
};
