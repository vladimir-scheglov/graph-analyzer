import type { CheatsheetSection } from "../types";

export const controlMatrix: CheatsheetSection = {
  id: "control-matrix",
  label: "Матрица control.type",
  icon: "grid_on",
  group: "ui",
  docsRef: "§ Редакторы и представления атрибутов — стр. 273–275",
  md: `
# Матрица \`dataType\` → допустимые \`control.type\`

Какой редактор можно указать в \`control.type\` для каждого типа данных в разных
контекстах. Если указан редактор, не подходящий для типа, — сервер ругнётся
\`InvalidDefinition\`. Если указан допустимый — он и применится. Если не указан
или указан недопустимый — берётся первый из столбца «По умолчанию».

**Контексты:**

- **Modal** — форма значения в модальном окне создания/редактирования
- **Panel** — редактор значения атрибута по месту (панель)
- **Cell** — ячейка таблицы (list-view, linkage table, table-attribute)
- **Readonly** — нередактируемое представление значения

## Основная матрица

| \`dataType\` | Modal | Panel | Cell | Readonly | По умолчанию |
|---|---|---|---|---|---|
| \`Uuid\` | \`uuid\` | \`uuid\` | \`text\` | \`text\` | \`uuid\` |
| \`Identifier\` | \`uuid\` | \`text\` | \`text\` | \`text\` | \`uuid\` |
| \`Timestamp\` | \`timestamp\` | \`timestamp\` | \`timestamp\`, \`text\` | \`text\` | \`timestamp\` |
| \`Date\` | \`date\` | \`date\` | \`date\`, \`text\` | \`text\` | \`date\` |
| \`Time\` | \`time\` | \`time\` | \`time\`, \`text\` | \`text\` | \`time\` |
| \`TimestampRange\` | \`timestamp_range\` | \`timestamp_range\` | \`text\` | \`text\` | \`timestamp_range\` |
| \`String\` | \`text\`, \`text_area\` | \`text\`, \`text_area\` | \`text\`, \`text_area\` | \`text\` | \`text\` |
| \`Text\` | \`text\`, \`text_area\` | \`text\`, \`text_area\` | \`text\` | \`text\` | \`text_area\` |
| \`MAC\` | \`mac\` | \`mac\` | \`mac\`, \`text\` | \`text\` | \`mac\` |
| \`Integer\` | \`integer\`, \`integer_slider\` | \`integer\`, \`integer_slider\` | \`text\` | \`text\` | \`integer\` |
| \`Decimal\` | \`decimal\`, \`decimal_slider\` | \`decimal\`, \`decimal_slider\` | \`text\` | \`text\` | \`decimal\` |
| \`Float\` | \`float\`, \`float_slider\` | \`float\`, \`float_slider\` | \`text\` | \`text\` | \`float\` |
| \`Bool\` | \`switch\`, \`checkbox\` | \`switch\`, \`checkbox\` | \`switch\`, \`checkbox\`, \`bool_text\` | \`switch\`, \`checkbox\`, \`bool_text\` | \`switch\` |
| \`Enum\` | \`select\`, \`radio\` | \`select\` | \`tag\`, \`level\`, \`text\` | \`text\`, \`level\` | \`select\` |
| \`Workflow\` | \`select\` | \`select\` | \`select\`, \`level\`, \`text\` | \`text\`, \`level\` | \`select\` |
| \`IpAddress\` | \`ip\` | \`ip\` | \`ip\`, \`text\` | \`text\` | \`ip\` |
| \`CIDR\` | \`cidr\` | \`cidr\` | \`cidr\`, \`text\` | \`text\` | \`cidr\` |
| \`Attachment\` | \`file\`, \`drag_drop_area\` | \`file\`, \`drag_drop_area\` | \`file\`, \`text\` | \`file\`, \`text\` | \`file\` |
| \`Reference\` | \`select\`, \`tag\` | \`link\`, \`tag\` | \`link\`, \`tag\` | \`link\`, \`tag\` | \`link\` |
| \`URL\` | \`link\` | \`link\` | \`link\` | \`link\` | \`link\` |

---

## Специальные контексты

### \`table.columns[].control.type: tree_path\`

Только для отображения пути к узлу дерева. Требует \`control.tree\`.

\`\`\`yaml
- id: treePath
  attribute: id
  control:
    type: tree_path
    tree: DevicesTree
\`\`\`

⚠️ Не поддерживает сортировку и фильтрацию.

### \`widgets[].control.type\` для виджета \`action\`

| \`control.type\` | Когда |
|---|---|
| \`regular_button\` | Обычная кнопка |
| \`dropdown\` | Только \`bulk + operation: edit_attribute\` |
| \`drag_drop_area\` | Только \`scenario\` или \`open_modal\` |

### \`widgets[].control.type\` для виджета \`linkage\`

| \`side\` | Допустимые |
|---|---|
| \`side: 1\` (один объект) | \`select\` |
| \`side: 2\` (несколько) | \`multi_select\`, \`table\` |
| Транзитивная связь (\`join\`) | \`table\` с \`displayMode: flat \\| grouped\` |

### \`buttons[].control.type\` (модалка)

Только \`regular_button\`.

### \`menu[].control.type\` (панель)

Только \`regular_button\` / \`dropdown\` / \`drag_drop_area\`.

---

## Расшифровка редакторов

| Имя | Что это |
|---|---|
| \`checkbox\` | Флажок |
| \`switch\` | Переключатель |
| \`tag\` | Тег |
| \`level\` | Индикатор уровня |
| \`radio\` | Радиокнопки |
| \`select\` | Выпадающий список |
| \`multi_select\` | Мультивыбор |
| \`mitre_multi_select\` | Справочник MITRE ATT&CK |
| \`tag_list\` | Множество значений |
| \`ip\` / \`cidr\` / \`mac\` | Валидированные поля адресов |
| \`link\` | Ссылка |
| \`file\` / \`drag_drop_area\` | Загрузка файла |
| \`text\` / \`text_area\` | Одно- / многострочное поле |
| \`integer_slider\` / \`decimal_slider\` / \`float_slider\` | Ползунок |
| \`timestamp\` / \`date\` / \`time\` / \`timestamp_range\` | Даты |
| \`bool_text\` | Текст вместо \`true\` / \`false\` |
| \`tree_path\` | Путь в дереве |
| \`rql\` | Редактор RQL |
| \`external\` | Внешний виджет |

## Связанные секции

- **Виджеты** — \`control.type\` и примеры
- **Типы данных** — constraints и dataType
- **Представления** — \`table.columns[].control\`
`,
};
