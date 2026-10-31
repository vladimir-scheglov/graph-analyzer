import type { CheatsheetRecipe } from "../types";

export const importWithIdentification: CheatsheetRecipe = {
  id: "import-with-identification",
  title: "Импорт с идентификацией и реконсиляцией",
  description:
    "Настроить дедупликацию входящих объектов и приоритеты источников при обновлении",
  sections: ["entities", "exchangeSettings"],
  md: `
# Импорт с идентификацией и реконсиляцией

## Что делаем

Внешние сканеры присылают индикаторы. Хотим:

1. **Не создавать дубликаты** — если индикатор с таким \`value\` и \`type\` уже есть, обновить его.
2. **При обновлении** — брать значения из более приоритетных источников.
3. **Удалённые** объекты не возвращать.

## Как это работает

Порядок обработки входящих данных:

1. **Идентификация** (\`identification[]\`) — поиск дубликатов по атрибутам.
2. **Реконсиляция** (\`reconciliation[]\`) — при совпадении нескольких источников выбрать значение по приоритету.
3. **Обновление** — запись в БД.

---

## 1. Правило идентификации

\`\`\`yaml
entities:
  - id: Ioc
    identification:
      - id: byValueAndType
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

**Что тут:**

- \`byValueAndType\` — дедуплицирует по \`(value, type)\`.
- \`byExternalId\` — если у объекта есть внешний ID, используем его как приоритетный ключ.
- \`filter\` — VRL-правило: применяем только если \`externalId\` не пустой.

**Логика массива:**

- Несколько правил → \`OR\` (любое сработало → дубликат).
- Правила в массиве — по убыванию приоритета.
- Внутри \`rule\` — \`and\` / \`or\` с вложенностью до 3 уровней.

---

## 2. Правило реконсиляции

\`\`\`yaml
entities:
  - id: Ioc
    reconciliation:
      - attribute: severity
        sourcePriority:
          - { source: SIEM }
          - { source: Scanner }
          - { source: "*" }

      - attribute: firstSeenAt
        mergeStrategy:
          type: earliest_date

      - attribute: tags
        mergeStrategy:
          type: array_merge

      - default:
          - { source: "*" }
\`\`\`

**Логика:**

- \`severity\` — приоритет источников: SIEM > Scanner > всё остальное.
- \`firstSeenAt\` — берём **самую раннюю** дату из всех источников.
- \`tags\` — объединяем массивы без дублей.
- \`default\` — для всех остальных атрибутов приоритет у всех источников одинаковый.

### Стратегии слияния (\`mergeStrategy.type\`)

| \`type\` | Применимо к | Что делает |
|---|---|---|
| \`replace\` | любой | Последнее по приоритету побеждает |
| \`array_merge\` | \`Array\` | Объединение **без дублей** |
| \`array_concat\` | \`Array\` | Объединение **с дублями** |
| \`earliest_date\` | \`Timestamp\` / \`Date\` / \`Time\` | Самая ранняя дата |
| \`latest_date\` | \`Timestamp\` / \`Date\` / \`Time\` | Самая поздняя дата |

---

## 3. Связка с exchangeSettings

\`\`\`yaml
exchangeSettings:
  enable: true
  label: Обмен индикаторами
  entities:
    Ioc:
      enable: true
      forExport: value                 # по чему резолвить Reference
      noCmsSync: true                  # отключить SDK-синхронизацию
\`\`\`

- \`forExport\` — при экспорте Reference на \`Ioc\` подставляется значение этого атрибута.
- \`upsertWith\` — **не нужен**, если настроены \`identification[]\` / \`reconciliation[]\`; параметр из \`exchangeSettings\` работает **вместо** них, когда \`identification[]\` нет.
- \`ignoreAttributes\` — атрибуты, которые не перезаписывать из импорта.

---

## 4. Что важно знать

### Порядок

1. \`identification[]\` — дедупликация.
2. \`reconciliation[]\` — слияние значений.
3. \`upsertWith\` в \`exchangeSettings\` — **альтернатива** \`identification[]\`. Если заданы оба, \`identification[]\` имеет приоритет.

### Правила

- Без \`identification[]\` каждый входящий объект — **новый**.
- \`reconciliation[]\` **требует** \`identification[]\`.
- \`"\*"\` в \`sourcePriority\` / \`default\` — **всегда в кавычках**.
- \`default\` — **последним** элементом массива \`reconciliation[]\`.
- \`mergeStrategy\` с \`array_*\` — только для \`Array\`.
- \`mergeStrategy\` с \`*_date\` — только для дат.

---

## 5. Типичные ошибки

**«Создаются дубликаты»** → проверьте \`identification[].rule[].attribute\` — все атрибуты должны приходить в импорте непустыми. Если хотя бы один \`null\` — правило не срабатывает.

**«Старые значения перезаписываются»** → добавьте \`sourcePriority\` для атрибута или уберите источник из \`default\`.

**«Не срабатывает reconciliation»** → проверьте, что \`identification[]\` настроен, иначе reconciliation не применяется.

**«Массивы теряют значения»** → используйте \`array_merge\` вместо \`replace\`.

---

## 6. Полный пример

\`\`\`yaml
id: tip.example.com
type: domain
version: 1.0.0
name: TIP

entities:
  - id: Ioc
    name: Индикатор
    attributes:
      - id: value
        dataType: String
        constraints: [{ kind: required }]
      - id: type
        dataType: enumIocTypes
      - id: severity
        dataType: enumSeverity
      - id: tags
        dataType: Array
        item: { dataType: String }
      - id: firstSeenAt
        dataType: Timestamp
      - id: externalId
        dataType: String

    identification:
      - id: byValueAndType
        rule:
          - attribute: value
            and:
              - attribute: type
      - id: byExternalId
        rule:
          - attribute: externalId
        filter:
          - '!is_null(.externalId)'

    reconciliation:
      - attribute: severity
        sourcePriority:
          - { source: SIEM }
          - { source: "*" }
      - attribute: firstSeenAt
        mergeStrategy: { type: earliest_date }
      - attribute: tags
        mergeStrategy: { type: array_merge }
      - default:
          - { source: "*" }

exchangeSettings:
  enable: true
  entities:
    Ioc:
      forExport: value
      noCmsSync: true

dataTypes:
  - id: enumIocTypes
    dataType: Enum
    values: [{ id: IP }, { id: Domain }, { id: Hash }]
  - id: enumSeverity
    dataType: Enum
    values: [{ id: low }, { id: medium }, { id: high }, { id: critical }]
\`\`\`

## Связанные рецепты

- **Импорт через API с upsert** — упрощённый вариант через \`exchangeSettings\`
`,
};
