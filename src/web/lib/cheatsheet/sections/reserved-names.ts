import type { CheatsheetSection } from "../types";

export const reservedNames: CheatsheetSection = {
  id: "reserved-names",
  label: "Ограничения идентификаторов",
  icon: "fingerprint",
  group: "data",
  docsRef: "§ Правила создания идентификаторов — стр. 270–272",
  md: `
# Ограничения идентификаторов

## Зарезервированные имена

Следующие имена **нельзя** использовать как \`Data ID\` и \`View ID\` — валидация
на сервере упадёт:

\`\`\`
aux  com1 com2 com3 com4 com5 com6 com7 com8 com9
lpt1 lpt2 lpt3 lpt4 lpt5 lpt6 lpt7 lpt8 lpt9
con  nul  prn
\`\`\`

Это зарезервированные имена устройств Windows (DOS-совместимость).

## Системные id (тоже нельзя)

\`id, label, version, organizationId, domainId, entityId, entityName,
createdAt, createdBy, updatedAt, updatedBy, tenantId\` — используются системой
на каждом объекте.

---

## Соглашения об именовании

### Домен (FQDN)

Соответствует DNS: строчные буквы, цифры, точки, дефис. Используется как \`id\`
схемы.

\`\`\`
my.domain.tld
it.assets.rvision.ru
\`\`\`

### Сущности (\`Data ID\`)

- **PascalCase** (первая буква заглавная, разделителей нет)
- Символы: \`a-z A-Z 0-9\`
- Длина: ≤ 30

✓ \`Asset\`, \`DeviceConfiguration\`
✗ \`asset\`, \`device_config\`, \`device-config\`

### Атрибуты (\`Data ID\`)

- **camelCase** (первая строчная, следующие слова с заглавной)
- Символы: \`a-z A-Z 0-9\`
- Длина: ≤ 30
- **Точки не рекомендуются** — система трактует \`.\` как «обращение к атрибуту родителя» и запускает наследование.

✓ \`os\`, \`ipAddress\`, \`updatedAt\`
✗ \`Os\`, \`ip_address\`, \`Device.os\`

### Типы данных (\`Data ID\`)

- **PascalCase**
- Символы: \`a-z A-Z 0-9\`
- Длина: ≤ 63

✓ \`String\`, \`Uuid\`, \`MyTable\`, \`enumIocTypes\` (для совместимости — но лучше PascalCase)
✗ \`my_table\`

### Views / Actions / Widgets / Groups (\`View ID\`)

- **camelCase** (префикс — произвольный, для группировки)
- Символы: \`a-z A-Z 0-9 _\` (допустимы также \`:#@$.\`, но **избегайте**)
- Длина: ≤ 63

Рекомендуемые префиксы:

| Префикс | Для чего |
|---|---|
| \`lists_\` | list-view |
| \`view\` | entity-view |
| \`panels_\` | panel |
| \`forms_\` | modal |
| \`pages_\` | page |
| \`treeView_\` | tree-view |
| \`tabs_\` | tabs_list |
| \`buttons_\` | action-widget (кнопка) |
| \`editors_\` | attribute-widget |
| \`blocks_\` | group type: block |
| \`actions_\` | action |
| \`menus_\` | menu root |
| \`icons\` / \`images\` | медиаресурсы |

✓ \`lists_iocs\`, \`viewIoc\`, \`actions_createIoc\`, \`buttons_editIoc\`
✗ \`ListsIocs\`, \`lists-iocs\`

**Точки в View ID**: допустимы, но **избегайте** — система интерпретирует
\`.\` как наследование, что даёт неожиданное поведение.

### Перечисления (\`type\`, \`kind\`)

- **snake_case** (строчные буквы, разделитель \`_\`)
- Символы: \`a-z A-Z 0-9 \` (без пробелов)
- Длина: ≤ 63

✓ \`abstract\`, \`open_modal\`, \`1_n\`, \`n_n\`
✗ \`OpenModal\`, \`open-modal\`

### Пути в меню / группах

Стандартный URL-путь: \`/\` + сегменты строчными буквами, цифрами и дефисом.

✓ \`/assets\`, \`/assets/main-devices\`
✗ \`/Assets\`, \`/assets/main_devices\`

⚠️ \`route\` **уникален** в рамках всей системы, не только домена.

### Медиаресурсы (иконки, изображения)

- **camelCase** с префиксом \`icons\` / \`images\`
- Символы: \`a-z A-Z 0-9\`
- Длина: ≤ 63

✓ \`iconsassets\`, \`iconsdevice\`, \`iconsAdd\`
✗ \`icons-assets\`, \`Assets_icons\`

---

## Чек-лист перед публикацией

- [ ] Нет зарезервированных имён (\`aux\`, \`con\`, \`prn\`, \`com1..9\`, \`lpt1..9\`, \`nul\`).
- [ ] \`entities[].id\` — PascalCase, ≤ 30.
- [ ] \`entities[].attributes[].id\` — camelCase, ≤ 30, без точек.
- [ ] \`dataTypes[].id\` — PascalCase, ≤ 63.
- [ ] \`views[].id\` / \`actions[].id\` — camelCase, ≤ 63, с осмысленным префиксом.
- [ ] \`menus[].route\` — уникален, начинается с \`/\`, только \`[a-z0-9-]\`.
- [ ] \`view\`-id не содержит точек (или явно понимаете, что это наследование).
- [ ] Нет ссылок на системные id в \`attributes[]\`.

## Связанные секции

- **Сущности и атрибуты** — id, label, sorting
- **Меню** — route, type, placement
- **Ошибки валидации** — \`YamlParseError: missing required field\`
`,
};
