import type { CheatsheetSection } from "../types";

export const exchangeSettings: CheatsheetSection = {
  id: "exchangeSettings",
  label: "Обмен данными",
  icon: "swap_horiz",
  docsRef: "§ Настройки обмена данными — стр. 393–396",
  md: `
# Обмен данными (exchangeSettings)

## Назначение

Настройки импорта / экспорта объектов домена через API.

## Обязательные поля

| Поле | Описание |
|---|---|
| \`entities\` | Объект: ключ — сущность, значение — настройки |

## Ключевые опциональные поля

| Поле | Описание |
|---|---|
| \`enable\` | Включить обмен (\`true\` по умолчанию) |
| \`label\` | Название в списке импорта/экспорта |
| \`noCmsSync\` | Отключить \`sdk.cms.sync\` |
| \`attributeFormats\` | Форматы дат (Moment-синтаксис) |

## Пример: базовый

\`\`\`yaml
exchangeSettings:
  enable: true
  label: Обмен индикаторами
  attributeFormats:
    Date: DD-MM-YYYY
    Time: HH:mm:ss
    Timestamp: DD-MM-YYYYTHH:mm:ss
  entities:
    Ioc:
      enable: true
      label: Индикаторы
      forExport: value
\`\`\`

## Настройки на сущность

| Поле | Описание |
|---|---|
| \`forExport\` | Атрибут-идентификатор для Reference |
| \`upsertWith\` | Атрибуты для upsert (id через запятую) |
| \`ignoreAttributes\` | Игнорируемые атрибуты |
| \`exportSystemAttributes\` | id системных атрибутов или \`all\` |
| \`noCmsSync\` | Отключить sync для этой сущности |

## Пример: upsert по имени

\`\`\`yaml
exchangeSettings:
  entities:
    Ioc:
      upsertWith: value,type
      ignoreAttributes: internalNote,calculatedField
\`\`\`

- \`upsertWith\`: если найден объект с совпадающими \`value\` + \`type\` — обновить, иначе создать.
- \`ignoreAttributes\`: не перезаписывать эти поля при импорте.

## Формат дат (Moment.js)

| Тип | Пример |
|---|---|
| \`Date\` | \`DD-MM-YYYY\`, \`YYYY/MM/DD\` |
| \`Time\` | \`HH:mm:ss\`, \`HH:mm\` |
| \`Timestamp\` | \`DD-MM-YYYYTHH:mm:ss\` |
| \`TimestampRange\` | \`DD-MM-YYYYTHH:mm:ss\` |

См. рецепт **Импорт через API с upsert**.
`,
};
