import type { CheatsheetRecipe } from "../types";

export const exchangeApi: CheatsheetRecipe = {
  id: "exchange-api",
  title: "Импорт через API с upsert",
  description:
    "Настроить exchangeSettings: обновлять объекты по значению, а не создавать дубли",
  sections: ["exchangeSettings", "entities"],
  md: `
# Импорт через API с upsert

## Что делаем

Внешний сканер присылает индикаторы. Хотим: если индикатор с таким \`value\` уже есть — обновить, если нет — создать.

## Шаги

1. Включите \`exchangeSettings\`.
2. Для нужной сущности задайте \`upsertWith\`.
3. Опционально — \`ignoreAttributes\` для полей, которые не должны перезаписываться.

## Пример

\`\`\`yaml
exchangeSettings:
  enable: true
  label: Обмен индикаторами
  entities:
    Ioc:
      enable: true
      upsertWith: value,type
      ignoreAttributes: internalNote,calculatedSeverity
      exportSystemAttributes: all
\`\`\`

## Как работает

1. Импорт приходит через API.
2. Для каждого объекта система ищет запись с совпадающими \`value\` + \`type\`.
3. Если нашла — обновляет, иначе — создаёт новую.
4. Поля из \`ignoreAttributes\` не перезаписываются даже при обновлении.

## Форматы дат

Если сканер присылает даты в нестандартном формате:

\`\`\`yaml
exchangeSettings:
  attributeFormats:
    Date: DD-MM-YYYY
    Time: HH:mm:ss
    Timestamp: DD-MM-YYYYTHH:mm:ss
\`\`\`

## forExport для Reference

Если в другом объекте есть Reference на \`Ioc\`, система при экспорте будет искать \`Ioc\` по \`value\`:

\`\`\`yaml
exchangeSettings:
  entities:
    Ioc:
      forExport: value
\`\`\`

## Отключение sync

По умолчанию используется \`sdk.cms.sync\`. Если не нужно:

\`\`\`yaml
exchangeSettings:
  noCmsSync: true
\`\`\`

Или точечно для сущности — \`entities.Ioc.noCmsSync: true\`.

## Отладка

- Если импорт создаёт дубли — проверьте \`upsertWith\` (все атрибуты должны быть заполнены во входящих данных).
- Если поля перезаписываются — проверьте \`ignoreAttributes\`.
- Если \`Reference\` не резолвится — проверьте \`forExport\`.
`,
};
