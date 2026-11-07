export type TemplateCategory =
  | "basic"
  | "dictionary"
  | "entities"
  | "hierarchy"
  | "workflow"
  | "security";

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  basic: "Базовые",
  dictionary: "Справочники",
  entities: "Сущности",
  hierarchy: "Иерархии",
  workflow: "Workflow",
  security: "Security",
};

export interface TemplateIncludes {
  entities?: number;
  linkages?: number;
  dataTypes?: number;
  trees?: number;
  sequences?: number;
  views?: number;
  actions?: number;
  hasMenu?: boolean;
  hasMedias?: boolean;
  hasWorkflow?: boolean;
}

export interface DomainTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: TemplateCategory;
  includes: TemplateIncludes;
  /** YAML-тело БЕЗ header (id, type, version, name, ...) */
  body: string;
}

export const DOMAIN_TEMPLATES: DomainTemplate[] = [
  {
    id: "empty",
    label: "Пустой",
    description: "Только заголовок — домен без сущностей и представлений",
    icon: "article",
    category: "basic",
    includes: {},
    body: "",
  },
  {
    id: "mixin-container",
    label: "Контейнер для миксинов",
    description: "Пустой домен-приёмник — для будущих UI-миксинов",
    icon: "merge",
    category: "basic",
    includes: {},
    body: `# Этот домен предназначен для UI-примесей.
# Сущности и views можно добавлять позже через Extract mixin.
`,
  },
  {
    id: "dictionary",
    label: "Справочник",
    description:
      "Рабочий справочник: сущность + list-view + форма создания через модалку",
    icon: "book",
    category: "dictionary",
    includes: { entities: 1, views: 2, actions: 1 },
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

actions:
  - id: actions_createDictionaryItem
    name: Добавить
    type: open_modal
    modal: forms_newDictionaryItem
    entity: DictionaryItem
    operation: create

views:
  - id: viewDictionaryItem
    type: entity
    entity: DictionaryItem
    widgets:
      - { id: editors_code, type: attribute, attribute: code }
      - { id: editors_displayName, type: attribute, attribute: displayName }
      - { id: editors_description, type: attribute, attribute: description }
      - { id: buttons_createDictionaryItem, type: action, action: actions_createDictionaryItem, control: { type: regular_button, label: Создать } }
    groups:
      - id: blocks_forms_newDictionaryItem
        type: form
        components:
          - { widget: editors_code }
          - { widget: editors_displayName }
          - { widget: editors_description }
    views:
      - id: forms_newDictionaryItem
        type: modal
        form: blocks_forms_newDictionaryItem
        label: Новый элемент
  - id: lists_dictionaryItems
    type: list
    label: Элементы справочника
    source: { type: operational, entity: DictionaryItem }
    actionPanel:
      - { widget: buttons_createDictionaryItem }
    table:
      columns:
        - { id: code, attribute: code, label: Код }
        - { id: displayName, attribute: displayName, label: Название }
        - { id: description, attribute: description, label: Описание }
`,
  },
  {
    id: "enum-library",
    label: "Библиотека типов",
    description: "Набор Enum'ов для переиспользования в других доменах",
    icon: "category",
    category: "dictionary",
    includes: { dataTypes: 2 },
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
    id: "asset-registry",
    label: "Реестр активов",
    description: "Asset + AssetCategory с иерархией и деревом",
    icon: "inventory_2",
    category: "entities",
    includes: { entities: 2, linkages: 1, trees: 1, views: 1 },
    body: `entities:
  - id: AssetCategory
    name: Категория активов
    label: "{name}"
    attributes:
      - { id: name, name: Название, dataType: String, constraints: [{ kind: required }] }
      - { id: description, name: Описание, dataType: Text }

  - id: Asset
    name: Актив
    label: "{name}"
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
    id: "knowledge-base",
    label: "База знаний",
    description: "Статьи и категории статей — минимальная wiki",
    icon: "library_books",
    category: "entities",
    includes: { entities: 2, views: 1 },
    body: `entities:
  - id: ArticleCategory
    name: Категория статьи
    label: "{catName}"
    attributes:
      - { id: catName, name: Название, dataType: String, constraints: [{ kind: required }] }
      - { id: catDescription, name: Описание, dataType: Text }

  - id: Article
    name: Статья
    label: "{articleTitle}"
    attributes:
      - { id: articleTitle, name: Заголовок, dataType: String, constraints: [{ kind: required }] }
      - { id: articleBody, name: Содержание, dataType: Text }
      - { id: articleCategory, name: Категория, dataType: Reference, entity: ArticleCategory }

views:
  - id: lists_articles
    type: list
    label: Статьи
    source: { type: operational, entity: Article }
    table:
      columns:
        - { id: articleTitle, attribute: articleTitle, label: Заголовок }
        - { id: articleCategory, attribute: articleCategory, label: Категория }
        - { id: updatedAt, attribute: updatedAt, label: Обновлено }
`,
  },
  {
    id: "org-structure",
    label: "Оргструктура",
    description: "Подразделения → сотрудники с иерархией 1-N и Reference",
    icon: "account_tree",
    category: "hierarchy",
    includes: { entities: 2, linkages: 1, views: 1 },
    body: `entities:
  - id: Department
    name: Подразделение
    label: "{deptName}"
    attributes:
      - { id: deptName, name: Название, dataType: String, constraints: [{ kind: required }] }
      - { id: deptDescription, name: Описание, dataType: Text }

  - id: Employee
    name: Сотрудник
    label: "{firstName} {lastName}"
    attributes:
      - { id: firstName, name: Имя, dataType: String, constraints: [{ kind: required }] }
      - { id: lastName, name: Фамилия, dataType: String, constraints: [{ kind: required }] }
      - { id: email, name: Email, dataType: String }
      - { id: position, name: Должность, dataType: String }
      - { id: department, name: Подразделение, dataType: Reference, entity: Department }

linkages:
  - id: Dept_Employees
    name: Сотрудники подразделения
    type: 1_n
    side1: Department
    side2: Employee
    nameFrom:
      side1: Содержит сотрудников
      side2: Работает в

views:
  - id: lists_employees
    type: list
    label: Сотрудники
    source: { type: operational, entity: Employee }
    table:
      columns:
        - { id: firstName, attribute: firstName, label: Имя }
        - { id: lastName, attribute: lastName, label: Фамилия }
        - { id: email, attribute: email, label: Email }
        - { id: position, attribute: position, label: Должность }
`,
  },
  {
    id: "task-tracker",
    label: "Трекер задач",
    description:
      "Задачи с Workflow (Open → InProgress → Done) и цветами статусов",
    icon: "task_alt",
    category: "workflow",
    includes: { entities: 1, dataTypes: 1, views: 1, hasWorkflow: true },
    body: `dataTypes:
  - id: taskStatus
    name: Статус задачи
    dataType: Workflow
    statuses:
      - { id: open,       name: Открыта }
      - { id: inProgress, name: В работе }
      - { id: done,       name: Выполнена }
      - { id: cancelled,  name: Отменена }
    initial: open
    finals: [done, cancelled]
    transitions:
      - { from: open,       to: inProgress }
      - { from: open,       to: cancelled }
      - { from: inProgress, to: done }
      - { from: inProgress, to: cancelled }
      - { from: done,       to: open }
    view:
      - { status: open,       color: '#64748b' }
      - { status: inProgress, color: '#3b82f6' }
      - { status: done,       color: '#10b981' }
      - { status: cancelled,  color: '#ef4444' }

entities:
  - id: Task
    name: Задача
    label: "{title}"
    attributes:
      - { id: title,       name: Название,    dataType: String, constraints: [{ kind: required }] }
      - { id: description, name: Описание,    dataType: Text }
      - { id: status,      name: Статус,      dataType: taskStatus }
      - { id: dueDate,     name: Срок,        dataType: Date }
      - { id: assignee,    name: Исполнитель, dataType: String }

views:
  - id: lists_tasks
    type: list
    label: Задачи
    source: { type: operational, entity: Task }
    table:
      columns:
        - { id: title,    attribute: title,    label: Задача }
        - { id: status,   attribute: status,   label: Статус }
        - { id: assignee, attribute: assignee, label: Исполнитель }
        - { id: dueDate,  attribute: dueDate,  label: Срок }
`,
  },
  {
    id: "incident-tracker",
    label: "Инциденты",
    description: "Incident + Comment с типовой связкой 1-N",
    icon: "report",
    category: "workflow",
    includes: { entities: 2, linkages: 1 },
    body: `entities:
  - id: Incident
    name: Инцидент
    label: "{subject}"
    attributes:
      - { id: subject,     name: Тема,        dataType: String, constraints: [{ kind: required }] }
      - { id: description, name: Описание,    dataType: Text }
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
    id: "vulnerability-registry",
    label: "Уязвимости",
    description: "Vulnerability (CVE + CVSS + Enum severity) ↔ Asset (n_n)",
    icon: "security",
    category: "security",
    includes: { entities: 2, linkages: 1, dataTypes: 1, views: 1 },
    body: `dataTypes:
  - id: vulnSeverity
    name: Критичность уязвимости
    dataType: Enum
    values:
      - { id: low,      name: Низкая }
      - { id: medium,   name: Средняя }
      - { id: high,     name: Высокая }
      - { id: critical, name: Критическая }
    view:
      - { value: low,      color: '#10b981' }
      - { value: medium,   color: '#f59e0b' }
      - { value: high,     color: '#f97316' }
      - { value: critical, color: '#ef4444' }

entities:
  - id: Vulnerability
    name: Уязвимость
    label: "{cve}"
    attributes:
      - { id: cve,         name: CVE,          dataType: String, constraints: [{ kind: required }] }
      - { id: description, name: Описание,     dataType: Text }
      - { id: severity,    name: Критичность,  dataType: vulnSeverity }
      - { id: cvssScore,   name: CVSS,         dataType: Decimal }

  - id: Asset
    name: Актив
    label: "{assetName}"
    attributes:
      - { id: assetName, name: Название, dataType: String, constraints: [{ kind: required }] }
      - { id: ipAddress, name: IP-адрес, dataType: IpAddress }

linkages:
  - id: Asset_Vulnerability
    name: Уязвимости актива
    type: n_n
    side1: Asset
    side2: Vulnerability
    undirected: true
    nameFrom:
      side1: Имеет уязвимость
      side2: Обнаружена в активе

views:
  - id: lists_vulnerabilities
    type: list
    label: Уязвимости
    source: { type: operational, entity: Vulnerability }
    table:
      columns:
        - { id: cve,        attribute: cve,        label: CVE }
        - { id: severity,   attribute: severity,   label: Критичность }
        - { id: cvssScore,  attribute: cvssScore,  label: CVSS }
        - { id: updatedAt,  attribute: updatedAt,  label: Обновлено }
`,
  },
  {
    id: "event-log",
    label: "Журнал событий",
    description: "Event с уровнем (Enum) и временем — типовой audit-лог",
    icon: "history",
    category: "security",
    includes: { entities: 1, dataTypes: 1, views: 1 },
    body: `dataTypes:
  - id: eventLevel
    name: Уровень события
    dataType: Enum
    values:
      - { id: debug,   name: Отладка }
      - { id: info,    name: Информация }
      - { id: warning, name: Предупреждение }
      - { id: error,   name: Ошибка }
    view:
      - { value: debug,   color: '#64748b' }
      - { value: info,    color: '#3b82f6' }
      - { value: warning, color: '#f59e0b' }
      - { value: error,   color: '#ef4444' }

entities:
  - id: Event
    name: Событие
    label: "{eventType}: {eventSubject}"
    attributes:
      - { id: eventTime,    name: Время,    dataType: Timestamp, constraints: [{ kind: required }] }
      - { id: eventType,    name: Тип,      dataType: String,    constraints: [{ kind: required }] }
      - { id: eventSubject, name: Субъект,  dataType: String }
      - { id: eventLevel,   name: Уровень,  dataType: eventLevel }
      - { id: eventMessage, name: Сообщение, dataType: Text }

views:
  - id: lists_events
    type: list
    label: Журнал событий
    source: { type: operational, entity: Event }
    table:
      columns:
        - { id: eventTime,    attribute: eventTime,    label: Время }
        - { id: eventLevel,   attribute: eventLevel,   label: Уровень }
        - { id: eventType,    attribute: eventType,    label: Тип }
        - { id: eventSubject, attribute: eventSubject, label: Субъект }
`,
  },
];
