import type { CheatsheetRecipe } from "../types";

export const mixinCrossDomain: CheatsheetRecipe = {
  id: "mixin-cross-domain",
  title: "Миксин из другого домена",
  description:
    "Переиспользовать вкладку/форму из другого домена через type: view",
  sections: ["mixins", "views"],
  md: `
# Миксин из другого домена

## Что делаем

В домене \`audit.example.com\` есть красиво оформленная панель аудита. Хотим показать её в карточке инцидента из \`unit.example.com\` — без копирования кода.

## Шаги

1. В домене-источнике отметьте view как \`isMixin: true\`.
2. В целевом домене создайте \`mixins[]\` с \`type: view\`.
3. Укажите \`fromView\` — что копируем, и \`to\` — куда.

## 1. Домен-источник

\`\`\`yaml
# audit.example.com
views:
  - id: audit_info_tab
    type: entity
    entity: Audit
    isMixin: true
    groups:
      - id: audit_info_block
        type: block
        components:
          - widget: editors_auditScore
\`\`\`

## 2. Миксин в целевом домене

\`\`\`yaml
# unit.example.com
mixins:
  - id: audit_tab_in_incident
    type: view
    entity: Incident
    views:
      - id: mixin_audit_tab
        type: tab
        fromView: audit.example.com/audit_info_tab
        to:
          tab: tabs_info
        change:
          add:
            components:
              - block: audit.example.com/audit_info_block
\`\`\`

## 3. Лейбл вкладки (опционально)

\`\`\`yaml
change:
  add:
    tabs:
      tabs:
        - tab: audit.example.com/audit_info_block_as_tab
          label: Аудит
\`\`\`

## Ключевые моменты

- \`fromView\` принимает FQID (домен + view), потому что источник — в другом домене.
- В \`components[]\` ссылка на блок должна быть через FQID.
- \`isMixin: true\` обязателен на view-источнике, если он объявлен в чужом домене.

## Отладка

Если миксин не применяется:
- Проверьте, что \`targetEntityFqid\` (\`entity\`) существует в целевом домене.
- Проверьте, что \`fromView\` и \`tab\`/компоненты — с правильными FQID.
- Откройте целевую карточку — вкладка должна появиться.
`,
};
