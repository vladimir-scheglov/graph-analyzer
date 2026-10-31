import type { CheatsheetSection } from "../types";

export const entities: CheatsheetSection = {
  id: "entities",
  label: "Сущности и атрибуты",
  icon: "category",
  group: "data",
  docsRef: "§ Сущности — стр. 276–328",
  md: `
# Сущности и атрибуты

## Назначение

Сущность — логическая модель объекта (Оборудование, Инцидент, Индикатор).
Атрибут — характеристика сущности (имя, IP-адрес, статус).

## Структура сущности (\`entities[]\`)

| Поле | Обязательно | Тип | Описание |
|---|---|---|---|
| \`id\` | да | Data ID | PascalCase, ≤ 30 символов |
| \`name\` | нет | строка | Название в UI |
| \`label\` | нет | строка | Шаблон отображаемого имени: \`"{attr1} {attr2}"\` |
| \`description\` | нет | строка | Описание |
| \`kind\` | нет | enum | \`regular\` (default) \| \`abstract\` \| \`static\` |
| \`attributes\` | нет | массив | Список атрибутов |
| \`sorting\` | нет | массив | Правила сортировки |
| \`searching\` | нет | массив | Атрибуты для поиска |
| \`identification\` | нет | массив | Правила идентификации |
| \`reconciliation\` | нет | массив | Правила реконсиляции |
| \`projection\` | нет | массив | Проекция для Reference-ссылок |
| \`inherits\` | нет | Data ID Ref / FQID | Родитель |
| \`graphView\` | нет | объект | \`{ iconColor }\` для диаграммы |
| \`icons\` | нет | Data ID Ref | Иконка сущности на диаграмме |
| \`scanTarget\` | нет | boolean | Актив для сканирования |
| \`scanTargetGroup\` | нет | boolean | Группа активов |

## Скелет сущности

\`\`\`yaml
entities:
  - id: Ioc
    name: Индикатор
    label: "{type}: {value}"
    description: Индикатор компрометации
    attributes: []
    sorting: []
    searching:
      - attribute: value
      - attribute: type
    projection: []
    graphView:
      iconColor: blue
\`\`\`

---

## Атрибуты (\`attributes[]\`)

### Общие поля

| Поле | Обязательно | Описание |
|---|---|---|
| \`id\` | да | camelCase, ≤ 30 символов |
| \`name\` | нет | Название |
| \`description\` | нет | Описание (не выводится в UI) |
| \`dataType\` | да | Базовый тип, Data ID Ref или FQID |
| \`readonly\` | нет | \`true\` — значение задаётся только при создании |
| \`constraints\` | нет | Массив валидаций (см. ниже) |

### Специфичные поля по типу

| \`dataType\` | Доп. поля |
|---|---|
| \`Reference\` | \`entity\` — FQID / Data ID Ref |
| \`Array\` | \`item\` — \`{ dataType, entity?, constraints? }\` |
| \`Attachment\` | \`constraints\` с \`size\` / \`mime_types\` |
| \`Text\` | \`comments: true/false\` |
| \`Table\` | \`attributes\` (колонки) + \`maxRows\` |
| \`Calculation\` | \`calculation: { schemaId, id }\` |
| \`Identifier\` | \`template\`, \`segment\`, \`defaultPrefix\`, \`incrementTemplate\`, \`sequence\`, \`prefixRules\` |
| \`Counter\` | — |

---

## Валидация — \`constraints[]\`

| \`kind\` | Совместим с типами | Поля |
|---|---|---|
| \`required\` | все | — |
| \`unique\` | String, Integer, Uuid, Reference, Array, Table | — |
| \`range\` | Integer, Decimal, Float | \`min\`, \`max\` |
| \`length\` | String, Text | \`min\`, \`max\` (символов) |
| \`regexp\` | String, Text | \`regexp\` |
| \`size\` | Attachment | \`min\`, \`max\` (байт, \`k\`, \`MB\`) |
| \`mime_types\` | Attachment | \`mimeTypes[]\` |

Опционально в каждой constraint: \`message\` — текст ошибки.

⚠️ Если для атрибута задан \`kind\`, **несовместимый** с его типом —
валидация на сервере упадёт: \`InvalidDefinition: the constraint is not
supported by attribute type\`.

### Пример

\`\`\`yaml
- id: email
  name: Email
  dataType: String
  constraints:
    - kind: required
    - kind: length
      max: 255
    - kind: regexp
      regexp: '^[^@]+@[^@]+\\.[^@]+$'
      message: "Некорректный email"

- id: age
  dataType: Integer
  constraints:
    - kind: range
      min: 0
      max: 150

- id: manual
  dataType: Attachment
  constraints:
    - kind: size
      max: 5MB
    - kind: mime_types
      mimeTypes: [application/pdf, image/png]
\`\`\`

---

## Identifier — человекочитаемый ID

### Сегменты (\`template\`)

**Обязательные:** \`{@inc}\` — инкремент.

| Литерал | Что подставляет |
|---|---|
| \`{@YYYY}\` / \`{@YY}\` | Текущий год (4 / 2 цифры) |
| \`{@MM}\` | Месяц (01–12) |
| \`{@DD}\` | День (01–31) |
| \`{@prefix}\` | Настраиваемый префикс |
| \`{@inc}\` | Порядковый номер (обязателен) |

**Разделители:** \`-\` \`_\` \`/\` \`\\\`.

### Доп. поля

| Поле | Описание |
|---|---|
| \`defaultPrefix\` | Префикс, если ни одно \`prefixRules\` не сработало. **Обязателен** при \`{@prefix}\` в шаблоне |
| \`incrementTemplate\` | Число ведущих нулей: \`"0000"\` → \`{@inc}=7\` даёт \`0007\`. **2–10 нулей** |
| \`segment\` | Массив литералов (без \`@\`, \`{}\`), при изменении которых инкремент **не сбрасывается** |
| \`sequence\` | FQID последовательности для **несегментированного** |
| \`prefixRules\` | Правила подстановки префикса из справочника |

### Несегментированный (через \`sequence\`)

\`\`\`yaml
sequences:
  - id: SequenceId
    startFrom: 1

entities:
  - id: Incident
    attributes:
      - id: incidentId
        dataType: Identifier
        sequence: <my.domain>/SequenceId
        incrementTemplate: "0000"
\`\`\`

### Сегментированный — по дате и префиксу

\`\`\`yaml
- id: incidentId
  dataType: Identifier
  template: "{@prefix}-{@YY}-{@MM}-{@DD}-{@inc}"
  defaultPrefix: INC
  incrementTemplate: "0000"
  prefixRules:
    - id: Rule_1
      attribute: inc_organization
      source:
        entity: Organization
        key: organization_name
        value: short_name
\`\`\`

Алгоритм: первое правило, где значение \`attribute\` текущей сущности
совпадает со значением \`source.key\` справочника → в префикс ставится
\`source.value\`. Если ни одно — \`defaultPrefix\`.

### \`segment\` — сброс инкремента

По умолчанию смена префикса сбрасывает \`{@inc}\`. Чтобы **не сбрасывать**,
перечислите литералы в \`segment\` (порядок: \`prefix → YYYY → MM → DD\`,
без \`@\` и \`{}\`):

\`\`\`yaml
template: "{@prefix}-{@YY}-{@MM}-{@DD}-{@inc}"
segment: [YYYY, MM, DD]   # при смене prefix инкремент продолжается
\`\`\`

---

## Array — массив

\`\`\`yaml
- id: tags
  dataType: Array
  constraints:
    - kind: length
      min: 1
      max: 10
  item:
    dataType: String
    constraints:
      - kind: required
      - kind: length
        max: 50
\`\`\`

\`item\` принимает \`dataType\`, \`entity\` (для \`Reference\`), \`constraints\`,
\`calculation\` (для \`Calculation\`).

---

## Reference — ссылка на сущность

\`\`\`yaml
- id: owner
  name: Владелец
  dataType: Reference
  entity: <my.domain>/User
  constraints:
    - kind: required
\`\`\`

Для \`Array<Reference>\` — то же через \`item.entity\`.

**Проекция:** если при обращении к объекту через Reference нужно подтянуть
поля — опишите их в \`projection[]\` **сущности-цели**:

\`\`\`yaml
entities:
  - id: User
    projection:
      - attribute: username
      - attribute: email
\`\`\`

---

## Sorting — правила сортировки

\`\`\`yaml
entities:
  - id: Incident
    sorting:
      - id: sortByDate
        name: По дате
        by:
          - attribute: createdAt
            direction: desc
          - attribute: severity
            direction: desc
        createIndex: true
\`\`\`

- \`by[]\` — порядок сортировки (первое поле — главный ключ).
- \`direction\`: \`asc\` (default) \| \`desc\`.
- \`createIndex: true\` — индекс для больших объёмов (если запрос > 2–3 сек).
- Если правила не заданы — сортировка по \`updatedAt\` → по \`id\`.

---

## Searching — атрибуты для поиска

**Каноничная форма (массив):**

\`\`\`yaml
entities:
  - id: Device
    searching:
      - attribute: objectGuid
      - attribute: commonName
\`\`\`

Помимо этих полей система всегда ищет по \`label\` и по атрибутам
**связанных** сущностей, если у связи \`useForSearch: true\` и у атрибута
связи \`searchable: true\`.

⚠️ Legacy-форма \`searching: { attributes: [...] }\` — валидна, но линтер
ругается (\`entity/searching-object-form\`).

---

## Identification — правила идентификации

Определяют, как **дедуплицировать** входящие объекты (импорт).

### Структура

| Поле | Описание |
|---|---|
| \`id\` | Data ID правила |
| \`rule\` | Массив условий (AND/OR, до 3 уровней) |
| \`filter\` | VRL-правило фильтрации входящих данных (до дедупликации) |

\`rule\` — массив элементов, каждый:

| Поле | Описание |
|---|---|
| \`attribute\` | Атрибут сущности для сравнения |
| \`and\` | Вложенные условия по логике И |
| \`or\` | Вложенные условия по логике ИЛИ |

**Логика:** правила в массиве — через \`OR\` (более приоритетное сверху).
Внутри — через \`AND\`/\`OR\`.

### Пример

\`\`\`yaml
entities:
  - id: Ioc
    identification:
      - id: byValue
        rule:
          - attribute: value
            and:
              - attribute: type
      - id: byExternalId
        rule:
          - attribute: externalId
        filter:
          - '!is_null(.externalId)'
\`\`\`

---

## Reconciliation — реконсиляция

Определяет **приоритеты источников** при обновлении атрибутов уже
найденных объектов. **Требует \`identification[]\`**.

### Структура

| Поле | Описание |
|---|---|
| \`attribute\` | Атрибут с приоритетами |
| \`sourcePriority\` | Массив \`{ source }\` в порядке убывания приоритета. \`"*"\` — все остальные с низшим приоритетом |
| \`default\` | Массив \`{ source }\` — для всех атрибутов без явных правил |
| \`mergeStrategy.type\` | \`replace\` \| \`array_merge\` \| \`array_concat\` \| \`earliest_date\` \| \`latest_date\` |

### Пример

\`\`\`yaml
reconciliation:
  - attribute: severity
    sourcePriority:
      - { source: SIEM }
      - { source: Scanner }
      - { source: "*" }          # остальные — с низшим приоритетом

  - attribute: tags
    mergeStrategy:
      type: array_merge          # объединять без дублей

  - attribute: firstSeenAt
    mergeStrategy:
      type: earliest_date        # брать самую раннюю дату

  - default:
      - { source: "*" }          # для всех остальных атрибутов
\`\`\`

**Правила:**
- \`"*"\` — **всегда в кавычках**.
- \`default\` — **последним элементом** массива (линтер это проверяет).
- \`attribute\` + \`sourcePriority\` — либо \`default\` без attribute.
- \`mergeStrategy\` с \`array_merge\` / \`array_concat\` — только для \`Array\`.
- \`earliest_date\` / \`latest_date\` — только для \`Timestamp\` / \`Date\` / \`Time\`.

---

## Projection — проекция

\`\`\`yaml
entities:
  - id: User
    projection:
      - attribute: username
      - attribute: email
\`\`\`

Поля, которые подтянутся при запросе через Reference на эту сущность.

---

## graphView — отображение на диаграмме

\`\`\`yaml
entities:
  - id: Asset
    icons: iconsAsset
    graphView:
      iconColor: blue
\`\`\`

Доступные цвета: \`red, pink, lightpink, orange, peach, yellow, green,
lightgreen, turquoise, lightblue, blue, violet, purple, grey\`.

---

## Виды сущности (\`kind\`)

| \`kind\` | Описание |
|---|---|
| \`regular\` | Стандартная (default) |
| \`abstract\` | Абстрактная — только для наследования |
| \`static\` | Статическая — без создания экземпляров |

---

## Связанные рецепты

- **Идентификатор из справочника** — \`prefixRules\`
- **Импорт с идентификацией и реконсиляцией**
- **Наследование** — см. раздел «Наследование»
`,
};
