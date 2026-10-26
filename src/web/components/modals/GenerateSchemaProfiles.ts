// src/web/components/modals/GenerateSchemaProfiles.ts
export interface ProfileInfo {
  id: string;
  label: string;
  short: string;
  details: Array<{ icon: string; text: string }>;
  when: string;
}

export const PROFILE_INFO: ProfileInfo[] = [
  {
    id: "crud",
    label: "CRUD",
    short: "Создание, редактирование, удаление",
    details: [
      {
        icon: "bolt",
        text: "Действия: создать, изменить, открыть панель, удалить, массовое удаление",
      },
      {
        icon: "view_quilt",
        text: "Entity-view: виджеты атрибутов + кнопки действий",
      },
      {
        icon: "table_rows",
        text: "List-view: таблица, фильтры, сортировка, пагинация",
      },
      {
        icon: "view_sidebar",
        text: "Панель + модалки создания/редактирования",
      },
      { icon: "menu", text: "Пункт меню в первом root_group домена" },
      {
        icon: "link",
        text: "Linkage-виджеты для существующих связей сущности",
      },
    ],
    when: "Обычная сущность с полным жизненным циклом",
  },
  {
    id: "crud-with-page",
    label: "CRUD + полная карточка",
    short: "То же + полноэкранная страница",
    details: [
      { icon: "fullscreen", text: "Всё из CRUD, плюс pages_infoX" },
      {
        icon: "open_in_new",
        text: "Кнопка «Полный экран» в панели и контекстном меню",
      },
      {
        icon: "warning",
        text: "Требует root_group в menus[] — иначе page не сгенерируется",
      },
    ],
    when: "Сущность с насыщенной карточкой — много вкладок, связей, полей",
  },
  {
    id: "dictionary",
    label: "Справочник",
    short: "Только entity-view с editors",
    details: [
      { icon: "edit_note", text: "Entity-view с editors по всем атрибутам" },
      { icon: "remove", text: "Без actions, panels, modals, menu, list" },
    ],
    when: "Справочник, открывающийся по клику на тег в Reference — как карточка",
  },
  {
    id: "no-modals",
    label: "Без модалок",
    short: "Read-only: только list + панель",
    details: [
      { icon: "table_rows", text: "List-view с массовым удалением" },
      { icon: "view_sidebar", text: "Панель с кнопкой «Удалить»" },
      { icon: "remove", text: "Без форм создания и редактирования" },
    ],
    when: "Сущность, которая наполняется автоматизацией и только читается пользователем",
  },
  {
    id: "tree-view",
    label: "Дерево",
    short: "Иерархический просмотр по связям",
    details: [
      { icon: "account_tree", text: "trees[] с иерархией по side-1 связям" },
      {
        icon: "table_rows",
        text: "Tree-view (merged) или list + дерево (splitted)",
      },
      { icon: "bolt", text: "Action open_tree для запуска" },
    ],
    when: "Иерархии: категории, оргструктура, каталог",
  },
  {
    id: "technical",
    label: "Техническая",
    short: "UI не генерируется",
    details: [
      {
        icon: "settings_suggest",
        text: "Ничего не создаётся — только пометка в манифесте",
      },
    ],
    when: "Reference-target без UI, справочник кодов, вспомогательная сущность",
  },
];

export function getProfileInfo(id: string): ProfileInfo | null {
  return PROFILE_INFO.find((p) => p.id === id) || null;
}
