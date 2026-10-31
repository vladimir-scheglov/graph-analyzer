import type { CheatsheetSection } from "../types";

export const systemAttributes: CheatsheetSection = {
  id: "system-attributes",
  label: "Системные атрибуты",
  icon: "shield",
  group: "data",
  docsRef: "§ Системные атрибуты — стр. 318–320",
  md: `
# Системные атрибуты

## Что это

Автоматически создаются системой на каждом объекте и связи. **Не описываются**
в \`entities[].attributes[]\`, но доступны во всех контекстах, где можно ссылаться
на обычный атрибут: виджеты, колонки, \`searching\`, \`sorting\`, \`dataRules\`, RQL.

Значения всех, кроме \`organizationId\`, обновляются системой автоматически.

## Список

| ID | Тип | Отображаемое имя | Описание |
|---|---|---|---|
| \`id\` | Uuid | Идентификатор объекта | UUID экземпляра |
| \`label\` | String | Лейбл | Человекочитаемый ID объекта |
| \`version\` | Integer | Версия объекта | Версия записи |
| \`organizationId\` | Reference (Organization) | Организация | Привязка к организации |
| \`domainId\` | String (FQDN) | Идентификатор домена | FQDN домена из схемы |
| \`entityId\` | String (Definition ID) | Идентификатор сущности | id из \`entities[].id\` |
| \`entityName\` | String | Название сущности | \`name\` сущности |
| \`createdAt\` | Timestamp | Дата создания | С точностью до секунд |
| \`createdBy\` | Reference (User) | Создал | displayName пользователя |
| \`updatedAt\` | Timestamp | Дата изменения | С точностью до секунд |
| \`updatedBy\` | Reference (User) | Изменил | displayName пользователя |
| \`tenantId\` | Reference (Tenant) | Идентификатор тенанта | Тенант-владелец |

---

## Где можно использовать

| Атрибут | В виджете | В колонке | В sorting | В searching | В dataRules | В RQL |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| \`id\` | ✓ | ✓ | — | — | ⚠ | ✓ |
| \`label\` | ✓ | ✓ | — | — | ⚠ | ✓ |
| \`version\` | ✓ | ✓ | — | — | ⚠ | ✓ |
| \`organizationId\` | ✓ | ✓ | — | — | ✓ (required / readonly) | ✓ |
| \`domainId\` | ✓ | ✓ | — | — | — | ✓ |
| \`entityId\` | ✓ | ✓ | — | — | — | ✓ |
| \`entityName\` | ✓ | ✓ | — | — | — | ✓ |
| \`createdAt\` | ✓ | ✓ | ✓ | — | ✓ (readonly) | ✓ |
| \`createdBy\` | ✓ | ✓ | — | — | ✓ (readonly) | ✓ |
| \`updatedAt\` | ✓ | ✓ | ✓ | — | ✓ (readonly) | ✓ |
| \`updatedBy\` | ✓ | ✓ | — | — | ✓ (readonly) | ✓ |
| \`tenantId\` | ✓ | ✓ | — | — | — | ✓ |

**Условные обозначения:**

- ✓ — работает
- ⚠ — работает, но линтер ругается (\`dataRule/readonly-on-system\`)
- — — не рекомендуется / нет смысла

**Виджет атрибута:**

\`\`\`yaml
- id: editor_createdAt
  type: attribute
  attribute: createdAt
  control:
    type: timestamp
\`\`\`

**Колонка таблицы:**

\`\`\`yaml
- id: col_entityName
  attribute: entityName
  label: Тип сущности
  layout:
    width: { default: 150, min: 80, max: 300 }
\`\`\`

**Сортировка:**

\`\`\`yaml
sorting:
  - id: sortByUpdated
    by:
      - attribute: updatedAt
        direction: desc
\`\`\`

**DataRules (readonly для системных):**

\`\`\`yaml
dataRules:
  - id: lock_createdAt
    target: entity
    entity: Incident
    condition: !rql incidentStatus = 'CLOSED'
    rule:
      effect: readonly
      attributes:
        - attribute: createdAt
        - attribute: updatedAt
\`\`\`

---

## \`organizationId\` — особый случай

Единственный системный атрибут, который можно:

1. Показывать в модалке создания — тогда пользователь **выбирает** организацию.
2. Не показывать — тогда объект считается **справочником** и виден всем.

По умолчанию необязателен. Сделать обязательным:

\`\`\`yaml
dataRules:
  - id: require_org
    target: entity
    entity: Incident
    condition: true
    rule:
      effect: required
      attributes:
        - attribute: organizationId
\`\`\`

Сменить через API / сценарий (пользователь не может):

\`\`\`yaml
actions:
  - id: actions_moveOrg
    type: set_attribute_value
    entity: Incident
    values:
      - attribute: organizationId
        value: '...'
\`\`\`

---

## Что важно

- **Не добавляйте** системные id в \`entities[].attributes[]\` — линтер ругнётся
  \`naming/system-id-attribute\` и \`validation/raw-custom-datatype\`.
- В \`label\` сущности **можно** ссылаться на разрешённые системные:
  \`createdAt, createdBy, domainId, entityId, entityName, id, organizationId,
  updatedAt, updatedBy, version\`. Остальные — линтер \`entity/label-system-attribute-forbidden\`.
- В RQL доступны через \`@doc.createdAt\` и т.п.

## Связанные секции

- **Сущности и атрибуты** — label, sorting, searching
- **Правила данных** — readonly на системные
- **Матрица control.type** — какой редактор для системного
`,
};
