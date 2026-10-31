// src/web/components/modals/GenerateSchemaProfiles.ts
export interface ProfileInfo {
  id: string;
  label: string;
  short: string;
  scope: "entity" | "domain";
  details: Array<{ icon: string; text: string }>;
  when: string;
}

export const PROFILE_INFO: ProfileInfo[] = [
  {
    id: "crud",
    scope: "entity",
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
    scope: "entity",
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
    scope: "entity",
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
    scope: "entity",
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
    scope: "entity",
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
    id: "sorting-searching",
    scope: "entity",
    label: "Sorting / Searching",
    short: "Правила сортировки и поиска",
    details: [
      {
        icon: "sort",
        text: "sorting[] — одно правило по первому скалярному атрибуту",
      },
      {
        icon: "search",
        text: "searching[] — все String/Text/Date/Timestamp/Integer/Uuid + Enum/Workflow",
      },
      {
        icon: "history",
        text: "Существующие sorting/searching не перезаписываются",
      },
    ],
    when: "Сущность создана без sorting/searching — быстро догенерировать",
  },
  {
    id: "transitive-chain",
    scope: "entity",
    label: "Транзитивная связь",
    short: "Цепочка через промежуточные сущности",
    details: [
      {
        icon: "conversion_path",
        text: "transitiveLinkages[] с цепочкой joins",
      },
      {
        icon: "widgets",
        text: "join-виджет в существующем entity-view",
      },
      {
        icon: "view_column",
        text: "join-колонка в существующем list-view",
      },
    ],
    when: "Показать в списке оборудование → город → офис через 2 хопа",
  },
  {
    id: "auto",
    scope: "entity",
    label: "Авто (по флагам)",
    short: "Профиль выбирается по ui-флагам сущности",
    details: [
      {
        icon: "inventory_2",
        text: "ui: { list: false, modals: false } → Справочник",
      },
      {
        icon: "visibility",
        text: "ui: { modals: false } с list → Без модалок (read-only)",
      },
      {
        icon: "auto_awesome",
        text: "Остальные → полный CRUD",
      },
    ],
    when: "«Развернуть домен с нуля» — авто-выбор профиля для каждой сущности",
  },
  {
    id: "defaults",
    scope: "entity",
    label: "Значения по умолчанию",
    short: "dataRules.default для Enum/Bool/Workflow",
    details: [
      {
        icon: "toggle_on",
        text: "Bool → false (настраивается)",
      },
      {
        icon: "list",
        text: "Enum → первое не-hidden значение",
      },
      {
        icon: "conversion_path",
        text: "Workflow → initial-статус",
      },
      {
        icon: "rule",
        text: "Одно правило dataRules на сущность, не перезаписывает существующие",
      },
    ],
    when: "Сущность с множеством Enum/Workflow-атрибутов без явных дефолтов",
  },
  {
    id: "technical",
    scope: "entity",
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
  {
    id: "tabs-list",
    scope: "entity",
    label: "Вкладки (tabs-list)",
    short: "Группа вкладок со списками",
    details: [
      {
        icon: "tab",
        text: "Создаёт view type: tabs_list с выбранными list-view",
      },
      {
        icon: "menu",
        text: "Опционально — пункт меню, ведущий на этот tabs_list",
      },
      {
        icon: "info",
        text: "Сущность используется только как anchor для route и label пункта меню",
      },
    ],
    when: "Нужен «комбайн» с вкладками: Открытые / В работе / Закрытые",
  },
  {
    id: "domain-extras",
    label: "Меню + иконки домена",
    short: "Root-меню, пункты по сущностям, палитра иконок",
    scope: "domain",
    details: [
      { icon: "menu", text: "root_group в menus[] с route /<domain-slug>" },
      { icon: "list", text: "Пункты меню для сущностей с ui.list !== false" },
      {
        icon: "image",
        text: "Палитра из 10 базовых иконок (add/edit/delete/view/save/...)",
      },
      {
        icon: "check",
        text: "Не перезаписывает существующие root_group и medias",
      },
    ],
    when: "Новый домен без меню, или нужна палитра иконок для CRUD-сущностей",
  },
  {
    id: "enum-workflow-builder",
    label: "Enum / Workflow Builder",
    short: "Скелеты Enum из String-атрибутов по эвристике",
    scope: "domain",
    details: [
      {
        icon: "data_object",
        text: "Атрибуты с суффиксом Type/Kind/Status/Category/Severity/State/Mode/Level",
      },
      { icon: "list", text: "Enum с values по умолчанию (настраивается)" },
      {
        icon: "conversion_path",
        text: "Опционально: Workflow-скелет для суффикса Status",
      },
      {
        icon: "warning",
        text: "Атрибут НЕ переключается на новый тип — сделайте это вручную после ревью",
      },
    ],
    when: "Много String-атрибутов, которые по смыслу — перечисления, но описаны как String",
  },
  {
    id: "ui-status-colors",
    label: "UI Status Colors",
    short: "view[] с цветами для Enum/Workflow без оформления",
    scope: "domain",
    details: [
      {
        icon: "palette",
        text: "Заполняет view[] в dataTypes[].kind=Enum/Workflow, где view[] пуст",
      },
      {
        icon: "auto_awesome",
        text: "Эвристика: low/medium/high/critical → зелёный/жёлтый/оранжевый/красный",
      },
      { icon: "check", text: "Существующие цвета не трогает" },
    ],
    when: "Enum/Workflow без цветов — UI покажет серые значения по умолчанию",
  },
  {
    id: "exchange-settings",
    label: "ExchangeSettings",
    short: "Скелет секции обмена данными",
    scope: "domain",
    details: [
      {
        icon: "swap_horiz",
        text: "exchangeSettings с enable + entities для всех сущностей домена",
      },
      {
        icon: "label",
        text: "forExport выбирается по стратегии (label / firstString / id)",
      },
      { icon: "block", text: "Сущности без подходящего атрибута пропускаются" },
    ],
    when: "Домен только готовится к интеграции через API — нужен скелет",
  },
  {
    id: "counter-color",
    label: "Counter Colors",
    short: "counterColorPatterns для Counter-атрибутов",
    scope: "domain",
    details: [
      {
        icon: "timelapse",
        text: "На каждый Counter-атрибут — паттерн <Entity><Attr>Counter",
      },
      { icon: "tune", text: "Пороги red/yellow по умолчанию (настраиваются)" },
      { icon: "check", text: "Не перезаписывает существующие паттерны" },
    ],
    when: "Много счётчиков дедлайнов/SLA без цветовых порогов",
  },
  {
    id: "linked-groups",
    label: "Linked Objects Groups",
    short: "Виджеты linked_objects_groups в entity-view",
    scope: "entity",
    details: [
      {
        icon: "widgets",
        text: "Для каждой linkage сущности — виджет сгруппированных связанных",
      },
      {
        icon: "group_work",
        text: "groupingBy: первый String-атрибут peer-сущности + totalCount",
      },
      {
        icon: "filter_alt",
        text: "Только side=2 связи (множество объектов); side=1 пропускаются",
      },
    ],
    when: "В карточке сущности нужно видеть связанные объекты, сгруппированные по типу",
  },
];

export function getProfileInfo(id: string): ProfileInfo | null {
  return PROFILE_INFO.find((p) => p.id === id) || null;
}
