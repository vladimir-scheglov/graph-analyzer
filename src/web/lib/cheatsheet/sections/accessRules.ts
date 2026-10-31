import type { CheatsheetSection } from "../types";

export const accessRules: CheatsheetSection = {
  id: "accessRules",
  label: "Правила доступа",
  icon: "lock",
  group: "rules",
  docsRef: "§ AccessRules — раздел «Управление доступом»",
  md: `
# Правила доступа (accessRules)

## Назначение

\`accessRules[]\` определяет, **кто** и **что** может делать с сущностями,
связями и действиями домена. Управляет отображением и доступностью
элементов в UI и проверками на API.

## Структура

| Поле | Обязательно | Описание |
|---|---|---|
| \`target\` | да | Тип цели |
| \`entity\` | при \`target: entity\` | FQID сущности |
| \`linkage\` | при \`target: linkage\` | FQID связи |
| \`id\` | при \`target: action\` | ID действия |
| \`create\` / \`delete\` / \`edit\` / \`view\` | нет | Массив \`AccessRuleItem[]\` — scope для entity / linkage |
| \`launch\` | при \`target: action\` / \`any_action\` | Массив \`AccessRuleItem[]\` |

### \`target\`

| \`target\` | Описание |
|---|---|
| \`entity\` | Одна сущность (\`entity\` FQID) |
| \`linkage\` | Одна связь (\`linkage\` FQID) |
| \`action\` | Одно действие (\`id\`) |
| \`any_entity\` | Все сущности домена |
| \`any_linkage\` | Все связи домена |
| \`any_action\` | Все действия домена |

**Scope-массивы:**

- Для \`entity\` / \`linkage\` / \`any_*\` — \`create, delete, edit, view\`.
- Для \`action\` / \`any_action\` — только \`launch\`.

⚠️ Если у \`target: entity\` задан \`launch\` — линтер ругнётся
\`accessRule/launch-on-entity\`.

---

## \`AccessRuleItem\`

Каждый элемент scope — объект \`{ kind, ... }\`.

| \`kind\` | Поля | Что делает |
|---|---|---|
| \`permission\` | \`permission\` | Разрешить действие если пользователь имеет это разрешение |
| \`pass\` | — | Пропустить без проверки |
| \`condition\` | \`condition\` (RQL) | Разрешить если условие истинно |

**\`except[]\`** — массив исключений: \`{ attribute, condition? }\`.

---

## Примеры

### Разные проверки для create / edit / delete

\`\`\`yaml
accessRules:
  - target: entity
    entity: Incident
    create:
      - kind: permission
        permission: perm_create_incident
    edit:
      - kind: permission
        permission: perm_edit_incident
      - kind: condition
        condition: !rql @CurrentUser.id = @doc.createdBy
    delete:
      - kind: condition
        condition: !rql hasRole('admin')
    view:
      - kind: pass
\`\`\`

**Что тут:**

- \`create\` — только с разрешением \`perm_create_incident\`.
- \`edit\` — можно, если есть \`perm_edit_incident\` **ИЛИ** пользователь — автор.
- \`delete\` — только админ.
- \`view\` — всем.

### Except — исключение для конкретных атрибутов

\`\`\`yaml
accessRules:
  - target: entity
    entity: Incident
    edit:
      - kind: permission
        permission: perm_edit_incident
        except:
          - attribute: severity
            condition: !rql @doc.severity = 'CRITICAL'
\`\`\`

**Что тут:** \`perm_edit_incident\` даёт редактирование всех атрибутов,
**кроме** \`severity\`, когда severity = \`CRITICAL\` (надо ещё что-то).

### Запуск действия

\`\`\`yaml
accessRules:
  - target: action
    id: actions_closeAudit
    launch:
      - kind: permission
        permission: perm_close_audit
      - kind: condition
        condition: !rql @doc.auditStatus = 'REVIEW'
\`\`\`

### Все сущности — читать всем, редактировать с ролью

\`\`\`yaml
accessRules:
  - target: any_entity
    view:
      - kind: pass
    edit:
      - kind: condition
        condition: !rql hasRole('editor')
    create:
      - kind: condition
        condition: !rql hasRole('editor')
    delete:
      - kind: pass          # запрещено всем
\`\`\`

**Что тут:** \`pass\` = **разрешить**. Нет правила = тоже «разрешено всем»
(по умолчанию accessRules не блокирует). Если нужно запретить — либо
не указывайте scope, либо используйте \`condition: !rql false\`.

⚠️ Отсутствие правила ≠ запрет. Отсутствие = разрешено.

### Все действия — только админ

\`\`\`yaml
accessRules:
  - target: any_action
    launch:
      - kind: condition
        condition: !rql isSuperAdmin()
\`\`\`

---

## Связка с \`permissions[]\`

\`\`\`yaml
permissions:
  - id: perm_create_incident
    name: Создание инцидента
  - id: perm_close_audit
    name: Закрытие аудита

accessRules:
  - target: entity
    entity: Incident
    create:
      - kind: permission
        permission: perm_create_incident
\`\`\`

\`permission\` в \`accessRules\` — **локальный id** из \`permissions[]\`.
Для cross-domain — FQID: \`<domain.tld>/<permissionId>\`.

---

## Правила и ограничения

- Для \`target: entity\` / \`linkage\` — не \`launch\`. Для \`target: action\` / \`any_action\` — только \`launch\`.
- \`permission\` в scope должен существовать в \`permissions[]\` (или FQID на чужой домен).
- \`condition\` — валидный RQL.
- \`except[].attribute\` — атрибут сущности / связи (с наследованием).
- Порядок scope внутри одного правила — **все должны выполниться** (AND).
- Порядок правил в массиве — **первое совпавшее** (OR).

## Связанные секции

- **Разрешения** — \`permissions[]\`
- **Чек-лист перед публикацией**
`,
};
