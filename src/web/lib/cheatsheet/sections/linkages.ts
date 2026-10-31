import type { CheatsheetSection } from "../types";

export const linkages: CheatsheetSection = {
  id: "linkages",
  label: "Связи",
  icon: "link",
  docsRef: "§ Связи сущностей — стр. 346–362",
  md: `
# Связи (linkages)

## Назначение

Связь — отдельный элемент схемы, описывающий отношения между сущностями.
В отличие от атрибута-Reference, связь может иметь собственные атрибуты.

## Типы связей

| \`type\` | Сила | Пример |
|---|---|---|
| \`1_1\` | один-к-одному | Пользователь → Учётная запись |
| \`1_n\` | один-ко-многим | Сервер → Инцидент |
| \`n_n\` | многие-ко-многим | Сервер ↔ Администратор |

## Обязательные поля

| Поле | Тип | Описание |
|---|---|---|
| \`id\` | Data ID | Уникальный идентификатор |
| \`side1\` | Data ID / FQID | Левая сторона связи |
| \`side2\` | Data ID / FQID | Правая сторона связи |
| \`type\` | перечисление | \`1_1\` / \`1_n\` / \`n_n\` |
| \`nameFrom\` | объект | Глагольные формы сторон |

## Ключевые опциональные поля

- \`name\` — название связи
- \`undirected\` — \`true\` только для \`n_n\`
- \`attributes\` — собственные атрибуты связи
- \`view.iconColor\` — цвет на графе
- \`useForSearch\` — использовать в поиске
- \`excludeOnGraph\` — \`true\` / \`false\` / \`off\`

## Пример направленной связи N-N

\`\`\`yaml
linkages:
  - id: Incident_Ioc
    name: Связь инцидента с индикатором
    side1: Incident
    side2: Ioc
    type: n_n
    undirected: false
    nameFrom:
      side1: Содержит индикатор
      side2: Связан с инцидентом
\`\`\`

## Пример ненаправленной связи N-N

\`\`\`yaml
linkages:
  - id: Device_Software
    side1: Device
    side2: Software
    type: n_n
    undirected: true
    nameFrom:
      side1: Установлено ПО
      side2: Установлено на
\`\`\`

## Пример кросс-доменной связи

\`\`\`yaml
linkages:
  - id: Incident_Category
    side1: dictionaries.test/IncidentCategoryDict
    side2: Incident
    type: 1_n
    nameFrom:
      side1: Инциденты
      side2: Категория
\`\`\`

## Связанные рецепты

- **Транзитивная связь через 2 хопа** — \`transitiveLinkages\`
`,
};
