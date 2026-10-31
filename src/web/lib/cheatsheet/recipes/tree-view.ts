import type { CheatsheetRecipe } from "../types";

export const treeView: CheatsheetRecipe = {
  id: "tree-view",
  title: "Древовидное представление",
  description: "Настроить дерево и открыть его через действие",
  sections: ["trees", "views", "actions"],
  md: `
# Древовидное представление

## Что делаем

Показать иерархию категорий в интерфейсе — с раскрытием узлов и переходом к списку объектов.

## Шаги

1. Опишите связи \`1_n\` между уровнями иерархии.
2. Создайте \`trees[]\` запись.
3. Создайте \`views[type: tree]\` — визуализацию дерева.
4. Создайте \`action[type: open_tree]\` — точку входа.

## 1. Связи

\`\`\`yaml
linkages:
  - id: Category_Subcategory
    side1: Category
    side2: Subcategory
    type: 1_n
    nameFrom:
      side1: Содержит подкатегории
      side2: Входит в категорию
\`\`\`

## 2. Дерево

\`\`\`yaml
trees:
  - id: CategoryTree
    type: orderable
    hierarchy:
      entity: Category
      maxInstances: 1
      children:
        - linkage: Category_Subcategory
          entity: Subcategory
\`\`\`

## 3. Tree-view

\`\`\`yaml
views:
  - id: treeCategories
    type: tree
    tree: CategoryTree
    variant: merged    # merged | splitted
    nodeChunkSize: 20
\`\`\`

- \`variant: merged\` — дерево + список в одном окне.
- \`variant: splitted\` — два окна: слева дерево, справа список.

## 4. Действие

\`\`\`yaml
actions:
  - id: actions_openCategoriesTree
    name: Дерево категорий
    type: open_tree
    view: treeCategories
\`\`\`

## 5. Точка входа в меню

\`\`\`yaml
menus:
  - id: menus_categories
    route: /categories
    label: Категории
    type: root_menu
    placement: top
    view: treeCategories
\`\`\`

## Проверка

Откройте меню → «Категории» → дерево отображается. Если нет — проверьте, что связь \`1_n\` корректна и что в \`trees.hierarchy.entity\` указана существующая сущность.
`,
};
