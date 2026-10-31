import type { CheatsheetSection } from "../types";

export const trees: CheatsheetSection = {
  id: "trees",
  label: "Деревья",
  icon: "account_tree",
  docsRef: "§ Деревья связей — стр. 353–358",
  md: `
# Деревья связей (trees)

## Назначение

Иерархия: категории, оргструктура, каталог стандартов. Строится на основе связей \`1_n\`.

## Обязательные поля

| Поле | Описание |
|---|---|
| \`id\` | Data ID |
| \`hierarchy.entity\` | Корневая сущность |
| \`hierarchy.children[]\` | Дочерние узлы (рекурсивно) |

## Тип дерева

| \`type\` | Поведение |
|---|---|
| \`ordinary\` | Обычное (по умолчанию) |
| \`orderable\` | Позволяет пользователю перетаскивать узлы |
| \`multiparent\` | Один узел в нескольких родителях (только \`n_n\`) |

## Пример: дерево категорий

\`\`\`yaml
trees:
  - id: CategoryTree
    type: orderable
    maxDepth: 5
    hierarchy:
      entity: Category
      maxInstances: 1
      children:
        - linkage: Category_Subcategory
          entity: Subcategory
          maxChildren: 20
          children:
            - linkage: Subcategory_Item
              entity: Item
    sorting:
      - id: byName
        name: По названию
        by:
          - entity: Category
            by:
              - attribute: name
                direction: asc
          - entity: Subcategory
            by:
              - attribute: name
                direction: asc
\`\`\`

## Каждое поле children

| Поле | Описание |
|---|---|
| \`linkage\` | Ссылка на связь (\`Data ID Ref\`) |
| \`entity\` | Дочерняя сущность |
| \`side\` | Сторона связи родителя (по умолчанию \`1\`) |
| \`maxInstances\` | Максимум объектов этой сущности в узле |
| \`maxChildren\` | Максимум дочерних через связь |
| \`children\` | Вложенные (рекурсивно) |

## Сортировка

Каждый уровень можно сортировать по своим атрибутам. Правила складываются:

\`\`\`yaml
sorting:
  - id: defaultSort
    name: Стандартная
    by:
      - entity: Category
        by:
          - { attribute: name, direction: asc }
\`\`\`

## Как показать дерево

Дерево описывает только структуру. Чтобы пользователь его увидел — нужен \`view[type: tree]\` + действие \`open_tree\`.

См. рецепт **Древовидное представление**.
`,
};
