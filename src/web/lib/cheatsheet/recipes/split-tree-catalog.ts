import type { CheatsheetRecipe } from "../types";

export const splitTreeCatalog: CheatsheetRecipe = {
  id: "split-tree-catalog",
  title: "Каталог (split tree-view)",
  description:
    "Два окна: слева дерево, справа — список объектов листового узла",
  sections: ["views", "trees", "actions"],
  md: `
# Каталог (split tree-view)

## Что делаем

Раздел «Каталог активов»: слева дерево категорий, справа — список активов
выбранной категории. Пользователь кликает по узлу — справа отображается список
дочерних объектов.

## 1. Дерево (\`trees[]\`)

Определяет иерархию и разрешённые операции.

\`\`\`yaml
trees:
  - id: CategoryTree
    type: ordinary
    maxDepth: 5
    hierarchy:
      entity: Category
      maxInstances: 1
      children:
        - linkage: Category_Subcategory
          entity: Subcategory
          maxChildren: 20
          children:
            - linkage: Subcategory_Asset
              entity: Asset
    sorting:
      - id: sortByName
        name: По наименованию
        by:
          - entity: Category
            by:
              - attribute: name
                direction: asc
          - entity: Subcategory
            by:
              - attribute: name
                direction: asc
          - entity: Asset
            by:
              - attribute: name
                direction: asc
\`\`\`

## 2. List-view для правой панели

Обычный \`type: list\`, не связанный с деревом. Каталог его использует как «список
объектов листового узла».

\`\`\`yaml
views:
  - id: lists_assets
    type: list
    source:
      type: operational
      entity: Asset
    table:
      columns:
        - id: name
          attribute: name
          label: Название
          layout:
            width: { default: 300, min: 150, max: 500 }
        - id: serialNumber
          attribute: serialNumber
          label: Серийный номер
        - id: status
          attribute: status
          label: Статус
      filter:
        attributes:
          type: all
      selection: true
\`\`\`

## 3. Tree-view (variant: splitted)

Сам «каталог».

\`\`\`yaml
views:
  - id: treeCategoriesSplit
    type: tree
    tree: CategoryTree
    variant: splitted
    list: lists_assets                     # ← обязателен
    catalogTitle: Активы                   # ← обязателен
    rootText: Все категории
    showLeaf: true
    nodeChunkSize: 20
    menuOptions:
      - action: actions_addAsset
      - action: actions_exportAssets
    views:
      - entity: Asset
        view: pages_infoAsset
      - entity: Category
        view: pages_infoCategory
      - entity: Subcategory
        view: pages_infoSubcategory
\`\`\`

**Что тут:**

| Поле | Обязательно | Описание |
|---|---|---|
| \`tree\` | да | id дерева из \`trees[]\` |
| \`variant\` | да | \`splitted\` |
| \`list\` | да | id list-view для правой панели |
| \`catalogTitle\` | да | Заголовок правой панели |
| \`rootText\` | нет | Название корневого узла |
| \`showLeaf\` | нет | Показывать объекты листьев (по умолчанию \`true\`) |
| \`nodeChunkSize\` | нет | Пагинация узлов (по умолчанию 20) |
| \`menuOptions\` | нет | Действия в меню правой панели (⋮) |
| \`views[]\` | нет | Как открывать объект при клике на узел |

## 4. \`views[]\` — переход по клику на узел

Массив \`{ entity, view }\` — какой view открывать для каждой сущности в дереве.

\`\`\`yaml
views:
  - entity: Asset
    view: pages_infoAsset          # полная карточка
  - entity: Category
    view: lists_subcategories      # список внутри категории
  - entity: Subcategory
    view: treeCategoriesSplit      # вложенное дерево
\`\`\`

**Допустимые типы view:**

- \`tree\` с \`variant: merged\` — дерево в списочном
- \`list\` — обычный список
- \`page\` — полноэкранная карточка

---

## 5. Действия в меню (\`menuOptions\`)

Кнопки в правом верхнем углу панели со списком:

\`\`\`yaml
actions:
  - id: actions_addAsset
    name: Добавить актив
    type: open_modal
    modal: forms_newAsset
    entity: Asset
    operation: create

  - id: actions_exportAssets
    name: Экспорт
    type: scenario
    scenario: export_assets_to_csv
\`\`\`

---

## 6. Быстрый чек-лист

- [ ] Дерево \`trees[]\` определено и валидно.
- [ ] \`list\` ссылается на **существующий** \`type: list\`.
- [ ] \`catalogTitle\` задан.
- [ ] \`views[]\` содержит запись для каждой сущности из \`hierarchy.children\`.
- [ ] \`nodeChunkSize\` ≤ 100.
- [ ] Если \`type: orderable\` в дереве — можно включить \`ordering: true\`, но для каталога обычно не нужно.

---

## 7. Открытие каталога через действие

Пользователь должен откуда-то попасть в каталог. Обычно — из меню:

\`\`\`yaml
menus:
  - id: menus_assets
    route: /assets
    label: Активы
    type: root_menu
    placement: top
    view: treeCategoriesSplit
\`\`\`

Или через \`action: open_tree\`:

\`\`\`yaml
actions:
  - id: actions_openAssetsCatalog
    name: Открыть каталог активов
    type: open_tree
    view: treeCategoriesSplit
    page: blank
\`\`\`

---

## 8. Полный пример (минимальный)

\`\`\`yaml
id: assets.example.com
type: domain
version: 1.0.0
name: Assets

entities:
  - id: Category
    attributes:
      - { id: name, dataType: String }
  - id: Subcategory
    attributes:
      - { id: name, dataType: String }
  - id: Asset
    attributes:
      - { id: name, dataType: String }
      - { id: serialNumber, dataType: String }
      - { id: status, dataType: enumStatus }

linkages:
  - id: Category_Subcategory
    side1: Category
    side2: Subcategory
    type: 1_n
    nameFrom: { side1: Содержит, side2: Входит в }
  - id: Subcategory_Asset
    side1: Subcategory
    side2: Asset
    type: 1_n
    nameFrom: { side1: Содержит, side2: Входит в }

trees:
  - id: CategoryTree
    type: ordinary
    hierarchy:
      entity: Category
      maxInstances: 1
      children:
        - linkage: Category_Subcategory
          entity: Subcategory
          children:
            - linkage: Subcategory_Asset
              entity: Asset

views:
  - id: lists_assets
    type: list
    source:
      type: operational
      entity: Asset
    table:
      columns:
        - { id: name, attribute: name, label: Название }
        - { id: serialNumber, attribute: serialNumber, label: S/N }
        - { id: status, attribute: status, label: Статус }

  - id: treeCategoriesSplit
    type: tree
    tree: CategoryTree
    variant: splitted
    list: lists_assets
    catalogTitle: Активы
    rootText: Все категории
    menuOptions:
      - action: actions_addAsset

actions:
  - id: actions_addAsset
    type: open_modal
    modal: forms_newAsset
    entity: Asset
    operation: create

menus:
  - id: menus_assets
    route: /assets
    label: Активы
    type: root_menu
    placement: top
    view: treeCategoriesSplit
\`\`\`

## Связанные рецепты

- **Древовидное представление** — вариант \`merged\`
- **Транзитивная связь через 2 хопа** — если в дереве больше 2 уровней
`,
};
