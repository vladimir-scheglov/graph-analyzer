import type { CheatsheetRecipe } from "../types";

export const multilingualSchema: CheatsheetRecipe = {
  id: "multilingual-schema",
  title: "Многоязычная схема",
  description:
    "Добавить переводы для названий сущностей, атрибутов и других элементов",
  sections: ["entities", "dataTypes", "views"],
  md: `
# Многоязычная схема

## Что делаем

Хотим показывать интерфейс на разных языках. В схеме есть \`localizations[]\` —
массив языков, каждый со своими ключами.

## Структура

\`\`\`yaml
localizations:
  - language: ru
    keys:
      - key: entity.Ioc.name
        to: Индикатор
      - key: attribute.Ioc.value.name
        to: Значение
  - language: en
    keys:
      - key: entity.Ioc.name
        to: Indicator
      - key: attribute.Ioc.value.name
        to: Value
\`\`\`

| Поле | Обязательно | Описание |
|---|---|---|
| \`language\` | да | Код языка (\`ru\`, \`en\`, …) |
| \`keys[].key\` | да | Ключ локализации |
| \`keys[].to\` | да | Перевод |
| \`keys[].ordinal\` | нет | Формы множественного числа |

---

## Плюрализация

Если строка зависит от числа — используйте \`ordinal\`:

\`\`\`yaml
localizations:
  - language: ru
    keys:
      - key: counter.incidents
        to: "{count} инцидент"
        ordinal:
          zero: "{count} инцидентов"
          one: "{count} инцидент"
          two: "{count} инцидента"
          few: "{count} инцидента"
          many: "{count} инцидентов"
          other: "{count} инцидента"
\`\`\`

**Формы:**

| Форма | Русский | Пример |
|---|---|---|
| \`zero\` | 0 | 0 инцидентов |
| \`one\` | 1 | 1 инцидент |
| \`two\` | 2 | 2 инцидента |
| \`few\` | 3-4 | 3 инцидента |
| \`many\` | 5-20 | 5 инцидентов |
| \`other\` | дробные | 1.5 инцидента |

---

## Соглашение об именовании ключей

Хорошая практика — иерархические ключи:

\`\`\`
entity.<EntityId>.name
entity.<EntityId>.description
attribute.<EntityId>.<attrId>.name
attribute.<EntityId>.<attrId>.description
dataType.<DataTypeId>.name
view.<ViewId>.label
action.<ActionId>.name
enumValue.<DataTypeId>.<valueId>.name
workflowStatus.<DataTypeId>.<statusId>.name
\`\`\`

Такая схема:

- Легко читается глазами.
- Легко грепается.
- Однозначно соответствует структуре схемы.

---

## Как применяется в UI

Если для элемента есть перевод в **активной** локализации — он отображается.
Если нет — используется \`name\` из схемы. Если и \`name\` нет — \`id\`.

Приоритет:

1. \`localizations[].keys[].to\` (для активного языка)
2. \`entities[].name\` / \`attributes[].name\` / …
3. \`id\`

Поэтому важно: **не убирайте \`name\`** из схемы при добавлении локализаций —
это fallback для языков, где перевода ещё нет.

---

## Лучшие практики

### Храните все языки в одном файле

Да, схема может быть большой, но один файл — один источник правды:

\`\`\`yaml
localizations:
  - language: ru
    keys: [...]
  - language: en
    keys: [...]
  - language: de
    keys: [...]
\`\`\`

Разбивка по файлам требует синхронизации \`key\` между ними и ломается
при переименовании.

### Используйте ISO-коды

\`ru\`, \`en\`, \`de\` — без субтэгов (\`en-US\`, \`ru-RU\`). Система использует
базовый язык как fallback.

### Плейсхолдеры в \`to\`

В \`to\` можно использовать те же \`{...}\`, что и в \`label\`:

\`\`\`yaml
- key: notification.count
  to: "Создано {count} объектов за {period}"
  ordinal: ...
\`\`\`

### Не переводите id

\`id\`, \`route\`, ссылки на сущности в \`Reference.entity\` — **не локализуются**.
Только человекочитаемые поля: \`name\`, \`label\`, \`description\`.

---

## Что проверяет линтер

- \`localization/duplicate-language\` — язык объявлен дважды.
- \`localization/duplicate-key\` — ключ объявлен дважды в одном языке.

Что **не** проверяется (надо руками):

- Наличие одинаковых ключей во всех языках.
- Отсутствие «осиротевших» ключей, ссылающихся на удалённые сущности.
- Корректность форм плюрализации для конкретного языка.

---

## Полный пример

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
        name: Значение
        dataType: String
      - id: type
        name: Тип
        dataType: enumIocTypes

dataTypes:
  - id: enumIocTypes
    name: Типы индикаторов
    dataType: Enum
    values:
      - id: IP
        name: IP-адрес
      - id: Domain
        name: Домен

localizations:
  - language: ru
    keys:
      - key: entity.Ioc.name
        to: Индикатор
      - key: attribute.Ioc.value.name
        to: Значение
      - key: attribute.Ioc.type.name
        to: Тип
      - key: enumValue.enumIocTypes.IP.name
        to: IP-адрес
      - key: enumValue.enumIocTypes.Domain.name
        to: Домен
      - key: notification.iocsCreated
        to: "Создано {count} индикаторов"
        ordinal:
          one: "Создан {count} индикатор"
          few: "Создано {count} индикатора"
          many: "Создано {count} индикаторов"

  - language: en
    keys:
      - key: entity.Ioc.name
        to: Indicator
      - key: attribute.Ioc.value.name
        to: Value
      - key: attribute.Ioc.type.name
        to: Type
      - key: enumValue.enumIocTypes.IP.name
        to: IP address
      - key: enumValue.enumIocTypes.Domain.name
        to: Domain
      - key: notification.iocsCreated
        to: "{count} indicators created"
        ordinal:
          one: "{count} indicator created"
          other: "{count} indicators created"
\`\`\`

## Связанные секции

- **Сущности и атрибуты** — name, description
- **Типы данных** — name в Enum / Workflow
`,
};
