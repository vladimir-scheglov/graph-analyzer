export interface DomainTemplate {
  id: string;
  label: string;
  description: string;
  icon: string; // Material Symbols
  /** YAML-тело БЕЗ header (id, type, version, name, ...) */
  body: string;
}

export const DOMAIN_TEMPLATES: DomainTemplate[] = [
  {
    id: "empty",
    label: "Пустой",
    description: "Только заголовок — домен без сущностей и представлений",
    icon: "article",
    body: "",
  },
  {
    id: "dictionary",
    label: "Справочник",
    description: "Сущность-справочник с кодом и названием + list-view",
    icon: "book",
    body: `entities:
  - id: DictionaryItem
    name: Элемент справочника
    attributes:
      - id: code
        name: Код
        dataType: String
        constraints:
          - kind: required
          - kind: unique
      - id: displayName
        name: Название
        dataType: String
      - id: description
        name: Описание
        dataType: Text

views:
  - id: lists_dictionaryItem
    type: list
    label: Элементы справочника
    source:
      type: operational
      entity: DictionaryItem
    table:
      columns:
        - { id: code, attribute: code, label: Код }
        - { id: displayName, attribute: displayName, label: Название }
      filter:
        attributes:
          type: all
      paging:
        sizes: [10, 50, 100]
        defaultSize: 20
`,
  },
  {
    id: "asset-registry",
    label: "Реестр активов",
    description: "Asset + AssetCategory с иерархией и деревом",
    icon: "inventory_2",
    body: `entities:
  - id: AssetCategory
    name: Категория активов
    attributes:
      - { id: name, name: Название, dataType: String, constraints: [{ kind: required }] }
      - { id: description, name: Описание, dataType: Text }

  - id: Asset
    name: Актив
    attributes:
      - { id: name, name: Название, dataType: String, constraints: [{ kind: required }] }
      - { id: inventoryNumber, name: Инвентарный номер, dataType: String }
      - { id: status, name: Статус, dataType: String }
      - { id: category, name: Категория, dataType: Reference, entity: AssetCategory }

linkages:
  - id: AssetCategory_Asset
    name: Категория содержит активы
    type: 1_n
    side1: AssetCategory
    side2: Asset
    nameFrom:
      side1: Содержит активы
      side2: Входит в категорию

trees:
  - id: AssetTree
    type: ordinary
    hierarchy:
      entity: AssetCategory
      children:
        - { linkage: AssetCategory_Asset, entity: Asset }

views:
  - id: lists_assets
    type: list
    label: Активы
    source: { type: operational, entity: Asset }
    table:
      columns:
        - { id: name, attribute: name, label: Название }
        - { id: inventoryNumber, attribute: inventoryNumber, label: Инв. номер }
        - { id: status, attribute: status, label: Статус }
`,
  },
  {
    id: "enum-library",
    label: "Библиотека типов",
    description: "Набор Enum'ов для переиспользования в других доменах",
    icon: "category",
    body: `dataTypes:
  - id: enumSeverity
    name: Уровень критичности
    dataType: Enum
    values:
      - { id: low,      name: Низкий }
      - { id: medium,   name: Средний }
      - { id: high,     name: Высокий }
      - { id: critical, name: Критический }
    view:
      - { value: low,      color: '#10b981' }
      - { value: medium,   color: '#f59e0b' }
      - { value: high,     color: '#f97316' }
      - { value: critical, color: '#ef4444' }

  - id: enumStatus
    name: Статус
    dataType: Enum
    values:
      - { id: active,   name: Активен }
      - { id: inactive, name: Неактивен }
`,
  },
  {
    id: "incident-tracker",
    label: "Инциденты",
    description: "Incident + Comment с типовой связкой",
    icon: "report",
    body: `entities:
  - id: Incident
    name: Инцидент
    attributes:
      - { id: subject,     name: Тема,       dataType: String, constraints: [{ kind: required }] }
      - { id: description, name: Описание,   dataType: Text }
      - { id: severity,    name: Критичность, dataType: String }

  - id: Comment
    name: Комментарий
    attributes:
      - { id: text, name: Текст, dataType: Text, constraints: [{ kind: required }] }

linkages:
  - id: Incident_Comment
    name: Комментарии инцидента
    type: 1_n
    side1: Incident
    side2: Comment
    nameFrom:
      side1: Содержит комментарии
      side2: Относится к инциденту
`,
  },
  {
    id: "mixin-container",
    label: "Контейнер для миксинов",
    description: "Пустой домен-приёмник — для будущих UI-миксинов",
    icon: "merge",
    body: `# Этот домен предназначен для UI-примесей.
# Сущности и views можно добавлять позже через Extract mixin.
`,
  },
];
