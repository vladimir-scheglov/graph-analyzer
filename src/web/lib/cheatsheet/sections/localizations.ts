import type { CheatsheetSection } from "../types";

export const localizations: CheatsheetSection = {
  id: "localizations",
  label: "Локализации",
  icon: "translate",
  group: "exchange",
  docsRef: "§ Локализации в схеме домена",
  md: `
# Локализации (localizations)

## Назначение

\`localizations[]\` — массив языков. Каждый — со своим набором ключей. Позволяет
показывать интерфейс домена на разных языках без дублирования сущностей.

## Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`language\` | да | Код языка (\`ru\`, \`en\`, \`de\`) |
| \`keys[]\` | да | Массив ключей |
| \`keys[].key\` | да | Ключ локализации |
| \`keys[].to\` | да | Перевод |
| \`keys[].ordinal\` | нет | Формы множественного числа |

## Пример

\`\`\`yaml
localizations:
  - language: ru
    keys:
      - key: entity.Ioc.name
        to: Индикатор
      - key: attribute.Ioc.value.name
        to: Значение
      - key: enumValue.enumIocTypes.IP.name
        to: IP-адрес
      - key: notification.iocsCreated
        to: "{count} индикаторов создано"
        ordinal:
          one: "{count} индикатор создан"
          few: "{count} индикатора создано"
          many: "{count} индикаторов создано"

  - language: en
    keys:
      - key: entity.Ioc.name
        to: Indicator
      - key: attribute.Ioc.value.name
        to: Value
      - key: enumValue.enumIocTypes.IP.name
        to: IP address
      - key: notification.iocsCreated
        to: "{count} indicators created"
        ordinal:
          one: "{count} indicator created"
          other: "{count} indicators created"
\`\`\`

## Соглашение об именовании ключей

Иерархические ключи — легко грепать, легко синхронизировать между языками:

\`\`\`
entity.<EntityId>.name
entity.<EntityId>.description
attribute.<EntityId>.<attrId>.name
attribute.<EntityId>.<attrId>.description
dataType.<DataTypeId>.name
enumValue.<DataTypeId>.<valueId>.name
workflowStatus.<DataTypeId>.<statusId>.name
view.<ViewId>.label
action.<ActionId>.name
\`\`\`

## Формы плюрализации (\`ordinal\`)

| Форма | Когда используется |
|---|---|
| \`zero\` | 0 (в основном для арабского / латышского) |
| \`one\` | 1 (единственное число) |
| \`two\` | 2 (для арабского / словенского) |
| \`few\` | 2–4 (русский, польский) |
| \`many\` | 5–20 (русский) |
| \`other\` | всё остальное (английский, дроби) |

Для английского — \`one\` + \`other\`. Для русского — \`one\` + \`few\` + \`many\` + \`other\`.

## Приоритет при отображении

1. Перевод из \`localizations[]\` для активного языка.
2. \`name\` / \`label\` из схемы (fallback).
3. \`id\` (последний fallback).

Поэтому **не удаляйте \`name\` из схемы** при добавлении локализаций — это
fallback для языков, где перевода ещё нет.

## Что проверяет линтер

- \`localization/duplicate-language\` — язык объявлен дважды.
- \`localization/duplicate-key\` — ключ объявлен дважды в одном языке.

Что **не** проверяется локально:

- Одинаковый набор ключей во всех языках.
- Осиротевшие ключи (ссылаются на удалённые элементы).
- Корректность форм плюрализации для языка.

## Связанные секции

- **Миграция 3.x → 3.4**
`,
};
