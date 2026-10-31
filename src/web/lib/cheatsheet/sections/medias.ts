import type { CheatsheetSection } from "../types";

export const medias: CheatsheetSection = {
  id: "medias",
  label: "Иконки",
  icon: "image",
  docsRef: "§ Иконки — стр. 414",
  md: `
# Иконки (medias)

## Назначение

Медиа-ресурсы для виджетов и меню.

## Обязательные поля

| Поле | Описание |
|---|---|
| \`id\` | View ID |
| \`type\` | В текущей реализации \`icon_name\` |
| \`iconName\` | Идентификатор из дизайн-системы |

## Пример

\`\`\`yaml
medias:
  - id: iconsAdd
    type: icon_name
    iconName: plus
  - id: iconsEdit
    type: icon_name
    iconName: pencil
  - id: iconsDelete
    type: icon_name
    iconName: trash
  - id: iconsView
    type: icon_name
    iconName: eye
\`\`\`

## Использование

В кнопках модалок:

\`\`\`yaml
views:
  - id: forms_newIoc
    type: modal
    buttons:
      - type: submit
        control:
          type: regular_button
          icon: iconsAdd
\`\`\`

В меню:

\`\`\`yaml
menus:
  - id: menus_root
    icon: iconsView
\`\`\`

В действиях у ячейки таблицы:

\`\`\`yaml
table:
  columns:
    - id: name
      actions:
        - action: actions_editIoc
          control:
            type: regular_button
            icon: iconsEdit
\`\`\`

## Где взять iconName

Имена берутся из дизайн-системы R-Vision. Частые: \`plus\`, \`pencil\`, \`trash\`, \`eye\`, \`folder\`, \`account_tree\`, \`link\`, \`download\`, \`upload\`.
`,
};
