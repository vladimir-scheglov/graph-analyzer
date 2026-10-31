import type { CheatsheetSection } from "../types";

export const validationErrors: CheatsheetSection = {
  id: "validation-errors",
  label: "Ошибки валидации",
  icon: "bug_report",
  group: "rules",
  docsRef: "§ Обработка ошибок валидации — стр. 264–265",
  md: `
# Декодер ошибок валидации

## Как читать ошибки

При публикации схема валидируется на сервере. Ошибка выглядит так:

\`\`\`
[ERROR] <Класс>: <сообщение> at line <N> column <M>
\`\`\`

**Классы ошибок:**

- \`YamlParseError\` — синтаксис / структура YAML
- \`UnreachableReference\` — ссылка на несуществующий элемент
- \`InvalidDefinition\` — некорректное значение поля
- \`NotCompatible\` — несовместимость с предыдущей версией / связанными доменами
- \`MIXIN_*\` — специфичные для примесей

---

## YamlParseError

### \`missing required field () at line () column ()\`

**Причина:** не указано обязательное поле схемы / RObject.

**Типичные места:**

- \`entities[].id\` отсутствует
- \`linkages[].side1 / side2 / type\` не заданы
- \`dataTypes[].dataType\` отсутствует
- \`actions[].type\` / \`actions[].id\` не заполнены
- \`views[].type\` / \`views[].id\` отсутствуют
- \`menus[].route\` / \`placement\` / \`type\` не заданы (это \`required\`!)

**Что делать:** откройте указанную строку, добавьте поле. Проверьте по чек-листу «Обязательные поля» каждой секции.

### \`Incorrect structure or line shift: could not find expected () at line () column ()\`

**Причина:** нарушены отступы YAML или структура (массив vs объект).

**Типичные причины:**

- Табы вместо пробелов
- Неверный отступ после \`-\` (\`- id\` на одном уровне, а поля — с меньшим indent)
- \`attributes:\` на уровне сущности, но \`- id:\` — с тем же indent, что и \`attributes\`
- Кавычки не закрыты
- Двоеточие внутри значения без кавычек (\`name: Foo: Bar\`)

**Что делать:** откройте YAML-редактор, он подсветит проблему через \`yaml.load\`. Проверьте отступы (2 пробела на уровень, не табы).

---

## UnreachableReference

### \`the reference to entity () is unreachable at line () column ()\`

**Причина:** \`inherits\`, \`entity\`, \`side1\`, \`side2\` и т.п. ссылаются на несуществующую сущность **в текущем домене**.

**Типичные причины:**

- Опечатка в id сущности
- Сущность удалена / переименована
- Регистр: \`Entity: device\` вместо \`Device\`

**Что делать:** проверьте id сущности в \`entities[]\`. Если сущность из другого домена — используйте FQID (\`domain.tld/Entity\`).

### \`the reference to attribute is unreachable () at line () column ()\`

**Причина:** атрибут в \`views[].widgets[].attribute\`, \`dataRules[].attributes[].attribute\`, \`sorting[].by[].attribute\` и т.п. не существует в сущности.

**Типичные причины:**

- Опечатка в id атрибута
- Ссылка на атрибут родителя без префикса: \`attribute: hostname\` вместо \`attribute: Device.hostname\`
- Кросс-доменная ссылка без FQID

**Что делать:** проверьте \`entities[].attributes[].id\`. Для родителя — \`Parent.attr\` или \`domain.tld/Parent.attr\`.

### \`the entity or attribute at another domain () is unreachable: () at line () column ()\`

**Причина:** FQID ссылается на домен, которого нет в инсталляции, или на несуществующую сущность в этом домене.

**Типичные причины:**

- Домен не опубликован / не зарегистрирован
- Опечатка в FQDN
- Сущность в целевом домене не создана

**Что делать:** проверьте \`id\` домена и \`entities[].id\` в целевом домене. Локальный линтер даёт \`info\` для незагруженных доменов — на сервере это \`error\`.

### \`the entity or attribute at the current domain scheme is unreachable to domain (): () at line () column ()\`

**Причина:** другая схема ссылается на элемент **текущей** схемы, но его там нет.

**Что делать:** вы **удалили** сущность/атрибут, который кто-то использует. Верните его или обновите ссылающийся домен.

---

## InvalidDefinition

### \`the constraint is not supported by attribute type at line () column ()\`

**Причина:** \`constraints[].kind\` несовместим с \`dataType\` атрибута.

**Матрица совместимости:**

| \`kind\` | Применим к |
|---|---|
| \`required\` | все (кроме Counter, Identifier) |
| \`unique\` | String, Integer, Uuid, Reference, Array, Table |
| \`range\` | Integer, Decimal, Float |
| \`length\` | String, Text |
| \`regexp\` | String, Text |
| \`size\` | Attachment |
| \`mime_types\` | Attachment |

**Что делать:** уберите несовместимый \`kind\` или смените \`dataType\`.

---

## NotCompatible

### \`the entity at the new version of domain scheme is changed or deleted: () at line () column ()\`

**Причина:** в новой версии схемы **удалена или переименована** сущность, которая существует на сервере.

**Правило:** атрибуты можно менять / удалять — **сущности нельзя** удалять или переименовывать.

**Что делать:** верните сущность. Если реально нужно удалить — мигрируйте данные или создайте новый домен.

### \`the attribute type at the current domain scheme is not compatible at line () column ()\`

**Причина:** тип атрибута несовместим с типом, который уже есть в связанных доменах (на них ссылается эта схема).

**Типичные случаи:**

- Меняете \`String\` на \`Integer\` — данные не мигрируют
- Меняете \`Reference\` на \`String\` — рвутся связи

**Что делать:** создайте новый атрибут с новым типом, мигрируйте данные, удалите старый.

### \`the attribute constraint at the current domain scheme is not compatible at line () column ()\`

**Причина:** constraint несовместим с уже существующими данными или со связанными доменами.

**Что делать:** снимите constraint, мигрируйте данные, добавьте constraint обратно.

---

## Ошибки примесей (\`mixins[]\`)

### \`MIXIN_LINK_INVALID\`

**Причина:** \`mixins[].entity.from / entity.to\` или \`mixins[].linkage\` ссылаются на несуществующий элемент **в текущем домене**.

**Что делать:**

- Для \`type: linkage\` — \`entity.from\` / \`entity.to\` и \`linkage\` обязательны и должны существовать
- Для \`type: view\` — \`entity\` обязательна
- Проверьте, что \`linkage\` направленная (\`n_n\` + \`undirected: true\` — запрещено)

### \`MIXIN_INHERITANCE_CONFLICT\`

**Причина:** конфликт весов примесей в иерархии наследования.

**Типичные случаи:**

- Примесь и её дочерняя примесь имеют одинаковый \`weight\` и разные типы
- Примесь добавляет вкладку, которая уже добавлена другой примесью с меньшим \`weight\` в родительском представлении

**Что делать:** задайте явный \`weight\` (меньше = выше приоритет). Проверьте порядок применения.

### \`MIXIN_RECURSION_ERROR\`

**Причина:** циклическая зависимость в цепочке наследования примесей.

**Типичный случай:** примесь A подмешивает из B, B — из A.

**Что делать:** разорвите цикл — например, в одной из примесей уберите \`fromView\` / \`entity.from\`, который ссылается на другую.

---

## Быстрый чек-лист «что проверить сначала»

1. **Отступы YAML.** Табы запрещены, 2 пробела на уровень.
2. **\`id\` у всех элементов.** Каждая запись массива обязана иметь \`id\`.
3. **FQID кросс-домена.** \`domain.tld/Entity\` — домен есть в инсталляции.
4. **Атрибуты родителя.** \`Parent.attr\`, не \`attr\`.
5. **\`constraints[].kind\` ↔ \`dataType\`.** См. матрицу выше.
6. **\`menus[].route\`.** Уникален в рамках домена и всей системы.
7. **\`placement\` и \`type\` в \`menus[]\`.** Обязательны.
8. **\`linkages[].side1 / side2 / type\`.** Все три обязательны.
9. **\`linkages[].nameFrom.side1 ≠ nameFrom.side2\`.** Для направленных связей.
10. **\`actions[].type\` ↔ required поля.** См. раздел «Действия».

## Связанные секции

- **Сущности и атрибуты** — обязательные поля
- **Связи** — required, nameFrom, sides
- **Действия** — required по типам
- **Меню** — route, type, placement
- **Типы данных** — совместимость constraints
`,
};
