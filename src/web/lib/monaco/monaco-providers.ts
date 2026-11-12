import { ModelIndex } from "../../../shared/model-types";
import {
  type LineMap,
  type SectionBlock,
  type NavNode,
  findAttributeInEntity,
} from "../yaml/line-map";
import { scanRqlInText } from "./rql-check";

import type {
  DomainSchemaAllViewItem,
  EntityLinkage,
  EntityRecord,
  ViewElementRef,
} from "../../../shared/model-types";
import { SYSTEM_ATTRIBUTE_IDS } from "../../../core/analyzer/linter";
import { ACTION_TYPE_DESCRIPTIONS } from "../../../shared/action-types";
import {
  resolveLinkageTargetEntityFqid,
  resolveOwningEntityFqid,
} from "./cross-domain-completion";
import {
  buildAttributeHoverMarkdown,
  buildEntityHoverMarkdown,
  buildLinkageHoverMarkdown,
} from "./hover-impact";
import { classifyQuickFix } from "./quickfix-rules";

/**
 * Поля, для которых в provideCompletionItems есть value-ветка
 * (т.е. `field: ␣` откроет осмысленный список, а не пустоту).
 * Используется в YamlViewerModal, чтобы после accept-suggestion
 * на имени поля сразу триггерить suggest для значения.
 *
 * Держать синхронно с `switch (fieldName)` внутри provideCompletionItems.
 */
export const KNOWN_VALUE_FIELDS: ReadonlySet<string> = new Set([
  // сущность
  "inherits",
  "kind",
  // связи
  "side1",
  "side2",
  "entity",
  // actions
  "operation",
  "page",
  "target",
  "effect",
  "scenario",
  "attribute",
  // views
  "modal",
  "panel",
  "view",
  "form",
  "tab",
  "list",
  "page",
  "addLinksView",
  "fromView",
  "widget",
  "group",
  "column",
  "action",
  "menuItem",
  "linkageAttribute",
  "preset",
  // dataTypes
  "dataType",
  "initial",
  "from",
  "to",
  "direction",
  "mode",
  "placement",
  "iconColor",
  "iconName",
  // общее
  "linkage",
  "block",
  "tree",
  "sequence",
  "counterColorPattern",
  "segment",
  "type",
  "constraint",
  // boolean-поля
  "readonly",
  "hidden",
  "searchable",
  "useForSearch",
  "undirected",
  "enable",
  "enabled",
  "expandable",
  "scanTarget",
  "scanTargetGroup",
  "isMixin",
  "useForChild",
  "createZeroRecord",
  "contextPin",
  "ordering",
  "selection",
  "autodownload",
  "includeLinkToScenario",
  // exchangeSettings
  "forExport",
  "upsertWith",
  "ignoreAttributes",
  "exportSystemAttributes",
  "Date",
  "Time",
  "Timestamp",
  "TimestampRange",
  "displayMode",
]);

const SORT = {
  SNIPPET: "zzzz_", // всегда внизу
  REQUIRED: "0_",
  OPTIONAL: "1_",
  SYSTEM_ATTR: "2_",
  LOCAL_REF: "0_",
  FOREIGN_REF: "9_",
  FALLBACK_ATTR: "9_",
} as const;

/**
 * Правила серверного линтера, которые полностью покрываются
 * inline-валидаторами (`applyAttributeMarkers` и др.).
 *
 * Их серверные маркеры нужно скрывать, когда inline-проверки включены,
 * иначе на один атрибут приходится по 2 маркера (inline + серверный).
 * При выключенных inline-проверках (`checksEnabled = false`) серверные
 * маркеры снова показываются — там inline не работает, скрывать нельзя.
 *
 * См. также src/web/components/modals/YamlViewerModal.tsx — фильтрация
 * `domainIssues` по этому набору.
 */
export const INLINE_COVERED_RULE_IDS: ReadonlySet<string> = new Set([
  "naming/attribute-camelcase",
  "recommended/attribute-description",
  "naming/system-id-attribute",
  "semantic/duplicate-attribute",
  "duplicate-id/entities",
  "naming/entity-camelcase",
  "recommended/entity-label",
  "recommended/entity-description",
]);

/**
 * Системные атрибуты, доступные для reference-полей
 * (sorting, searching, projection, identification, reconciliation,
 *  attribute-виджеты, колонки таблиц).
 * Источник: «Системные атрибуты» из «Структура схемы домена».
 */
const SYSTEM_ATTRIBUTES_FOR_COMPLETION: Array<{
  id: string;
  dataType: string;
  description: string;
}> = [
  { id: "id", dataType: "Uuid", description: "Идентификатор объекта" },
  {
    id: "label",
    dataType: "String",
    description: "Лейбл объекта (человекочитаемый)",
  },
  { id: "version", dataType: "Integer", description: "Версия объекта" },
  { id: "createdAt", dataType: "Timestamp", description: "Дата создания" },
  { id: "createdBy", dataType: "Reference", description: "Создатель" },
  { id: "updatedAt", dataType: "Timestamp", description: "Дата изменения" },
  { id: "updatedBy", dataType: "Reference", description: "Изменивший" },
  { id: "organizationId", dataType: "Reference", description: "Организация" },
  { id: "tenantId", dataType: "Reference", description: "Тенант" },
  { id: "domainId", dataType: "String", description: "Идентификатор домена" },
  { id: "entityId", dataType: "String", description: "Идентификатор сущности" },
  { id: "entityName", dataType: "String", description: "Название сущности" },
];

/**
 * Полный набор IconNames дизайн-системы rvision.
 * Порядок: [iconName, русское описание].
 * Источник — @rvision/icon-names (см. документацию дизайн-системы).
 */
const COMMON_ICON_NAMES: Array<[string, string]> = [
  // ── Действия ──
  ["Add", "Добавить"],
  ["AddBranch", "Добавить ветку"],
  ["Close", "Закрыть"],
  ["CloseCircle", "Закрыть (кружок)"],
  ["Check", "Галочка"],
  ["CheckCircle", "Галочка в круге"],
  ["Copy", "Копировать"],
  ["Edit", "Редактировать"],
  ["Eraser", "Ластик"],
  ["Export", "Экспорт"],
  ["Import", "Импорт"],
  ["Minus", "Убрать"],
  ["MinusCircle", "Убрать (кружок)"],
  ["MinusSquare", "Убрать (квадрат)"],
  ["Plus", "Плюс"],
  ["PlusSquare", "Плюс (квадрат)"],
  ["Redo", "Повторить"],
  ["Refresh", "Обновить"],
  ["Reload", "Перезагрузить"],
  ["Restore", "Восстановить"],
  ["Save", "Сохранить"],
  ["Send", "Отправить"],
  ["Trash", "Удалить (корзина)"],
  ["Undo", "Отменить"],
  ["Upload", "Загрузить"],
  ["Download", "Скачать"],

  // ── Навигация ──
  ["ArrowLeft", "Стрелка влево"],
  ["ArrowRight", "Стрелка вправо"],
  ["ArrowUp", "Стрелка вверх"],
  ["ArrowDown", "Стрелка вниз"],
  ["ArrowUpDown", "Стрелка вверх-вниз"],
  ["ArrowGoBack", "Стрелка назад"],
  ["ChevronLeft", "Шеврон влево"],
  ["ChevronRight", "Шеврон вправо"],
  ["ChevronUp", "Шеврон вверх"],
  ["ChevronDown", "Шеврон вниз"],
  ["DoubleChevronLeft", "Двойной шеврон влево"],
  ["DoubleChevronRight", "Двойной шеврон вправо"],
  ["DoubleChevronUp", "Двойной шеврон вверх"],
  ["DoubleChevronDown", "Двойной шеврон вниз"],
  ["DoubleArrowLeft", "Двойная стрелка влево"],
  ["DoubleArrowRight", "Двойная стрелка вправо"],
  ["DoubleArrowUp", "Двойная стрелка вверх"],
  ["DoubleArrowDown", "Двойная стрелка вниз"],
  ["MoveLeft", "Движение влево"],
  ["MoveRight", "Движение вправо"],
  ["MoveTo", "Перейти к"],
  ["MoveHorizontal", "Движение горизонтально"],
  ["Move", "Двигать"],
  ["Moveable", "Перемещаемый"],
  ["Exit", "Выход"],
  ["LogIn", "Вход"],
  ["LogOut", "Выход (logout)"],

  // ── Состояния / статусы ──
  ["Alert", "Оповещение"],
  ["Attention", "Внимание"],
  ["CheckCircle", "Успех"],
  ["CloseCircle", "Ошибка"],
  ["Info", "Информация"],
  ["Question", "Вопрос"],
  ["StarFilled", "Звезда (заполненная)"],
  ["StarUnfilled", "Звезда (контур)"],
  ["Pause", "Пауза"],
  ["PauseCircle", "Пауза (кружок)"],
  ["Play", "Воспроизвести"],
  ["PlayCircle", "Воспроизвести (кружок)"],
  ["ResumeCircle", "Продолжить"],
  ["StopCircle", "Стоп"],
  ["Loader", "Загрузка"],
  ["Spinner", "Спиннер"],
  ["Connected", "Подключено"],
  ["NotConnected", "Не подключено"],
  ["Off", "Выключено"],
  ["Lock", "Заблокировано"],
  ["Unlock", "Разблокировано"],

  // ── Файлы и данные ──
  ["File", "Файл"],
  ["FileText", "Текстовый файл"],
  ["FileText2", "Документ"],
  ["FilePlus", "Файл с плюсом"],
  ["FileBadge", "Файл-бейдж"],
  ["Pdf", "PDF"],
  ["Archive", "Архив"],
  ["Download", "Скачать"],
  ["HardDrive", "Жёсткий диск"],
  ["HardDriveUpload", "Выгрузка на диск"],
  ["HardDriveDownload", "Загрузка с диска"],
  ["Folder", "Папка"],
  ["FolderTree", "Дерево папок"],
  ["FolderSearch", "Поиск в папке"],
  ["FolderSync", "Синхронизация папки"],
  ["FolderCog", "Настройки папки"],
  ["FolderHeart", "Избранная папка"],
  ["FolderCheckStreamlineLucide", "Папка с галочкой"],
  ["FolderClockStreamlineLucide", "Папка с часами"],
  ["InboxArchive", "Входящие в архив"],
  ["InboxUnarchive", "Входящие из архива"],
  ["Box", "Коробка"],
  ["Layers", "Слои"],
  ["Grid", "Сетка"],
  ["Table", "Таблица"],

  // ── Сущности / объекты ──
  ["User", "Пользователь"],
  ["Users", "Пользователи"],
  ["Group", "Группа"],
  ["SupportGroups", "Группы поддержки"],
  ["Organization", "Организация"],
  ["Departments", "Отделы"],
  ["AgentFromGroup", "Агент из группы"],
  ["AgentToGroup", "Агент в группу"],
  ["UserExport", "Экспорт пользователя"],
  ["Assets", "Активы"],
  ["Ioc", "Индикатор (IoC)"],
  ["Ip", "IP-адрес"],
  ["Detections", "Детекции"],
  ["Threats", "Угрозы"],
  ["Audit", "Аудит"],
  ["Baseline", "Базовая линия"],
  ["Variable", "Переменная"],
  ["Value", "Значение"],
  ["Field", "Поле"],
  ["Field1", "Поле 1"],
  ["Number", "Число"],
  ["Id", "Идентификатор"],
  ["Hash", "Решётка (#)"],
  ["Binary", "Бинарные данные"],

  // ── Инфраструктура ──
  ["Server", "Сервер"],
  ["Cluster", "Кластер"],
  ["Network", "Сеть"],
  ["Cloud", "Облако"],
  ["Connection", "Соединение"],
  ["Port", "Порт"],
  ["Service", "Сервис"],
  ["Processes", "Процессы"],
  ["Component", "Компонент"],
  ["Constructor", "Конструктор"],
  ["Blocks", "Блоки"],
  ["Layout", "Макет"],
  ["Dashboard", "Дашборд"],

  // ── Устройства ──
  ["Desktop", "Рабочий стол"],
  ["Laptop", "Ноутбук"],
  ["Smartphone", "Смартфон"],
  ["MonitorX", "Монитор (ошибка)"],
  ["MonitorExport", "Монитор (экспорт)"],
  ["Printer", "Принтер"],
  ["Camera", "Камера"],
  ["Keyboard", "Клавиатура"],
  ["Battery", "Батарея"],
  ["BatteryFull", "Батарея полная"],
  ["HardDrive", "Диск"],
  ["Disc", "Диск (CD)"],
  ["Terminal", "Терминал"],
  ["Shell", "Shell"],
  ["Windows", "Windows"],
  ["Macos", "macOS"],
  ["Linux", "Linux"],
  ["Vmware", "VMware"],
  ["Satellite", "Спутник"],
  ["SatelliteDish", "Спутниковая антенна"],

  // ── Безопасность ──
  ["Shield", "Щит"],
  ["ShieldOff", "Щит выключен"],
  ["Lock", "Замок"],
  ["Unlock", "Открытый замок"],
  ["Key", "Ключ"],
  ["KeyRound", "Ключ (круглый)"],
  ["Siren", "Сирена"],
  ["Skull", "Череп"],
  ["Radiation", "Радиация"],
  ["Fire", "Огонь"],
  ["FireExtinguisherStreamlineLucide", "Огнетушитель"],
  ["Cross", "Крест"],
  ["Swords", "Мечи"],
  ["Brain", "Мозг"],
  ["Eye", "Глаз"],
  ["EyeOff", "Скрыть глаз"],
  ["FingerprintStreamlineLucide", "Отпечаток пальца"],
  ["Bug", "Баг"],

  // ── Наука / инструменты ──
  ["Microscope", "Микроскоп"],
  ["FlaskConicalStreamlineLucide", "Колба"],
  ["Syringe", "Шприц"],
  ["Pill", "Таблетка"],
  ["Thermometer", "Термометр"],
  ["Ruler", "Линейка"],
  ["Hammer", "Молоток"],
  ["Tool", "Инструмент"],
  ["Shovel", "Лопата"],
  ["PocketKnife", "Карманный нож"],
  ["Wand", "Палочка"],
  ["Magnet", "Магнит"],
  ["SatelliteDish", "Антенна"],

  // ── Транспорт ──
  ["Rocket", "Ракета"],
  ["Fuel", "Топливо"],
  ["Route", "Маршрут"],
  ["MapPin", "Метка на карте"],
  ["Map", "Карта"],
  ["Compass", "Компас"],
  ["Footprints", "Следы"],

  // ── Время / планирование ──
  ["Calendar", "Календарь"],
  ["Clock", "Часы"],
  ["AlarmClock", "Будильник"],
  ["AlarmClockCheck", "Будильник с галочкой"],
  ["History", "История"],
  ["Change", "Изменение"],
  ["Diff", "Дифф"],
  ["Repeat", "Повтор"],
  ["ListRestart", "Список с перезапуском"],

  // ── Документы / текст ──
  ["Clipboard", "Буфер обмена"],
  ["Notebook", "Блокнот"],
  ["Bookmark", "Закладка"],
  ["Pin", "Булавка"],
  ["PinFill", "Булавка (заполненная)"],
  ["PinOff", "Булавка откреплена"],
  ["Paperclip", "Скрепка"],
  ["Link", "Ссылка"],
  ["Link2", "Ссылка (вариант)"],
  ["Links", "Ссылки"],
  ["Unlink", "Разорвать ссылку"],
  ["Unplug", "Отключить"],
  ["Text", "Текст"],
  ["Heading", "Заголовок"],
  ["Heading1", "Заголовок 1"],
  ["Heading2", "Заголовок 2"],
  ["Heading3", "Заголовок 3"],
  ["Heading4", "Заголовок 4"],
  ["Heading5", "Заголовок 5"],
  ["Heading6", "Заголовок 6"],
  ["Bold", "Жирный"],
  ["Italic", "Курсив"],
  ["Underline", "Подчёркнутый"],
  ["Strikethrough", "Зачёркнутый"],
  ["Pilcrow", "Параграф"],
  ["Brace", "Скобка"],
  ["Unbrace", "Убрать скобку"],
  ["Bracket", "Квадратная скобка"],
  ["Quote", "Цитата"],
  ["TextAlignStart", "По левому краю"],
  ["TextAlignCenter", "По центру"],
  ["TextAlignEnd", "По правому краю"],
  ["TextAlignJustify", "По ширине"],

  // ── Списки / организация ──
  ["List", "Список"],
  ["ListChecks", "Список с галочками"],
  ["ListOrdered", "Упорядоченный список"],
  ["Columns", "Колонки"],
  ["Columns2", "Две колонки"],
  ["Columns4", "Четыре колонки"],
  ["Rows2", "Два ряда"],
  ["Rows3", "Три ряда"],
  ["SortByUp", "Сортировка вверх"],
  ["SortByDown", "Сортировка вниз"],
  ["SortByLeft", "Сортировка влево"],
  ["SortByRight", "Сортировка вправо"],
  ["SortDefault", "Сортировка по умолчанию"],
  ["SortUp", "По возрастанию"],
  ["SortDown", "По убыванию"],
  ["Filter", "Фильтр"],
  ["Filter2", "Фильтр (вариант)"],
  ["Search", "Поиск"],
  ["LocateFixed", "Найти"],

  // ── Графы / диаграммы ──
  ["ChartSquare", "Диаграмма"],
  ["LineChart", "Линейный график"],
  ["DiagramCircle", "Круговая диаграмма"],
  ["OrientedGraph", "Ориентированный граф"],
  ["VerticalGraph", "Вертикальный граф"],
  ["GitBranch", "Ветка git"],
  ["GitMerge", "Слияние git"],
  ["Constructor", "Конструктор"],
  ["Apps", "Приложения"],
  ["Puzzle", "Пазл"],
  ["Sitemap", "Карта сайта"],
  ["FitToScreen", "Вписать в экран"],
  ["Focus", "Фокус"],
  ["ZoomIn", "Приблизить"],
  ["ZoomOut", "Отдалить"],
  ["Maximize", "Развернуть"],
  ["Minimize", "Свернуть"],

  // ── Настройки / конфигурация ──
  ["Settings", "Настройки"],
  ["Sliders", "Ползунки"],
  ["ToggleLeft", "Переключатель влево"],
  ["ToggleRight", "Переключатель вправо"],
  ["Layers", "Слои"],
  ["Invert", "Инвертировать"],
  ["Combine", "Объединить"],
  ["Compare", "Сравнить"],
  ["Diff", "Сравнить (diff)"],

  // ── Коммуникации ──
  ["Mail", "Письмо"],
  ["MailOpen", "Открытое письмо"],
  ["MessageCircle", "Сообщение"],
  ["Send", "Отправить"],
  ["ShareForwardBox", "Поделиться"],
  ["Notifications", "Уведомления"],
  ["NotificationsOff", "Уведомления выключены"],
  ["Podcast", "Подкаст"],
  ["AudioLines", "Аудиодорожки"],
  ["Answer", "Ответ"],

  // ── Разное ──
  ["Activity", "Активность"],
  ["Aperture", "Диафрагма"],
  ["Award", "Награда"],
  ["Trophy", "Трофей"],
  ["Crown", "Корона"],
  ["PartyPopper", "Хлопушка"],
  ["Sparkles", "Искры"],
  ["Lightbulb", "Лампочка"],
  ["Flash", "Вспышка"],
  ["ZapOff", "Молния выключена"],
  ["Goal", "Цель"],
  ["Guide", "Руководство"],
  ["LifeBuoy", "Спасательный круг"],
  ["Coffee", "Кофе"],
  ["Fish", "Рыба"],
  ["Ghost", "Призрак"],
  ["Dot", "Точка"],
  ["Square", "Квадрат"],
  ["Rectangle", "Прямоугольник"],
  ["BrickWall", "Кирпичная стена"],
  ["Warehouse", "Склад"],
  ["BriefcaseBusiness", "Портфель"],
  ["ShoppingBasket", "Корзина покупок"],
  ["Wallet", "Кошелёк"],
  ["CreditCard", "Кредитная карта"],
  ["Receipt", "Чек"],
  ["Printer", "Принтер"],
  ["Image", "Изображение"],
  ["Color", "Цвет"],
  ["PaintRoller", "Валик"],
  ["QrCode", "QR-код"],
  ["DoorOpenStreamlineLucide", "Открытая дверь"],
  ["DoorClosedStreamlineLucide", "Закрытая дверь"],
  ["AndOr", "И / Или"],
  ["EqualsExists", "Равно существует"],
  ["Equal", "Равно"],
  ["Sigma", "Сигма (сумма)"],
  ["Lambda", "Лямбда"],
  ["Bracket", "Скобка"],
  ["Code", "Код"],
  ["Terminal", "Терминал"],
  ["LampDesk", "Настольная лампа"],
  ["Moon", "Луна"],
  ["Snowflake", "Снежинка"],
  ["Waves", "Волны"],
  ["LineHorizontal", "Горизонтальная линия"],
];

interface AttributeCompletionContext {
  kind: "entity" | "linkage" | "unknown" | "precomputed";
  entityFqid?: string;
  linkageId?: string;
  linkageAttributes?: any[];
  precomputedItems?: RefSuggestion[];
}

/**
 * Возвращает значение `type:` у action-блока, в котором находится
 * строка `currentLineNumber` (1-based).
 *
 * Алгоритм:
 *   1. Walk-up: найти ближайший `- <key>:` с indent < indent текущей строки.
 *      Это стартовая строка action-блока. Если её нет — null
 *      (или текущая строка вне actions[]).
 *   2. Walk-down: искать `type:` до:
 *        - следующего `- <key>:` с indent <= actionIndent (новый action),
 *        - строки с indent === 0 (вышли из секции actions).
 *   3. Если `type:` не найден — null.
 *
 * Работает через `model.getLineContent(i)`, без `getValue()`.
 * На больших файлах — O(depth + длина блока), константа по размеру файла.
 */
function findActionTypeForModel(
  model: any,
  currentLineNumber: number,
): string | null {
  const lineCount = model.getLineCount();
  if (currentLineNumber < 1 || currentLineNumber > lineCount) return null;

  const currentLine = model.getLineContent(currentLineNumber);
  const currentIndent = (currentLine.match(/^(\s*)/) || ["", ""])[1].length;

  // ── 1. Walk-up: старт action-блока ──
  let actionStart = -1;
  let actionIndent = -1;
  for (let i = currentLineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line || !line.trim() || line.trim().startsWith("#")) continue;

    const m = line.match(/^(\s*)-\s+[a-zA-Z_][\w]*\s*:/);
    if (m && m[1].length < currentIndent) {
      actionStart = i;
      actionIndent = m[1].length;
      break;
    }

    // Вышли на top-level ключ, не встретив `- <key>:` → мы не в actions[]
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0 && !m) return null;
  }
  if (actionStart < 0) return null;

  // ── 2. Walk-down: искать `type:` в пределах блока ──
  for (let i = actionStart + 1; i <= lineCount; i++) {
    const line = model.getLineContent(i);
    if (!line || !line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // Следующий action — блок закончился
    if (/^\s*-\s+[a-zA-Z_][\w]*\s*:/.test(line) && ind <= actionIndent) {
      break;
    }
    // Вышли из секции actions
    if (ind === 0) break;

    const tm = line.match(/^\s*type\s*:\s*["']?([\w.-]+)["']?/);
    if (tm) return tm[1];
  }

  return null;
}

/**
 * Возвращает текущее значение `type:` у action-блока, в котором находится
 * строка `currentLineIdx` (1-based). Не важно, где именно `type:` —
 * выше или ниже `operation:`/`page:`.
 *
 * Возвращает null, если action не найден или `type:` в блоке отсутствует.
 */
function findActionTypeForLine(
  lines: string[],
  currentLineIdx: number,
): string | null {
  if (currentLineIdx < 1 || currentLineIdx > lines.length) return null;

  const currentLine = lines[currentLineIdx - 1];
  const currentIndent = (currentLine.match(/^(\s*)/) || ["", ""])[1].length;

  // 1. Находим начало action-блока: ближайший `- <key>:` с indent < currentIndent
  let actionStart = -1;
  let actionIndent = -1;
  for (let i = currentLineIdx - 2; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.trim() || line.trim().startsWith("#")) continue;

    const m = line.match(/^(\s*)-\s+[a-zA-Z_][\w]*\s*:/);
    if (m && m[1].length < currentIndent) {
      actionStart = i;
      actionIndent = m[1].length;
      break;
    }
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0 && !m) break;
  }
  if (actionStart < 0) return null;

  // 2. Ищем `type:` внутри [actionStart + 1, end of action)
  for (let i = actionStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // Начало следующего action
    if (/^\s*-\s+[a-zA-Z_][\w]*\s*:/.test(line) && ind <= actionIndent) {
      break;
    }
    // Вышли из секции actions
    if (ind === 0) break;

    const tm = line.match(/^\s*type\s*:\s*["']?([\w.-]+)["']?/);
    if (tm) return tm[1];
  }
  return null;
}

// ============ Принудительное раскрытие details в suggest-widget ============
// В Monaco 0.52.2 виджет suggestion создаётся лениво (при первом показе),
// а опция `showDetails` только разрешает показать панель, не разворачивая её.
// Внутренний метод _setDetailsVisible(true) — единственный способ раскрыть
// панель документации автоматически. Вызывается при каждом suggest.
function ensureSuggestDetailsVisible(): void {
  const w = window as any;
  const editors = w.monaco?.editor?.getEditors?.() ?? [];
  for (const ed of editors) {
    try {
      const ctrl = ed.getContribution?.("editor.contrib.suggestController");
      const widget = (ctrl as any)?.widget?.value;
      if (widget && typeof widget._setDetailsVisible === "function") {
        widget._setDetailsVisible(true);
      }
    } catch {
      /* private API — на всякий случай глотаем */
    }
  }
}

let providersRegistered = false;

interface ProviderContext {
  lineMap: LineMap | null;
  currentFilePath: string | null;
  currentDomainId: string | null;
  onOpenFqid?: (fqid: string) => void;
  modelIndex: ModelIndex | null;
}

const ctx: ProviderContext = {
  lineMap: null,
  currentFilePath: null,
  currentDomainId: null,
  modelIndex: null,
};

interface ValueCtx {
  section: string; // entities | linkages | views | actions | dataTypes | dataRules | uiRules | …
  container: string; // widgets | groups | attributes | views | control | rule | layout | …
  itemType: string; // entity | attribute | linkage | linkageAttribute | view | viewNested |
  // widget | group | action | dataType | dataRule | uiRule | menu | sequence |
  // tree | transitiveLinkage | sorting | sortingByItem | …
}

function makeValues(
  values: string[],
  Kind: any,
  range: any,
  kind: number = Kind.Value,
): { suggestions: any[] } {
  return {
    suggestions: values.map((v) => ({
      label: v,
      kind,
      insertText: v,
      filterText: v,
      sortText: v,
      range,
    })),
  };
}

function makeEntities(
  ctx: ProviderContext,
  Kind: any,
  range: any,
): { suggestions: any[] } {
  const cur = (ctx.currentDomainId || "").toLowerCase();
  const out: any[] = [];
  ctx.modelIndex?.entities?.forEach((e: any) => {
    const isCur = e.domainId.toLowerCase() === cur;
    const insert = isCur ? e.entityId : e.fqid;
    out.push({
      label: insert,
      kind: Kind.Class,
      insertText: insert,
      filterText: insert,
      range,
    });
  });
  return { suggestions: out };
}

function buildRefFieldCompletion(
  model: any,
  position: any,
  fieldName: string, // 'linkage' | 'widget' | 'group' | …
  values: string[], // уже собранный список id (например, текущий домен)
  Kind: any,
): { suggestions: any[] } | null {
  const beforeCursor = model
    .getLineContent(position.lineNumber)
    .slice(0, position.column - 1);
  // матчим только сам ключ; значение — любое
  const m = beforeCursor.match(
    new RegExp(`^(\\s*(?:-\\s+)?${fieldName}\\s*:)`),
  );
  if (!m) return null;

  const startColumn = m[1].length + 1;
  const lineText = model.getLineContent(position.lineNumber);
  const charAtCursor = lineText.charAt(position.column - 1);
  const endColumn =
    charAtCursor === '"' || charAtCursor === "'"
      ? position.column + 1
      : position.column;

  const range = {
    startLineNumber: position.lineNumber,
    startColumn,
    endLineNumber: position.lineNumber,
    endColumn,
  };

  const seen = new Set<string>();
  const out: any[] = [];
  values.forEach((v) => {
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push({
      label: v,
      kind: Kind.Reference,
      insertText: " " + v,
      filterText: v,
      sortText: v,
      range,
    });
  });
  return { suggestions: out };
}

export function updateProviderContext(partial: Partial<ProviderContext>): void {
  Object.assign(ctx, partial);
}

export function resetProviderContext(): void {
  ctx.lineMap = null;
  ctx.currentFilePath = null;
  ctx.currentDomainId = null;
  ctx.modelIndex = null;
  ctx.onOpenFqid = undefined;
}

// ============ Поля, значения которых — ссылки на id/сущности/атрибуты ============

/** Поля, где значение — определение id (свой id). */
const DEF_FIELDS = new Set(["id"]);

/** Поля, где значение — ссылка на элемент в этом же файле (сущность, view, action). */
const REF_FIELDS = new Set([
  "inherits",
  "entity",
  "modal",
  "panel",
  "form",
  "tab",
  "list",
  "view",
  "page",
  "addLinksView",
  "fromView",
  "linkage",
  "key",
  "value",
  "widget",
  "block",
  "action",
  "menu",
  "node",
  "source",
  "join",
  "dataType",
]);

/** Поля, где значение может быть `<Entity>.<attr>` или `<Entity>` — составная ссылка. */
const ATTRIBUTE_LIKE_FIELDS = new Set([
  "attribute",
  "attributes",
  "item",
  "by",
  "use",
  "searching",
]);

const BASE_DATA_TYPE_DESCRIPTIONS: Record<string, string> = {
  String: "Строка",
  Integer: "Целое число",
  Decimal: "Число с заданной точностью",
  Float: "Число с плавающей точкой",
  Bool: "Логическое значение (true/false)",
  Uuid: "Универсальный уникальный идентификатор",
  Timestamp: "Момент времени",
  Date: "Календарная дата (YYYY-MM-DD)",
  Time: "Время (hh:mm:ss)",
  TimestampRange: "Диапазон моментов времени",
  Text: "Форматированный текст",
  MAC: "MAC-адрес",
  IpAddress: "IP-адрес (IPv4 / IPv6)",
  CIDR: "Адрес подсети с маской",
  URL: "URL-адрес внешнего ресурса",
  Attachment: "Прикреплённый файл",
  Identifier: "Человекочитаемый идентификатор (по шаблону)",
  Counter: "Счётчик времени",
  Calculation: "Результат расчёта по схеме",
  Configuration: "Ссылка на конфигурацию",
  Variable: "Ссылка на переменную",
  RQL: "Настройки фильтрации RQL",
  Automation: "Ссылка на автоматизацию",
  Reference: "Ссылка на сущность",
  Array: "Массив значений",
  Table: "Таблица",
  Enum: "Перечисление (только в dataTypes[])",
  Workflow: "Рабочий процесс (только в dataTypes[])",
};

// ============ GraphView: цвета иконок ============
const GRAPH_VIEW_COLORS: Array<[string, string]> = [
  ["red", "Красный"],
  ["pink", "Розовый"],
  ["lightpink", "Светло-розовый"],
  ["orange", "Оранжевый"],
  ["peach", "Персиковый"],
  ["yellow", "Жёлтый"],
  ["green", "Зелёный"],
  ["lightgreen", "Светло-зелёный"],
  ["turquoise", "Бирюзовый"],
  ["lightblue", "Голубой"],
  ["blue", "Синий"],
  ["violet", "Фиолетовый"],
  ["purple", "Пурпурный"],
  ["grey", "Серый"],
];
const GRAPH_VIEW_COLOR_LABELS: Record<string, string> =
  Object.fromEntries(GRAPH_VIEW_COLORS);

// ============ Reconciliation: стратегии слияния ============
const RECONCILIATION_MERGE_STRATEGIES: Array<[string, string]> = [
  ["replace", "Замена значения"],
  ["array_merge", "Объединение уникальных элементов"],
  ["array_concat", "Конкатенация всех элементов"],
  ["earliest_date", "Выбор самой ранней даты"],
  ["latest_date", "Выбор самой поздней даты"],
];
const RECONCILIATION_MERGE_LABELS: Record<string, string> = Object.fromEntries(
  RECONCILIATION_MERGE_STRATEGIES,
);

const WIDGET_TYPE_DESCRIPTIONS: Record<string, string> = {
  attribute: "Виджет атрибута (просмотр/редактирование значения)",
  action: "Виджет действия (кнопка/меню)",
  linkage: "Виджет связи (просмотр и редактирование связанных объектов)",
  linkage_list: "Список связей",
  linked_objects_groups: "Группировка связанных объектов (таблица)",
  join: "Транзитивная связь (атрибут через цепочку)",
  history: "История изменений (события аудита)",
  runs_history: "История запусков сценариев",
  comments: "Комментарии",
  conversation: "Переписки",
  visualization: "Визуализация (графики/диаграммы/таблица)",
  diagram: "Диаграмма (визуализация агрегированных данных)",
  calculation: "Расчёт по схеме",
  template_editor: "Редактор шаблонов",
  addressBook: "Адресная книга",
};

const EFFECT_DESCRIPTIONS: Record<string, string> = {
  hidden: "Скрыть элементы представления",
  show: "Показать элементы представления (перебивает hidden)",
  hiddenEmpty: "Скрыть, если пусто",
  readonly: "Сделать недоступным для редактирования",
  editable: "Разрешить редактирование (перебивает readonly)",
  inherit: "Наследовать правило из родителя",
  variant: "Применить вариант оформления (пресеты)",
  required: "Сделать обязательным для заполнения",
  default: "Использовать значение по умолчанию",
  allowed: "Ограничить список допустимых значений",
};

const TARGET_DESCRIPTIONS: Record<string, string> = {
  entity: "Сущность (её атрибуты и связи)",
  entityAttribute: "Элементы массива или атрибуты таблицы",
  linkage: "Связь и её атрибуты",
  list_view: "Списочное представление",
  entity_view: "Представление сущности (компактное/модальное/полноэкранное)",
  entity_attribute: "Колонки таблиц / элементы массивов",
};

const CONTROL_TYPE_DESCRIPTIONS: Record<string, string> = {
  text: "Однострочное текстовое поле",
  text_area: "Многострочное текстовое поле",
  select: "Выпадающий список",
  radio: "Радиокнопки",
  tag: "Тег",
  level: "Индикатор уровня",
  switch: "Переключатель",
  checkbox: "Чекбокс",
  bool_text: "Текст вместо true/false",
  timestamp: "Дата-время",
  date: "Дата",
  time: "Время",
  tree_path: "Путь в дереве",
  drag_drop_area: "Область перетаскивания файлов",
  file: "Кнопка выбора файла",
  slider: "Ползунок",
  link: "Ссылка",
  uuid: "UUID-поле",
  mac: "MAC-адрес",
  ip: "IP-адрес",
  cidr: "CIDR-адрес",
  counter: "Счётчик времени",
  multi_select: "Мультивыбор",
  table: "Таблица",
  list: "Список",
  tree: "Дерево",
  rql: "Редактор RQL",
  integer: "Целочисленное поле",
  decimal: "Число фиксированной точности",
  float: "Число с плавающей точкой",
  integer_slider: "Ползунок для целых чисел",
  decimal_slider: "Ползунок для чисел фикс. точности",
  float_slider: "Ползунок для чисел с плавающей точкой",
  timestamp_range: "Диапазон дата-время",
  mitre_multi_select: "Мультивыбор из справочника MITRE ATT&CK",
  tag_list: "Множество значений",
  url: "URL-адрес",
  external: "Внешний виджет",
};

const BASE_DATA_TYPES_COMPLETION = [
  "String",
  "Integer",
  "Decimal",
  "Float",
  "Bool",
  "Uuid",
  "Timestamp",
  "Date",
  "Time",
  "TimestampRange",
  "Text",
  "MAC",
  "IpAddress",
  "CIDR",
  "URL",
  "Attachment",
  "Identifier",
  "Counter",
  "Calculation",
  "Configuration",
  "Variable",
  "RQL",
  "Automation",
  "Reference",
  "Array",
  "Table",
  "Enum",
  "Workflow",
];

const BOOLEAN_FIELD_NAMES = new Set<string>([
  "readonly",
  "hidden",
  "searchable",
  "useForSearch",
  "undirected",
  "enable",
  "enabled",
  "expandable",
  "scanTarget",
  "scanTargetGroup",
  "isMixin",
  "useForChild",
  "createZeroRecord",
  "contextPin",
  "ordering",
  "selection",
  "autodownload",
  "includeLinkToScenario",
  "noCmsSync",
]);

// ============ Хелперы для value-completion ============

interface RefSuggestion {
  label: string;
  insertText: string;
  kind: number;
  sortText: string;
  detail?: string;
  documentation?: string;
}

interface SectionRef {
  id: string;
  domainId: string;
  type?: string;
  kind?: string;
  description?: string;
}

function buildSectionItemDescription(
  sectionKey: string,
  it: any,
  ctx: ProviderContext,
  domainId: string,
): string {
  switch (sectionKey) {
    case "entities": {
      const fqid = `${domainId}/${it.id}`.toLowerCase();
      const e = ctx.modelIndex?.entitiesByFqid?.[fqid];
      if (e) {
        const parts: string[] = [];
        if (e.name && e.name !== e.entityId) parts.push(e.name);
        if (e.description) parts.push(e.description);
        parts.push(`${e.attributes.length} атрибутов`);
        if (e.inherits) parts.push(`↳ ${e.inherits.split("/").pop()}`);
        return parts.join(" · ");
      }
      return it.name || "";
    }
    case "linkages": {
      const parts: string[] = [];
      if (it.name && it.name !== it.id) parts.push(it.name);
      if (it.type) parts.push(`тип ${it.type}`);
      if (it.side1 && it.side2) {
        parts.push(
          `${it.side1.split("/").pop()} ${it.undirected ? "↔" : "→"} ${it.side2.split("/").pop()}`,
        );
      }
      return parts.join(" · ");
    }
    case "actions": {
      const parts: string[] = [];
      if (it.name && it.name !== it.id) parts.push(it.name);
      if (it.type) parts.push(`тип ${it.type}`);
      return parts.join(" · ");
    }
    case "views": {
      const parts: string[] = [];
      if (it.label && it.label !== it.id) parts.push(it.label);
      if (it.type) parts.push(`тип ${it.type}`);
      if (it.entity) parts.push(`→ ${it.entity.split("/").pop()}`);
      if (it.isMixin) parts.push("mixin");
      return parts.join(" · ");
    }
    case "menus": {
      const parts: string[] = [];
      if (it.label && it.label !== it.id) parts.push(it.label);
      if (it.route) parts.push(it.route);
      if (it.type) parts.push(`тип ${it.type}`);
      return parts.join(" · ");
    }
    case "uiPresets": {
      const parts: string[] = [];
      if (it.description) parts.push(it.description);
      if (it.name && it.name !== it.id) parts.push(it.name);
      return parts.join(" · ");
    }
    case "sequences": {
      return `начинается с ${it.startFrom ?? 1}`;
    }
    case "counterColorPattern": {
      const parts: string[] = [];
      if (it.yellow) parts.push(`yellow: ${it.yellow}`);
      if (it.red) parts.push(`red: ${it.red}`);
      return parts.join(" · ");
    }
    case "trees": {
      const parts: string[] = [];
      if (it.name && it.name !== it.id) parts.push(it.name);
      if (it.type) parts.push(`тип ${it.type}`);
      if (it.rootEntity)
        parts.push(`корень: ${it.rootEntity.split("/").pop()}`);
      return parts.join(" · ");
    }
    default:
      return it.name || it.description || "";
  }
}

interface ParsedDataTypes {
  ids: Set<string>;
  /** workflowId → [statusId, …] в порядке объявления. */
  workflows: Map<string, string[]>;
}

function parseDataTypesFromText(text: string): ParsedDataTypes {
  const result: ParsedDataTypes = { ids: new Set(), workflows: new Map() };
  const lines = text.split("\n");

  // 1. Найти секцию dataTypes:
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind !== 0) continue;
    const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
    if (!sm) continue;
    if (sm[1] === "dataTypes") sectionStart = i;
    else if (sectionStart >= 0) {
      sectionEnd = i;
      break;
    }
  }
  if (sectionStart < 0) return result;

  // 2. indent dash-item (`- id:` или `- attributes:` — берём первый)
  let itemIndent = -1;
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const dashM = line.match(/^(\s*)-\s+\S/);
    if (dashM) {
      itemIndent = dashM[1].length;
      break;
    }
  }
  if (itemIndent < 0) return result;
  const fieldIndent = itemIndent + 2;

  // 3. Walk items
  let i = sectionStart + 1;
  while (i < sectionEnd) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const dashM = line.match(/^(\s*)-\s+\S/);
    if (!dashM || dashM[1].length !== itemIndent) {
      i++;
      continue;
    }

    // Границы item
    let itemEnd = sectionEnd;
    for (let j = i + 1; j < sectionEnd; j++) {
      const jLine = lines[j];
      if (!jLine.trim()) continue;
      const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
      const jDash = jLine.match(/^(\s*)-\s+\S/);
      if (jDash && jInd === itemIndent) {
        itemEnd = j;
        break;
      }
    }

    // id и dataType — принимаем оба варианта: `- <key>: value` (на itemIndent)
    // и `<key>: value` (на fieldIndent). Иначе `- dataType: Workflow` на первой
    // строке элемента не распознаётся.
    let itemId: string | null = null;
    let dataTypeValue: string | null = null;
    for (let j = i; j < itemEnd; j++) {
      const jLine = lines[j];
      if (!jLine.trim() || jLine.trim().startsWith("#")) continue;
      const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;

      if (itemId === null && (jInd === itemIndent || jInd === fieldIndent)) {
        const im = jLine.match(/^\s*(?:-\s+)?id\s*:\s*["']?([^\s"'#]+)["']?/);
        if (im) itemId = im[1];
      }
      if (
        dataTypeValue === null &&
        (jInd === itemIndent || jInd === fieldIndent)
      ) {
        const dm = jLine.match(
          /^\s*(?:-\s+)?dataType\s*:\s*["']?([\w./-]+)["']?/,
        );
        if (dm) dataTypeValue = dm[1];
      }
    }

    if (itemId) {
      result.ids.add(itemId);

      if (dataTypeValue === "Workflow") {
        // statuses:
        let statusesStart = -1;
        for (let j = i + 1; j < itemEnd; j++) {
          const jLine = lines[j];
          if (!jLine.trim() || jLine.trim().startsWith("#")) continue;
          const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
          if (jInd !== fieldIndent) continue;
          if (/^\s*statuses\s*:\s*$/.test(jLine)) {
            statusesStart = j;
            break;
          }
        }
        const statuses: string[] = [];
        const seen = new Set<string>();
        if (statusesStart >= 0) {
          for (let j = statusesStart + 1; j < itemEnd; j++) {
            const jLine = lines[j];
            if (!jLine.trim()) continue;
            const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
            if (jInd <= fieldIndent) break;
            const im = jLine.match(/^\s*-\s+id\s*:\s*["']?([^\s"'#]+)["']?/);
            if (im && !seen.has(im[1])) {
              seen.add(im[1]);
              statuses.push(im[1]);
            }
          }
        }
        result.workflows.set(itemId, statuses);
      }
    }

    i = itemEnd;
  }

  return result;
}

function collectSectionRefs(
  ctx: ProviderContext,
  sectionKey: string,
): SectionRef[] {
  const out: SectionRef[] = [];
  if (!ctx.modelIndex?.schemasByDomain) return out;
  for (const [domainId, schema] of Object.entries(
    ctx.modelIndex.schemasByDomain,
  ) as Array<[string, any]>) {
    const sec = schema?.sections?.[sectionKey];
    if (!sec?.items) continue;
    for (const it of sec.items) {
      if (!it?.id) continue;
      out.push({
        id: String(it.id),
        domainId,
        type: it.type,
        kind: it.kind,
        description: buildSectionItemDescription(sectionKey, it, ctx, domainId),
      });
    }
  }
  return out;
}

function collectViewRefs(ctx: ProviderContext): SectionRef[] {
  const out: SectionRef[] = [];
  if (!ctx.modelIndex?.schemasByDomain) return out;
  for (const [domainId, schema] of Object.entries(
    ctx.modelIndex.schemasByDomain,
  ) as Array<[string, any]>) {
    const all: DomainSchemaAllViewItem[] | undefined = schema?.allViews;
    if (Array.isArray(all)) {
      for (const v of all) {
        const parts: string[] = [];
        if (v.type) parts.push(v.type);
        if (v.entity) parts.push(`→ ${v.entity.split("/").pop()}`);
        if (v.parentViewId) parts.push(`в ${v.parentViewId}`);
        out.push({
          id: String(v.id),
          domainId,
          type: v.type,
          description: parts.join(" · "),
        });
      }
    } else {
      const sec = schema?.sections?.views;
      if (!sec?.items) continue;
      for (const v of sec.items) {
        const parts: string[] = [];
        if (v.label && v.label !== v.id) parts.push(v.label);
        if (v.type) parts.push(v.type);
        if (v.entity) parts.push(`→ ${v.entity.split("/").pop()}`);
        if (v.isMixin) parts.push("mixin");
        out.push({
          id: String(v.id),
          domainId,
          type: v.type,
          description: parts.join(" · "),
        });
      }
    }
  }
  return out;
}

function pickDescription(
  ref: ViewElementRef | undefined,
  fallbackType: string,
  fallbackView: string,
): string {
  if (ref?.description && ref.description.trim()) {
    const parts: string[] = [ref.description.trim()];
    if (ref.type) parts.push(`тип ${ref.type}`);
    parts.push(`в ${fallbackView}`);
    return parts.join(" · ");
  }
  const parts: string[] = [];
  if (fallbackType || ref?.type) parts.push(`тип ${fallbackType || ref?.type}`);
  parts.push(`в ${fallbackView}`);
  return parts.join(" · ");
}

function collectWidgetRefs(ctx: ProviderContext): SectionRef[] {
  const out: SectionRef[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  for (const [domainId, byView] of Object.entries(
    ctx.modelIndex.viewElementsByDomain,
  ) as Array<[string, Record<string, any>]>) {
    for (const [viewId, view] of Object.entries(byView)) {
      const typed: ViewElementRef[] | undefined = view?.widgetsWithType;
      if (Array.isArray(typed)) {
        for (const w of typed) {
          if (!w?.id) continue;
          const key = `${domainId}|${w.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(w.id),
            domainId,
            type: w.type,
            description: pickDescription(w, w.type, viewId),
          });
        }
      } else if (Array.isArray(view?.widgets)) {
        for (const wid of view.widgets) {
          const key = `${domainId}|${wid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(wid),
            domainId,
            description: `в ${viewId}`,
          });
        }
      }
    }
  }
  return out;
}

function collectGroupRefs(ctx: ProviderContext): SectionRef[] {
  const out: SectionRef[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  for (const [domainId, byView] of Object.entries(
    ctx.modelIndex.viewElementsByDomain,
  ) as Array<[string, Record<string, any>]>) {
    for (const [viewId, view] of Object.entries(byView)) {
      const typed: ViewElementRef[] | undefined = view?.groupsWithType;
      if (Array.isArray(typed)) {
        for (const g of typed) {
          if (!g?.id) continue;
          const key = `${domainId}|${g.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(g.id),
            domainId,
            type: g.type,
            description: pickDescription(g, g.type, viewId),
          });
        }
      } else if (Array.isArray(view?.groups)) {
        for (const gid of view.groups) {
          const key = `${domainId}|${gid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(gid),
            domainId,
            description: `в ${viewId}`,
          });
        }
      }
    }
  }
  return out;
}

function collectColumnRefs(ctx: ProviderContext): SectionRef[] {
  const out: SectionRef[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  for (const [domainId, byView] of Object.entries(
    ctx.modelIndex.viewElementsByDomain,
  ) as Array<[string, Record<string, any>]>) {
    for (const [viewId, view] of Object.entries(byView)) {
      const typed: ViewElementRef[] | undefined = view?.columnsWithType;
      if (Array.isArray(typed)) {
        for (const c of typed) {
          if (!c?.id) continue;
          const key = `${domainId}|${c.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(c.id),
            domainId,
            description: c.description
              ? `${c.description} · в ${viewId}`
              : `колонка в ${viewId}`,
          });
        }
      } else if (Array.isArray(view?.columns)) {
        for (const cid of view.columns) {
          const key = `${domainId}|${cid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(cid),
            domainId,
            description: `колонка в ${viewId}`,
          });
        }
      }
    }
  }
  return out;
}

const collectRefsCache = new WeakMap<
  SectionRef[],
  Map<string, RefSuggestion[]>
>();

function collectRefsForField(
  items: SectionRef[],
  currentDomainId: string | null,
  opts: { shortKind: number; fqidKind?: number; typeFilter?: string },
): RefSuggestion[] {
  const cacheKey = `${currentDomainId || ""}|${opts.typeFilter || ""}|${opts.shortKind}|${opts.fqidKind || ""}`;
  let byKey = collectRefsCache.get(items);
  if (!byKey) {
    byKey = new Map();
    collectRefsCache.set(items, byKey);
  }
  const cached = byKey.get(cacheKey);
  if (cached) return cached;

  const cur = (currentDomainId || "").toLowerCase();
  const out: RefSuggestion[] = [];
  const seenLocal = new Set<string>();
  const seenForeign = new Set<string>();

  for (const it of items) {
    if (!it?.id) continue;
    if (opts.typeFilter && it.type !== opts.typeFilter) continue;
    const dom = (it.domainId || "").toLowerCase();
    if (!dom || dom === cur) {
      if (seenLocal.has(it.id)) continue;
      seenLocal.add(it.id);
      out.push({
        label: it.id,
        insertText: " " + it.id,
        kind: opts.shortKind,
        sortText: "0_" + it.id,
        documentation: it.description,
      });
    }
  }

  for (const it of items) {
    if (!it?.id) continue;
    if (opts.typeFilter && it.type !== opts.typeFilter) continue;
    const dom = (it.domainId || "").toLowerCase();
    if (!dom || dom === cur) continue;
    const fqid = `${it.domainId}/${it.id}`;
    if (seenForeign.has(fqid)) continue;
    seenForeign.add(fqid);
    out.push({
      label: fqid,
      insertText: " " + fqid,
      kind: opts.fqidKind ?? opts.shortKind,
      sortText: "9_" + fqid,
      detail: `из ${it.domainId}`,
      documentation: it.description,
    });
  }

  byKey.set(cacheKey, out);
  return out;
}

let lastCtxCache: {
  modelVersionId: number;
  lineNumber: number;
  lineText: string;
  ctx: ValueCtx;
} | null = null;

function getCachedValueContext(model: any, position: any): ValueCtx {
  let versionId = 0;
  try {
    versionId = model.getVersionId();
  } catch {
    /* ignore */
  }
  const lineText = model.getLineContent(position.lineNumber);
  if (
    lastCtxCache &&
    lastCtxCache.modelVersionId === versionId &&
    lastCtxCache.lineNumber === position.lineNumber &&
    lastCtxCache.lineText === lineText
  ) {
    return lastCtxCache.ctx;
  }
  const ctx = detectValueContext(model, position);
  lastCtxCache = {
    modelVersionId: versionId,
    lineNumber: position.lineNumber,
    lineText,
    ctx,
  };
  return ctx;
}

interface TreeChildrenContext {
  parentEntityFqid: string | null;
  currentLinkageRef: string | null;
  currentDomain: string;
}

function detectTreeChildrenContext(
  model: any,
  position: any,
  currentDomain: string,
  index: ModelIndex | null,
): TreeChildrenContext | null {
  if (!index) return null;

  // 1. Секция trees?
  let sectionName = "";
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) {
      const m = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) sectionName = m[1];
      break;
    }
  }
  if (sectionName !== "trees") return null;

  // 2. Наш dash-line (`- linkage:`, `- entity:` или `- ` — новый элемент)
  const currentLine = model.getLineContent(position.lineNumber);
  const currentIndent = (currentLine.match(/^(\s*)/) || ["", ""])[1].length;

  let dashLine = -1;
  let dashIndent = -1;
  const currentDashM = currentLine.match(/^(\s*)-\s+\S?/);
  if (currentDashM) {
    dashLine = position.lineNumber;
    dashIndent = currentDashM[1].length;
  } else {
    for (let i = position.lineNumber - 1; i >= 1; i--) {
      const line = model.getLineContent(i);
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind < currentIndent) {
        const m = line.match(/^(\s*)-\s+\S/);
        if (m) {
          dashLine = i;
          dashIndent = m[1].length;
        }
        break;
      }
    }
  }
  if (dashLine < 0) return null;

  // 3. Убеждаемся, что мы внутри children[] (а не в верхнем hierarchy.entity)
  let hierarchyIndent = -1;
  for (let i = dashLine - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) break;
    const hm = line.match(/^(\s*)hierarchy\s*:\s*$/);
    if (hm) {
      hierarchyIndent = hm[1].length;
      break;
    }
  }
  if (hierarchyIndent < 0) return null;
  if (dashIndent < hierarchyIndent + 4) return null;

  // 4. Parent entity — на уровне dashIndent - 2
  let parentEntityId: string | null = null;
  const targetIndent = dashIndent - 2;
  for (let i = dashLine - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind < targetIndent) break;
    if (ind === targetIndent) {
      const m = line.match(/^\s*entity\s*:\s*([^\s#]+)/);
      if (m) {
        parentEntityId = m[1].replace(/["']/g, "");
        break;
      }
    }
  }

  // 5. Текущий linkage — sibling в нашем `- ` блоке
  let currentLinkageRef: string | null = null;
  let blockEnd = model.getLineCount() + 1;
  for (let i = dashLine + 1; i <= model.getLineCount(); i++) {
    const line = model.getLineContent(i);
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind < dashIndent) {
      blockEnd = i;
      break;
    }
    const dm = line.match(/^(\s*)-\s+\S/);
    if (dm && dm[1].length === dashIndent) {
      blockEnd = i;
      break;
    }
  }
  for (let i = dashLine; i < blockEnd; i++) {
    const line = model.getLineContent(i);
    const m = line.match(/^\s*(?:-\s+)?linkage\s*:\s*([^\s#]+)/);
    if (m) {
      currentLinkageRef = m[1].replace(/["']/g, "");
      break;
    }
  }

  return {
    parentEntityFqid: parentEntityId
      ? `${currentDomain}/${parentEntityId}`.toLowerCase()
      : null,
    currentLinkageRef,
    currentDomain,
  };
}

function relationOf(
  entityFqid: string,
  linkSideFqid: string,
  index: ModelIndex,
): "same" | "ancestor" | "descendant" | null {
  if (!entityFqid || !linkSideFqid) return null;
  const eL = entityFqid.toLowerCase();
  const lL = linkSideFqid.toLowerCase();
  if (eL === lL) return "same";

  // linkSide — предок entity (entity наследует от linkSide)
  let cur: string | undefined = eL;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const e = index.entitiesByFqid[cur];
    if (!e || !e.inherits) break;
    if (e.inherits.toLowerCase() === lL) return "ancestor";
    cur = e.inherits.toLowerCase();
  }

  // entity — предок linkSide
  cur = lL;
  const seen2 = new Set<string>();
  while (cur && !seen2.has(cur)) {
    seen2.add(cur);
    const e = index.entitiesByFqid[cur];
    if (!e || !e.inherits) break;
    if (e.inherits.toLowerCase() === eL) return "descendant";
    cur = e.inherits.toLowerCase();
  }

  return null;
}

function buildTreeLinkageCandidates(
  parentFqid: string | null,
  currentDomain: string,
  Kind: any,
): RefSuggestion[] {
  const index = ctx.modelIndex;
  if (!index) return [];

  interface C {
    l: any;
    score: number;
    detail: string;
  }
  const candidates: C[] = [];

  for (const l of index.entityLinkages) {
    if ((l.domainId || "").toLowerCase() !== currentDomain) continue;

    const side1Rel = parentFqid
      ? relationOf(parentFqid, l.side1Fqid, index)
      : null;
    const side2Rel = parentFqid
      ? relationOf(parentFqid, l.side2Fqid, index)
      : null;
    const isSymmetric = l.side1Fqid === l.side2Fqid;
    const isUndirected = l.type === "n_n" && l.undirected === true;
    const peer = l.side2Fqid.split("/").pop() || l.side2Fqid;

    let score = 10;
    let detail = `${l.type}`;

    if (l.type === "1_n") {
      if (side1Rel === "same") {
        score = 1000;
        detail = `1_n · parent → ${peer}`;
      } else if (side1Rel === "ancestor") {
        score = 900;
        detail = `1_n · parent наследует side1 · → ${peer}`;
      } else if (side2Rel === "same") {
        score = 300;
        detail = `1_n · inverted (parent на стороне many)`;
      } else {
        score = 100;
        detail = `1_n · не связан с parent`;
      }
    } else if (l.type === "n_n") {
      if (isUndirected) {
        score = 100;
        detail = `n_n undirected`;
      } else if (side1Rel === "same" || side2Rel === "same") {
        score = 500;
        detail = `n_n · ${l.side1Fqid.split("/").pop()} ↔ ${l.side2Fqid.split("/").pop()}`;
      } else {
        score = 200;
        detail = `n_n · не связан с parent`;
      }
    } else if (l.type === "1_1") {
      score = 30;
      detail = `1_1 · не подходит для иерархии`;
    } else {
      detail = `${l.type}`;
    }

    candidates.push({ l, score, detail });
  }

  candidates.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.l.id.localeCompare(b.l.id),
  );

  return candidates.map(({ l, score, detail }) => ({
    label: l.id,
    insertText: " " + l.id,
    kind: Kind.Reference,
    sortText: (2000 - score).toString().padStart(4, "0") + "_" + l.id,
    detail,
    documentation: `${l.type} · ${l.side1Fqid} → ${l.side2Fqid}`,
  }));
}

function buildTreeEntityCandidates(
  treeCtx: TreeChildrenContext,
  Kind: any,
): RefSuggestion[] {
  const index = ctx.modelIndex;
  if (!index) return [];
  const cur = treeCtx.currentDomain;

  // Разрешаем target из linkage + parent
  let targetFqid: string | null = null;
  if (treeCtx.parentEntityFqid && treeCtx.currentLinkageRef) {
    targetFqid = resolveLinkageTargetEntityFqid(
      treeCtx.currentLinkageRef,
      treeCtx.parentEntityFqid,
      cur,
      index,
    );
  }

  const seen = new Set<string>();
  const items: RefSuggestion[] = [];

  const push = (e: any, score: number, detail: string) => {
    if (!e || seen.has(e.entityId)) return;
    seen.add(e.entityId);
    items.push({
      label: e.entityId,
      insertText: " " + e.entityId,
      kind: Kind.Class,
      sortText: (2000 - score).toString().padStart(4, "0") + "_" + e.entityId,
      detail,
      documentation: e.description || undefined,
    });
  };

  if (targetFqid) {
    const target = index.entitiesByFqid[targetFqid];
    if (target) push(target, 1000, `target of ${treeCtx.currentLinkageRef}`);

    // Descendants target-entity
    const walkDesc = (fqid: string, depth: number) => {
      const ds = index.entityChildrenByFqid[fqid] || [];
      for (const df of ds) {
        const d = index.entitiesByFqid[df];
        if (d) push(d, 900 - depth * 20, `descendant (${depth + 1})`);
        walkDesc(df, depth + 1);
      }
    };
    walkDesc(targetFqid, 0);
  }

  // Все сущности домена — fallback в самом низу
  for (const e of index.entities) {
    if ((e.domainId || "").toLowerCase() !== cur) continue;
    push(e, 100, "entity");
  }

  return items;
}

function detectValueContext(model: any, position: any): ValueCtx {
  const lineText = model.getLineContent(position.lineNumber);
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  const dc = determineViewContainer(model, position.lineNumber, currentIndent);

  const stack: Array<{ indent: number; key: string }> = [];
  if (dc.containerLine >= 0) {
    let boundary = dc.containerIndent;
    for (let i = dc.containerLine - 1; i >= 1; i--) {
      const pl = model.getLineContent(i);
      if (!pl || !pl.trim() || pl.trim().startsWith("#")) continue;
      const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
      if (pIndent >= boundary) continue;

      if (pIndent === 0) {
        const m = pl.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (m) stack.unshift({ indent: 0, key: m[1] });
        break;
      }

      const m = pl.match(/^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
      if (!m) continue;
      stack.unshift({ indent: pIndent, key: m[2] });
      boundary = pIndent;
    }
  }

  let section = "";
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl || !pl.trim()) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent === 0) {
      const m = pl.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) {
        section = m[1];
        break;
      }
    }
  }

  const itemType = computeItemTypeFast(
    model,
    section,
    dc.container,
    dc.containerLine,
    dc.containerIndent,
    stack,
  );

  return { section, container: dc.container, itemType };
}

function determineViewContainer(
  model: any,
  currentLineIdx: number, // 1-based
  currentIndent: number,
): { container: string; containerLine: number; containerIndent: number } {
  for (let i = currentLineIdx - 1; i >= 1; i--) {
    const l = model.getLineContent(i);
    if (!l || !l.trim() || l.trim().startsWith("#")) continue;
    const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (lIndent >= currentIndent) continue;

    const m = l.match(/^(\s*)(-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const isDash = !!m[2];
    const key = m[3];
    const rest = (m[4] || "").replace(/#.*$/, "").trim();

    if (key === "id") continue;

    if (isDash) {
      if (rest) continue;

      let valueIndent = -1;
      for (let j = i + 1; j < currentLineIdx; j++) {
        const nl = model.getLineContent(j);
        if (!nl || !nl.trim() || nl.trim().startsWith("#")) continue;
        const nInd = (nl.match(/^(\s*)/) || ["", ""])[1].length;
        if (nInd > lIndent) {
          valueIndent = nInd;
          break;
        }
      }
      if (valueIndent > 0 && currentIndent < valueIndent) continue;
    }

    return { container: key, containerLine: i, containerIndent: lIndent };
  }
  return { container: "", containerLine: -1, containerIndent: -1 };
}

function computeItemTypeFast(
  model: any,
  section: string,
  container: string,
  containerLine: number,
  containerIndent: number,
  stack: Array<{ indent: number; key: string }>,
): string {
  // ── entities / linkages ──
  if (section === "entities") {
    if (container === "constraints") return "attributeConstraint";
    if (container === "mergeStrategy") return "reconciliationMergeStrategy";
    if (container === "graphView") return "graphView";
    if (container === "types") return "treeNodeType";
    if (container === "of") return "treeNodeOf";
    if (container === "attributes") {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].indent >= containerIndent) continue;
        if (stack[s].key === "searching") return "searchingAttributesItem";
        break;
      }
      return "attribute";
    }
    return "entity";
  }
  if (section === "linkages") {
    if (container === "constraints") return "attributeConstraint";
    if (container === "attributes") return "linkageAttribute";
    return "linkage";
  }

  // ── views ──
  if (section === "views") {
    if (container === "source") return "viewSourceType";
    if (container === "widgets") return "widget";
    if (container === "groups") return "group";
    if (container === "actions") return "viewTableActionType";
    if (container === "buttons") return "viewButtonType";

    if (container === "filter") return "";
    if (container === "attributes" || container === "linkages") {
      let parent = "";
      for (let s = stack.length - 1; s >= 0; s--) {
        if (
          stack[s].key !== "id" &&
          stack[s].key !== container &&
          stack[s].indent < containerIndent
        ) {
          parent = stack[s].key;
          break;
        }
      }
      if (parent === "filter") {
        return container === "attributes"
          ? "viewFilterAttributesType"
          : "viewFilterLinkagesType";
      }
      return "";
    }

    if (container === "control") {
      const ancestors = new Set<string>();
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].indent >= containerIndent) continue;
        ancestors.add(stack[s].key);
      }

      if (ancestors.has("buttons") || ancestors.has("footer")) {
        return "viewButtonControl";
      }
      if (ancestors.has("menu")) return "viewWidgetActionControl";
      if (ancestors.has("actions") && ancestors.has("columns")) {
        return "viewButtonControl";
      }
      if (ancestors.has("columns")) return "viewTableColumnControl";
      if (ancestors.has("widgets")) {
        const widgetType = findWidgetTypeForControl(model, containerLine);
        if (widgetType === "action") return "viewWidgetActionControl";
        if (widgetType === "linkage") return "viewWidgetLinkageControl";
        if (widgetType === "linked_objects_groups") {
          return "viewWidgetLinkageControl";
        }
        return "viewWidgetControl";
      }
      return "viewWidgetControl";
    }

    if (container === "layout") {
      let itemLine = -1;
      let itemIndent = -1;
      for (let i = containerLine - 1; i >= 1; i--) {
        const l = model.getLineContent(i);
        if (!l || !l.trim() || l.trim().startsWith("#")) continue;
        const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (ind >= containerIndent) continue;
        const m = l.match(/^(\s*)-\s+id\s*:/);
        if (m) {
          itemLine = i;
          itemIndent = m[1].length;
          break;
        }
        if (ind === 0) break;
      }
      if (itemLine !== -1) {
        for (let i = itemLine + 1; i < containerLine; i++) {
          const l = model.getLineContent(i);
          if (!l || !l.trim()) continue;
          const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
          if (ind <= itemIndent) break;
          if (/^\s*type\s*:\s*dashboard\b/.test(l)) {
            return "viewDashboardLayout";
          }
        }
      }
      return "viewGroupLayout";
    }

    if (container === "context") return "viewWidgetDragDropContext";

    if (container === "views") {
      let isNested = false;
      for (let i = containerLine - 1; i >= 1; i--) {
        const l = model.getLineContent(i);
        if (!l || !l.trim() || l.trim().startsWith("#")) continue;
        const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lIndent >= containerIndent) continue;
        if (/^\s*-\s+[a-zA-Z_][\w]*\s*:/.test(l)) {
          isNested = true;
          break;
        }
        if (lIndent === 0) break;
      }
      return isNested ? "viewNested" : "view";
    }

    return "";
  }

  // ── dataTypes ──
  if (section === "dataTypes") {
    if (container === "control") return "viewWidgetControl";
    if (
      container === "columns" ||
      container === "sortingBy" ||
      container === "defaults" ||
      container === "paging" ||
      container === "view"
    ) {
      return "";
    }
    return "dataType";
  }

  if (container === "openBoardsFromGraph") return "actionOpenBoardsFromGraph";

  // ── actions ──
  if (section === "actions") {
    if (container === "attributes") {
      return isInsideBulkSettings(
        (n) => model.getLineContent(n) || "",
        containerLine,
        containerIndent,
      )
        ? "actionBulkSettingsAttributes"
        : "actionAttributes";
    }
    if (container === "linkages") {
      return isInsideBulkSettings(
        (n) => model.getLineContent(n) || "",
        containerLine,
        containerIndent,
      )
        ? "actionBulkSettingsLinkages"
        : "actionLinkages";
    }
    if (container === "values") return "actionValue";
    if (container === "control") return "actionControl";
    if (container === "automation") return "actionAutomation";
    return "action";
  }

  if (section === "dataRules")
    return container === "rule" ? "dataRuleRule" : "dataRule";
  if (section === "uiRules")
    return container === "rule" ? "uiRuleRule" : "uiRule";
  if (section === "menus") return container === "items" ? "menuItem" : "menu";
  if (section === "medias") return "media";
  if (section === "sequences") return "sequence";
  if (section === "trees") return "tree";
  if (section === "transitiveLinkages") return "transitiveLinkage";
  if (section === "accessRules") {
    if (
      container === "create" ||
      container === "delete" ||
      container === "edit" ||
      container === "view" ||
      container === "launch"
    ) {
      return "accessRuleItem";
    }
    if (container === "except") return "accessRuleException";
    return "accessRule";
  }
  if (section === "permissions") return "permission";
  if (section === "localizations") return "localization";
  if (section === "mixins") return "mixin";
  if (container === "layout") return "layout";
  if (container === "search") return "transitiveSearch";
  if (container === "by" || container === "defaults") return "sortingByItem";
  return "";
}

function findWidgetTypeForControl(model: any, controlLine: number): string {
  if (controlLine < 1 || controlLine > model.getLineCount()) return "";
  const controlText = model.getLineContent(controlLine);
  if (!controlText) return "";

  const controlIndent = (controlText.match(/^(\s*)/) || ["", ""])[1].length;
  const isControlOpener = /^\s*-\s+control\s*:\s*(?:#.*)?$/.test(controlText);

  const widgetItemIndent = isControlOpener ? controlIndent : controlIndent - 2;
  if (widgetItemIndent < 0) return "";
  const widgetFieldIndent = widgetItemIndent + 2;

  let blockStart = controlLine;
  if (!isControlOpener) {
    for (let i = controlLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      if (!l || !l.trim() || l.trim().startsWith("#")) continue;
      const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
      const m = l.match(/^(\s*)-\s+\S/);
      if (m && m[1].length === widgetItemIndent) {
        blockStart = i;
        break;
      }
      if (ind < widgetItemIndent) break;
    }
  }

  const lineCount = model.getLineCount();
  let blockEnd = lineCount + 1;
  for (let i = blockStart + 1; i <= lineCount; i++) {
    const l = model.getLineContent(i);
    if (!l || !l.trim()) continue;
    const m = l.match(/^(\s*)-\s+\S/);
    if (m && m[1].length <= widgetItemIndent) {
      blockEnd = i;
      break;
    }
  }

  let blockScalarIndent = -1;
  for (let i = blockStart; i < blockEnd; i++) {
    const l = model.getLineContent(i);
    if (!l || !l.trim()) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;

    if (blockScalarIndent >= 0) {
      if (ind > blockScalarIndent) continue;
      blockScalarIndent = -1;
    }
    if (l.trim().startsWith("#")) continue;

    if (/^\s*(?:-\s+)?[a-zA-Z_][\w]*\s*:\s*[|>][+\-]?\s*(?:#.*)?$/.test(l)) {
      blockScalarIndent = ind;
      continue;
    }

    if (ind !== widgetFieldIndent) continue;

    const tm = l.match(/^\s*type\s*:\s*["']?([\w.-]+)["']?/);
    if (tm) return tm[1];
  }

  return "";
}

/** Monaco рендерит documentation как markdown — экранируем спецсимволы. */
function escapeMd(s: string): string {
  return String(s).replace(/[\\`*_{}\[\]()<>#+\-!|~]/g, "\\$&");
}

/** Собирает `documentation` в формате IMarkdownString. */
function mdDoc(text?: string): { value: string } | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return { value: escapeMd(trimmed) };
}

function buildValueCompletion(
  model: any,
  position: any,
  fieldNames: string[],
  values: RefSuggestion[],
  Kind: any,
): { suggestions: any[] } | null {
  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);

  const fieldAlt = fieldNames
    .map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`^(\\s*(?:-\\s+)?(?:${fieldAlt})\\s*:)`);
  const m = beforeCursor.match(re);
  if (!m) return null;

  const startColumn = m[1].length + 1;
  const charAtCursor = lineText.charAt(position.column - 1);
  const endColumn =
    charAtCursor === '"' || charAtCursor === "'"
      ? position.column + 1
      : position.column;

  const range = {
    startLineNumber: position.lineNumber,
    startColumn,
    endLineNumber: position.lineNumber,
    endColumn,
  };

  return {
    suggestions: values.map((v) => ({
      label: v.label,
      kind: v.kind ?? Kind.Reference,
      insertText: v.insertText,
      filterText: v.label,
      sortText: v.sortText,
      detail: v.detail,
      documentation: mdDoc(v.documentation),
      range,
    })),
  };
}

const mkSimple = (
  vals: string[],
  kind: number,
  descriptions?: Record<string, string>,
): RefSuggestion[] =>
  vals.map((t) => ({
    label: t,
    insertText: " " + t,
    kind,
    sortText: t,
    documentation: descriptions?.[t],
  }));

// ============ Разбор слова под курсором ============

interface WordHit {
  /** Тип: определение id, ссылка на сущность, ссылка на атрибут, простая ссылка. */
  type:
    | "id-def"
    | "ref-entity"
    | "ref-attribute"
    | "ref-item"
    | "ref-fqid-foreign"
    | "ref-datatype";
  /** Значение — то, что нужно искать. */
  value: string;
  /** Для attr — имя сущности. */
  entityPart?: string;
  /** Для attr — путь к атрибуту (может быть вложенным `attr.subfield`). */
  attributePart?: string;
  /** Домен-префикс FQID (если указан). */
  domainPrefix?: string | null;
  /** Полный FQID. */
  fqid?: string;
  /** Исходное поле. */
  field: string;
}

// ============ Хелперы для value-комплита ============

/** Уникальные ID из произвольного набора секций всех доменов. */
function collectSectionIds(
  ctx: ProviderContext,
  sectionKey: string,
  typeFilter?: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.schemasByDomain) return out;
  Object.values(ctx.modelIndex.schemasByDomain).forEach((s: any) => {
    const sec = s?.sections?.[sectionKey];
    if (!sec?.items) return;
    for (const it of sec.items) {
      if (!it?.id) continue;
      if (typeFilter && it.type !== typeFilter) continue;
      const id = String(it.id);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  });
  return out;
}

/** Собирает ID всех виджетов из viewElementsByDomain (уникальные). */
function collectWidgetIds(ctx: ProviderContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  Object.values(ctx.modelIndex.viewElementsByDomain).forEach((byView) => {
    Object.values(byView).forEach((els: any) => {
      (els.widgets || []).forEach((w: string) => {
        if (!seen.has(w)) {
          seen.add(w);
          out.push(w);
        }
      });
    });
  });
  return out;
}

function collectGroupIds(ctx: ProviderContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  Object.values(ctx.modelIndex.viewElementsByDomain).forEach((byView) => {
    Object.values(byView).forEach((els: any) => {
      (els.groups || []).forEach((g: string) => {
        if (!seen.has(g)) {
          seen.add(g);
          out.push(g);
        }
      });
    });
  });
  return out;
}

function collectColumnIds(ctx: ProviderContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  Object.values(ctx.modelIndex.viewElementsByDomain).forEach((byView) => {
    Object.values(byView).forEach((els: any) => {
      (els.columns || []).forEach((c: string) => {
        if (!seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      });
    });
  });
  return out;
}

/**
 * Разбирает строку YAML и возвращает информацию о том, что находится под курсором.
 */
function findWordAtLine(lineText: string, column: number): WordHit | null {
  // Группа 3 — value с любым хвостом. group[3] заканчивается на конце строки.
  const fieldMatch = lineText.match(
    /^(\s*)(?:-\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/,
  );
  if (!fieldMatch) return null;

  const field = fieldMatch[2];
  let valueRaw = fieldMatch[3].trim();
  // отрезаем YAML-комментарий, но только вне кавычек
  if (!/^["']/.test(valueRaw)) {
    const hash = valueRaw.indexOf(" #");
    if (hash >= 0) valueRaw = valueRaw.slice(0, hash).trim();
  }
  if (!valueRaw || valueRaw.startsWith("#")) return null;

  // Надёжный расчёт начала value: group[3] идёт до конца строки,
  // значит valueRaw занимает последние (valueRaw.length) символов
  // от lineText.trimEnd().length
  const trimmedLine = lineText.replace(/\s+$/, "");
  const valueStart = trimmedLine.length - valueRaw.length;
  if (valueStart < 0) return null;
  const valueEnd = valueStart + valueRaw.length;

  // Monaco column 1-based
  if (column < valueStart + 1 || column > valueEnd) return null;

  let value = valueRaw;
  let quoteOffset = 0;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
    quoteOffset = 1;
  }

  // relativeCol — 0-based позиция внутри value
  const relativeCol = column - 1 - valueStart - quoteOffset;
  if (relativeCol < 0 || relativeCol > value.length) return null;

  if (field === "id") {
    return { type: "id-def", value, field };
  }

  if (
    field === "dataType" ||
    (field === "item" && value.startsWith("dataType"))
  ) {
    // handled elsewhere — не наша забота
  }

  if (field === "dataType") {
    return { type: "ref-datatype", value, field };
  }

  const isAttributeLike = ATTRIBUTE_LIKE_FIELDS.has(field);
  const isRefField = REF_FIELDS.has(field);
  if (!isAttributeLike && !isRefField) return null;

  const slashIdx = value.indexOf("/");
  let domainPrefix: string | null = null;
  let rest = value;
  let restStart = 0;
  if (slashIdx > 0) {
    domainPrefix = value.slice(0, slashIdx).toLowerCase();
    rest = value.slice(slashIdx + 1);
    restStart = slashIdx + 1;
  }

  const dotIdx = rest.indexOf(".");
  const isForeignDomain =
    !!domainPrefix &&
    domainPrefix !== (ctx.currentDomainId || "").toLowerCase();

  if (isAttributeLike && dotIdx > 0) {
    const entityPart = rest.slice(0, dotIdx);
    const attributePart = rest.slice(dotIdx + 1);

    const entityEndInValue = restStart + entityPart.length;
    const attrStartInValue = entityEndInValue + 1;
    const attrEndInValue = attrStartInValue + attributePart.length;

    if (relativeCol >= restStart && relativeCol <= entityEndInValue) {
      if (isForeignDomain) {
        return {
          type: "ref-fqid-foreign",
          value: entityPart,
          domainPrefix,
          fqid: domainPrefix + "/" + entityPart,
          field,
        };
      }
      return {
        type: "ref-entity",
        value: entityPart,
        domainPrefix,
        fqid: (domainPrefix ? domainPrefix + "/" : "") + entityPart,
        field,
      };
    }
    if (relativeCol >= attrStartInValue && relativeCol <= attrEndInValue) {
      if (isForeignDomain) {
        return {
          type: "ref-fqid-foreign",
          value: attributePart,
          entityPart,
          attributePart,
          domainPrefix,
          fqid: domainPrefix + "/" + entityPart + "." + attributePart,
          field,
        };
      }
      return {
        type: "ref-attribute",
        value: attributePart,
        entityPart,
        attributePart,
        domainPrefix,
        field,
      };
    }
    return null;
  }

  if (isAttributeLike) {
    if (dotIdx > 0) {
      // существующая логика split (без изменений)
      const entityPart = rest.slice(0, dotIdx);
      const attributePart = rest.slice(dotIdx + 1);

      const entityEndInValue = restStart + entityPart.length;
      const attrStartInValue = entityEndInValue + 1;
      const attrEndInValue = attrStartInValue + attributePart.length;

      if (relativeCol >= restStart && relativeCol <= entityEndInValue) {
        if (isForeignDomain) {
          return {
            type: "ref-fqid-foreign",
            value: entityPart,
            domainPrefix,
            fqid: `${domainPrefix}/${entityPart}`,
            field,
          };
        }
        return {
          type: "ref-entity",
          value: entityPart,
          domainPrefix,
          fqid: (domainPrefix ? domainPrefix + "/" : "") + entityPart,
          field,
        };
      }
      if (relativeCol >= attrStartInValue && relativeCol <= attrEndInValue) {
        if (isForeignDomain) {
          return {
            type: "ref-fqid-foreign",
            value: attributePart,
            entityPart,
            attributePart,
            domainPrefix,
            fqid: `${domainPrefix}/${entityPart}.${attributePart}`,
            field,
          };
        }
        return {
          type: "ref-attribute",
          value: attributePart,
          entityPart,
          attributePart,
          domainPrefix,
          field,
        };
      }
      return null;
    }

    // ── attribute без точки: резолвится через lineContexts ──
    return {
      type: "ref-attribute",
      value: rest,
      entityPart: undefined,
      attributePart: rest,
      domainPrefix,
      field,
    };
  }

  if (isAttributeLike && dotIdx <= 0) {
    // `attribute: name`, `by: name`, `item: x`, `use: y` — атрибут без точки.
    // Сущность берётся из lineContexts (родительский entities[].id),
    // а при FQID-префиксе (`attribute: my.tld/Device.name`) — уже разобрано выше.
    return {
      type: "ref-attribute",
      value: rest,
      attributePart: rest,
      // entityPart отсутствует — provideHover резолвит через lineContexts
      domainPrefix,
      field,
    };
  }

  if (isForeignDomain) {
    return {
      type: "ref-fqid-foreign",
      value: rest,
      domainPrefix,
      fqid: domainPrefix + "/" + rest,
      field,
    };
  }

  return {
    type: "ref-item",
    value: rest,
    domainPrefix,
    fqid: (domainPrefix ? domainPrefix + "/" : "") + rest,
    field,
  };
}

// ============ Поиск определений ============

/** Ищет строку сущности по её id в секции entities. */
function findEntityLine(entityId: string, lineMap: LineMap): number | null {
  const section = lineMap.sections.find((s) => s.key === "entities");
  if (!section) return null;
  const node = section.nodes.find((n) => n.id === entityId);
  return node ? node.line : null;
}

/**
 * Ищет строку атрибута внутри сущности.
 * attributePart может быть "identifier" или "tableAttr.subField".
 */
function findAttributeLine(
  entityId: string,
  attributePart: string,
  lineMap: LineMap,
): number | null {
  const section = lineMap.sections.find((s) => s.key === "entities");
  if (!section) return null;
  const entity = section.nodes.find((n) => n.id === entityId);
  if (!entity || !entity.children) return null;

  // Полный путь из сегментов
  const segments = attributePart.split(".");
  const firstSegment = segments[0];

  // Ищем по дереву вглубь
  const stack = [...entity.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === firstSegment) {
      // Нашли первый сегмент. Если один сегмент — это он
      if (segments.length === 1) return node.line;

      // Если больше — ищем следующий сегмент в его children
      let current = node;
      for (let i = 1; i < segments.length; i++) {
        const next = (current.children || []).find((c) => c.id === segments[i]);
        if (!next) {
          // Не нашли вложенный — вернём строку первого сегмента
          return node.line;
        }
        current = next;
      }
      return current.line;
    }
    if (node.children) stack.push(...node.children);
  }
  return null;
}

/**
 * Ищет строку элемента в любой секции по его id.
 * Используется для `inherits`, `view`, `action`, `linkage` и т.п.
 */
function findItemLine(itemId: string, lineMap: LineMap): number | null {
  // Сначала — itemLines
  for (const [key, line] of lineMap.itemLines.entries()) {
    if (key.endsWith("#" + itemId)) return line;
  }
  // Потом — обход всех children
  const stack: NavNode[] = [];
  lineMap.sections.forEach((s) => stack.push(...s.nodes));
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === itemId) return node.line;
    if (node.children) stack.push(...node.children);
  }
  return null;
}

// ============ Symbol Provider ============

function flattenSections(sections: SectionBlock[]): Array<{
  node: NavNode;
  sectionKey: string;
  depth: number;
}> {
  const out: Array<{ node: NavNode; sectionKey: string; depth: number }> = [];
  const walk = (node: NavNode, sectionKey: string, depth: number) => {
    out.push({ node, sectionKey, depth });
    if (node.children)
      node.children.forEach((c) => walk(c, sectionKey, depth + 1));
  };
  sections.forEach((s) => s.nodes.forEach((n) => walk(n, s.key, 0)));
  return out;
}

function buildSymbols(monaco: any, lineMap: LineMap): any[] {
  const { SymbolKind } = monaco.languages;
  const SECTION_KIND: Record<string, number> = {
    entities: SymbolKind.Class,
    linkages: SymbolKind.Interface,
    dataTypes: SymbolKind.Enum,
    sequences: SymbolKind.Constant,
    actions: SymbolKind.Function,
    views: SymbolKind.Namespace,
    menus: SymbolKind.Module,
    mixins: SymbolKind.Struct,
    dataRules: SymbolKind.Rule,
    medias: SymbolKind.File,
  };

  function toSymbol(node: NavNode, sectionKey: string, depth: number): any {
    const kind =
      depth === 0
        ? SECTION_KIND[sectionKey] || SymbolKind.Object
        : depth === 1
          ? SymbolKind.Object
          : SymbolKind.Field;

    const range = {
      startLineNumber: node.line,
      startColumn: 1,
      endLineNumber: node.line,
      endColumn: 1,
    };

    return {
      name: node.id,
      detail: node.meta || node.label,
      kind,
      tags: [],
      range,
      selectionRange: range,
      children: (node.children || []).map((c) =>
        toSymbol(c, sectionKey, depth + 1),
      ),
    };
  }

  return lineMap.sections.map((section) => ({
    name: section.label,
    detail: `${section.count} items`,
    kind: SymbolKind.Namespace,
    tags: [],
    range: {
      startLineNumber: section.line,
      startColumn: 1,
      endLineNumber: section.line,
      endColumn: 1,
    },
    selectionRange: {
      startLineNumber: section.line,
      startColumn: 1,
      endLineNumber: section.line,
      endColumn: 1,
    },
    children: section.nodes.map((n) => toSymbol(n, section.key, 1)),
  }));
}

// ============ Definition Provider ============

function makeLocation(model: any, line: number): any {
  return {
    uri: model.uri,
    range: {
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1,
    },
  };
}

function provideDefinition(monaco: any, model: any, position: any): any {
  if (!ctx.lineMap) return null;
  const lineText = model.getLineContent(position.lineNumber);
  const hit = findWordAtLine(lineText, position.column);
  if (!hit) return null;

  if (hit.type === "id-def") return null;

  if (hit.type === "ref-entity") {
    const entityLine = findEntityLine(hit.value, ctx.lineMap);
    if (entityLine != null) return [makeLocation(model, entityLine)];
    const itemLine = findItemLine(hit.value, ctx.lineMap);
    if (itemLine != null) return [makeLocation(model, itemLine)];
    return null;
  }

  if (hit.type === "ref-attribute") {
    // Если entityPart указан явно — используем его
    // Иначе — смотрим lineContexts для контекстной сущности
    let entityId = hit.entityPart;
    if (!entityId) {
      const lc = ctx.lineMap.lineContexts.get(position.lineNumber);
      entityId = lc?.entityId || undefined;
    }
    if (!entityId) return null;

    const attrLine = findAttributeInEntity(
      entityId,
      hit.attributePart || hit.value,
      ctx.lineMap,
    );
    if (attrLine != null) return [makeLocation(model, attrLine)];
    return null;
  }

  if (hit.type === "ref-item") {
    // Сначала — контекстная сущность (attribute: os без префикса)
    const lc = ctx.lineMap.lineContexts.get(position.lineNumber);
    if (lc?.entityId && (hit.field === "attribute" || hit.field === "by")) {
      const attrLine = findAttributeInEntity(
        lc.entityId,
        hit.value,
        ctx.lineMap,
      );
      if (attrLine != null) return [makeLocation(model, attrLine)];
    }
    // Потом — обычный item
    const itemLine = findItemLine(hit.value, ctx.lineMap);
    if (itemLine != null) return [makeLocation(model, itemLine)];
    // Фоллбэк — сущность
    const entityLine = findEntityLine(hit.value, ctx.lineMap);
    if (entityLine != null) return [makeLocation(model, entityLine)];
    return null;
  }

  return null;
}

// ============ Регистрация ============

// ============ Определения полей YAML по контексту ============

export interface FieldDef {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  priority?: 0 | 1 | 2;
}

export const FIELD_DEFINITIONS: Record<string, FieldDef[]> = {
  sortingItem: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила сортировки",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название правила",
    },
    {
      name: "by",
      type: "array",
      description: "Сортируемые атрибуты (attribute + direction)",
      required: true,
    },
    {
      name: "createIndex",
      type: "boolean",
      description: "Создать индекс для сортировки",
    },
  ],
  sortingByItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для сортировки",
      required: true,
    },
    {
      name: "direction",
      type: "enum",
      description: "asc — по возрастанию, desc — по убыванию",
    },
  ],
  identificationItem: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила",
      required: true,
    },
    {
      name: "rule",
      type: "array",
      description: "Массив условий (attribute / and / or)",
    },
    {
      name: "filter",
      type: "array",
      description: "VRL-правило фильтрации (массив строк)",
    },
  ],
  reconciliationItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут с приоритетами источников",
    },
    {
      name: "sourcePriority",
      type: "array",
      description: "Массив { source } в порядке убывания приоритета",
    },
    {
      name: "default",
      type: "array",
      description: "Источники по умолчанию для всех атрибутов",
    },
    {
      name: "mergeStrategy",
      type: "object",
      description: "Стратегия слияния значений",
    },
  ],
  reconciliationSourceItem: [
    {
      name: "source",
      type: "string",
      description: 'Название источника (или "*" для остальных)',
      required: true,
    },
  ],
  reconciliationMergeStrategy: [
    {
      name: "type",
      type: "enum",
      description:
        "replace | array_merge | array_concat | earliest_date | latest_date",
      required: true,
    },
  ],
  enumValue: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор значения",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "hidden",
      type: "boolean",
      description: "Скрыть значение из выбора",
    },
  ],
  workflowStatus: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор статуса",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название статуса",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "hidden",
      type: "boolean",
      description: "Скрыть из выбора",
    },
  ],
  transition: [
    {
      name: "from",
      type: "string",
      description: "Идентификатор исходного статуса или *",
      required: true,
    },
    {
      name: "to",
      type: "string",
      description: "Идентификатор целевого статуса",
      required: true,
    },
  ],
  treeChildren: [
    {
      name: "linkage",
      type: "ref",
      description: "Связь между родителем и потомком",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Дочерняя сущность",
      required: true,
    },
    {
      name: "side",
      type: "number",
      description: "Сторона связи с родителем (1 или 2)",
    },
    {
      name: "maxInstances",
      type: "number",
      description: "Максимум объектов сущности",
    },
    {
      name: "maxChildren",
      type: "number",
      description: "Максимум дочерних через связь",
    },
    {
      name: "children",
      type: "array",
      description: "Вложенные дочерние узлы",
    },
  ],
  treeSorting: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название правила",
    },
    {
      name: "by",
      type: "array",
      description: "Сортировка по сущностям и атрибутам",
      required: true,
    },
  ],
  treeSortingBy: [
    {
      name: "entity",
      type: "ref",
      description: "Сущность, для которой задаётся сортировка",
      required: true,
    },
    {
      name: "by",
      type: "array",
      description: "Атрибуты и направления",
      required: true,
    },
  ],
  treeSortingByBy: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для сортировки",
      required: true,
    },
    {
      name: "direction",
      type: "enum",
      description: "asc или desc (по умолчанию desc)",
    },
  ],
  actionValue: [
    {
      name: "attribute",
      type: "ref",
      description: "Идентификатор атрибута",
      required: true,
    },
    {
      name: "value",
      type: "string",
      description: "Устанавливаемое значение",
    },
  ],
  actionControl: [
    {
      name: "type",
      type: "string",
      description: "Тип редактора (опционально)",
    },
    {
      name: "trueText",
      type: "string",
      description: "Отображаемый текст для True",
      required: true,
    },
    {
      name: "falseText",
      type: "string",
      description: "Отображаемый текст для False",
      required: true,
    },
  ],
  actionBulkSettings: [
    {
      name: "entity",
      type: "ref",
      description: "Сущность для массового редактирования",
      required: true,
    },
    {
      name: "attributes",
      type: "object",
      description: "Настройки атрибутов (type: all|specific, use[])",
    },
    {
      name: "linkages",
      type: "object",
      description: "Настройки виджетов связей (type: all|specific, use[])",
    },
  ],
  actionBulkAttributeUse: [
    {
      name: "attribute",
      type: "ref",
      description: "Data ID Ref атрибута сущности",
      required: true,
    },
  ],
  actionBulkLinkageUse: [
    {
      name: "widget",
      type: "ref",
      description: "View ID виджета связи (сторона N)",
      required: true,
    },
  ],
  dataRuleAttributeAction: [
    {
      name: "attribute",
      type: "ref",
      description: "Ссылка на атрибут",
      required: true,
    },
    {
      name: "constraint",
      type: "rql",
      description: "RQL-ограничение (для effect: allowed)",
    },
    {
      name: "expression",
      type: "rql",
      description: "RQL-выражение (для default/allowed)",
    },
    {
      name: "value",
      type: "string",
      description: "Статическое значение (для effect: default)",
    },
    {
      name: "message",
      type: "string",
      description: "Сообщение об ошибке",
    },
    {
      name: "help",
      type: "string",
      description: "Подсказка при наведении",
    },
  ],
  dataRuleLinkageAction: [
    {
      name: "linkage",
      type: "ref",
      description: "Ссылка на связь",
      required: true,
    },
    {
      name: "side",
      type: "enum",
      description: "Сторона связи (1 или 2)",
    },
    {
      name: "constraint",
      type: "rql",
      description: "RQL-ограничение",
    },
    {
      name: "expression",
      type: "rql",
      description: "RQL-выражение",
    },
    {
      name: "min_count",
      type: "number",
      description: "Минимальное число объектов",
    },
    {
      name: "max_count",
      type: "number",
      description: "Максимальное число объектов",
    },
    {
      name: "message",
      type: "string",
      description: "Сообщение об ошибке",
    },
    {
      name: "help",
      type: "string",
      description: "Подсказка при наведении",
    },
  ],
  dataRuleNested: [
    {
      name: "type",
      type: "enum",
      description: "table | array",
      required: true,
    },
    {
      name: "attributes",
      type: "array",
      description: "Колонки (для type: table)",
    },
    {
      name: "items",
      type: "array",
      description: "Индексы элементов (для type: array)",
    },
  ],
  dataRuleNestedAttribute: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут таблицы",
      required: true,
    },
    {
      name: "constraint",
      type: "rql",
      description: "RQL-ограничение",
    },
    {
      name: "expression",
      type: "rql",
      description: "RQL-выражение",
    },
    {
      name: "value",
      type: "string",
      description: "Значение по умолчанию",
    },
    {
      name: "message",
      type: "string",
      description: "Сообщение об ошибке",
    },
    {
      name: "help",
      type: "string",
      description: "Подсказка",
    },
  ],
  dataRuleNestedItem: [
    {
      name: "item",
      type: "string",
      description: "Индекс элемента массива (0, 1, ... или '*')",
      required: true,
    },
    {
      name: "constraint",
      type: "rql",
      description: "RQL-ограничение",
    },
    {
      name: "expression",
      type: "rql",
      description: "RQL-выражение",
    },
    {
      name: "value",
      type: "string",
      description: "Значение по умолчанию",
    },
    {
      name: "message",
      type: "string",
      description: "Сообщение об ошибке",
    },
    {
      name: "help",
      type: "string",
      description: "Подсказка",
    },
  ],
  uiRuleWidget: [
    {
      name: "widget",
      type: "ref",
      description: "Идентификатор виджета (View ID)",
      required: true,
    },
    {
      name: "nested",
      type: "object",
      description: "Nested-эффект для Array/Table-виджетов",
    },
    {
      name: "presets",
      type: "array",
      description: "Пресеты стилей",
    },
  ],
  uiRuleGroup: [
    {
      name: "group",
      type: "ref",
      description: "Идентификатор группы",
      required: true,
    },
    {
      name: "presets",
      type: "array",
      description: "Пресеты стилей",
    },
  ],
  uiRuleColumn: [
    {
      name: "column",
      type: "ref",
      description: "Идентификатор колонки (View ID)",
      required: true,
    },
    {
      name: "presets",
      type: "array",
      description: "Пресеты стилей",
    },
  ],
  uiRuleNested: [
    {
      name: "type",
      type: "enum",
      description: "array или table",
      required: true,
    },
    {
      name: "attributes",
      type: "array",
      description: "Колонки таблицы (для type: table)",
    },
    {
      name: "items",
      type: "array",
      description: "Элементы массива (для type: array)",
    },
  ],
  uiRuleNestedAttribute: [
    {
      name: "attribute",
      type: "ref",
      description: "Идентификатор колонки таблицы",
      required: true,
    },
  ],
  uiRuleNestedItem: [
    {
      name: "item",
      type: "string",
      description: "Индекс элемента массива (0, 1, ... или '*')",
      required: true,
    },
  ],
  mixinView: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор примеси компонентов",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "form | tab | panel | page | list",
      required: true,
    },
    {
      name: "fromView",
      type: "ref",
      description: "Источник компонентов (для type: view)",
    },
    {
      name: "to",
      type: "object",
      description: "Целевое представление",
      required: true,
    },
    {
      name: "change",
      type: "object",
      description: "Изменения целевого представления (add / delete)",
    },
    {
      name: "replace",
      type: "object",
      description: "Замена компонентов (для type: view)",
    },
  ],
  mixinViewTo: [
    {
      name: "panel",
      type: "ref",
      description: "Целевая панель (для type: panel)",
    },
    {
      name: "tab",
      type: "ref",
      description: "Целевая вкладка (для type: tab)",
    },
    {
      name: "form",
      type: "ref",
      description: "Целевая форма (для type: form)",
    },
    {
      name: "list",
      type: "ref",
      description: "Целевой список (для type: list)",
    },
    {
      name: "page",
      type: "ref",
      description: "Целевая страница (для type: page)",
    },
  ],
  mixinChange: [
    {
      name: "add",
      type: "object",
      description: "Добавляемые компоненты",
    },
    {
      name: "delete",
      type: "object",
      description: "Удаляемые компоненты",
    },
  ],
  mixinChangeAdd: [
    {
      name: "components",
      type: "array",
      description: "Виджеты и блоки для добавления",
    },
    {
      name: "tabs",
      type: "object",
      description: "Вкладки для добавления (для type: panel)",
    },
    {
      name: "menu",
      type: "object",
      description: "Действия для добавления в меню",
    },
    {
      name: "form",
      type: "ref",
      description: "Форма для добавления (для type: form)",
    },
    {
      name: "list",
      type: "ref",
      description: "Список для добавления (для type: list)",
    },
    {
      name: "block",
      type: "ref",
      description: "Блок для добавления (для type: page)",
    },
    {
      name: "position",
      type: "object",
      description: "Расположение (begin | after | end)",
    },
  ],
  viewTableColumn: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор столбца (View ID)",
      required: true,
    },
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для отображения (Data ID Ref / FQID)",
    },
    {
      name: "label",
      type: "string",
      description: "Отображаемое название столбца",
    },
    {
      name: "layout",
      type: "object",
      description: "Размер и видимость столбца",
    },
    {
      name: "control",
      type: "object",
      description: "Тип редактора в столбце",
    },
    {
      name: "join",
      type: "ref",
      description: "Транзитивная связь для колонки",
    },
    {
      name: "use",
      type: "array",
      description: "Атрибуты атрибута-таблицы",
    },
    {
      name: "aggregate",
      type: "object",
      description: "Агрегация (count)",
    },
    {
      name: "actions",
      type: "array",
      description: "Действия при hover на ячейку",
    },
    {
      name: "counterColorPattern",
      type: "ref",
      description: "Цветовая схема счётчика",
    },
  ],
  viewTableColumnLayout: [
    {
      name: "visible",
      type: "boolean",
      description: "Видимость столбца (по умолчанию true)",
    },
    {
      name: "width",
      type: "object",
      description: "Настройки ширины",
    },
  ],
  viewTableColumnWidth: [
    {
      name: "default",
      type: "number",
      description: "Ширина по умолчанию (px)",
      required: true,
    },
    {
      name: "min",
      type: "number",
      description: "Минимальная ширина (px)",
      required: true,
    },
    {
      name: "max",
      type: "number",
      description: "Максимальная ширина (px)",
      required: true,
    },
  ],
  viewTableColumnControl: [
    {
      name: "type",
      type: "string",
      description:
        "text | text_area | select | radio | tag | level | bool_text | timestamp | tree_path и др.",
    },
    {
      name: "trueText",
      type: "string",
      description: "Отображаемый текст для True (для bool_text)",
    },
    {
      name: "falseText",
      type: "string",
      description: "Отображаемый текст для False (для bool_text)",
    },
    {
      name: "tree",
      type: "ref",
      description: "Дерево для отображения пути (для type: tree_path)",
    },
  ],
  viewTableAction: [
    {
      name: "type",
      type: "enum",
      description: "row_click | row_double_click | row_context_menu",
      required: true,
    },
    {
      name: "action",
      type: "ref",
      description: "Действие при клике (для row_click, row_double_click)",
    },
    {
      name: "items",
      type: "array",
      description: "Действия контекстного меню (для row_context_menu)",
    },
  ],
  viewTableActionItem: [
    {
      name: "action",
      type: "ref",
      description: "Действие (View ID)",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Отображаемое название",
    },
    {
      name: "icon",
      type: "ref",
      description: "Иконка (View ID медиа)",
    },
  ],
  viewSource: [
    {
      name: "type",
      type: "enum",
      description: "operational (БД системы)",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Сущность, чьи объекты отображаются в списке",
      required: true,
    },
    {
      name: "joins",
      type: "array",
      description: "Связи для отображения данных связанных сущностей",
    },
  ],
  viewSourceJoin: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор связи (Data ID)",
      required: true,
    },
    {
      name: "linkage",
      type: "ref",
      description: "Связь с другой сущностью",
      required: true,
    },
    {
      name: "side",
      type: "enum",
      description: "Сторона связи: 1 или 2",
    },
    {
      name: "description",
      type: "string",
      description: "Описание связи",
    },
  ],
  menuRoot: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор корневой группы",
      required: true,
    },
    {
      name: "route",
      type: "string",
      description: "Путь в URL (например, /assets)",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Заголовок раздела в меню",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "icon",
      type: "ref",
      description: "Ссылка на медиа-ресурс",
    },
    {
      name: "type",
      type: "enum",
      description: "root_group или root_menu",
      required: true,
    },
    {
      name: "placement",
      type: "enum",
      description: "top (главное меню) или settings (настройки)",
      required: true,
    },
    {
      name: "priority",
      type: "number",
      description: "Приоритет (≥1000, больше = выше)",
    },
    {
      name: "view",
      type: "ref",
      description: "Ссылка на представление (для root_menu)",
    },
    {
      name: "items",
      type: "array",
      description: "Дочерние элементы меню",
    },
    {
      name: "default",
      type: "string",
      description: "id пункта по умолчанию (для root_group)",
    },
  ],
  menuItem: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор пункта",
      required: true,
    },
    {
      name: "route",
      type: "string",
      description: "Путь в URL (после пути раздела)",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Заголовок пункта",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "type",
      type: "enum",
      description: "Устанавливается menu",
      required: true,
    },
    {
      name: "view",
      type: "ref",
      description: "Ссылка на представление (список или вкладки)",
      required: true,
    },
    {
      name: "priority",
      type: "number",
      description: "Приоритет (≥1000)",
    },
  ],
  media: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор иконки (View ID)",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "type",
      type: "enum",
      description: "icon_name",
      required: true,
    },
    {
      name: "iconName",
      type: "string",
      description: "Идентификатор в библиотеке иконок",
      required: true,
    },
    {
      name: "data",
      type: "string",
      description: "Base64-строка (для type: data)",
    },
  ],
  accessRuleItem: [
    {
      name: "kind",
      type: "enum",
      description: "permission | pass | condition",
      required: true,
    },
    {
      name: "permission",
      type: "string",
      description: "(kind: permission) Название разрешения",
    },
    {
      name: "condition",
      type: "rql",
      description: "(kind: condition) RQL-условие",
    },
    {
      name: "except",
      type: "array",
      description: "Исключения { attribute, condition? }",
    },
  ],
  accessRuleException: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для исключения",
      required: true,
    },
    {
      name: "condition",
      type: "rql",
      description: "RQL-условие применения исключения",
    },
  ],
  permission: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор разрешения",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название разрешения",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
  ],
  localization: [
    {
      name: "language",
      type: "string",
      description: "Код языка (ru, en, ...)",
      required: true,
    },
    {
      name: "keys",
      type: "array",
      description: "Массив { key, to, ordinal? }",
      required: true,
    },
  ],
  localizationKey: [
    {
      name: "key",
      type: "string",
      description: "Ключ локализации",
      required: true,
    },
    {
      name: "to",
      type: "string",
      description: "Перевод",
      required: true,
    },
    {
      name: "ordinal",
      type: "object",
      description: "Формы множественного числа (zero/one/two/few/many/other)",
    },
  ],
  exchangeSettings: [
    {
      name: "enable",
      type: "boolean",
      description: "Включить обмен данными для домена (по умолчанию: true)",
    },
    {
      name: "description",
      type: "string",
      description: "Описание требований к обмену",
    },
    {
      name: "label",
      type: "string",
      description: "Название домена в списке импорта/экспорта",
    },
    {
      name: "noCmsSync",
      type: "boolean",
      description: "Отключить sdk.cms.sync для создания/обновления",
    },
    {
      name: "attributeFormats",
      type: "object",
      description: "Форматы Date/Time/Timestamp/TimestampRange (Moment)",
    },
    {
      name: "entities",
      type: "object",
      description: "Настройки обмена по сущностям: { <EntityId>: { ... } }",
    },
  ],
  exchangeAttributeFormats: [
    {
      name: "Date",
      type: "string",
      description: "Формат Date (DD-MM-YYYY)",
    },
    {
      name: "Time",
      type: "string",
      description: "Формат Time (HH:mm:ss)",
    },
    {
      name: "Timestamp",
      type: "string",
      description: "Формат Timestamp (DD-MM-YYYYTHH:mm:ss)",
    },
    {
      name: "TimestampRange",
      type: "string",
      description: "Формат TimestampRange",
    },
  ],
  treeNodeType: [
    {
      name: "type",
      type: "enum",
      description: "root | branch | leaf",
      required: true,
    },
    {
      name: "of",
      type: "array",
      description: "(type: branch/leaf) Список сущностей-контейнеров",
    },
  ],
  entity: [
    {
      name: "id",
      type: "string",
      description: "Уникальный идентификатор сущности",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Человекочитаемое название",
    },
    {
      name: "label",
      type: "string",
      description: 'Шаблон отображаемого имени: "{attr1} {attr2}"',
    },
    {
      name: "description",
      type: "string",
      description: "Описание сущности",
    },
    {
      name: "inherits",
      type: "ref",
      description: "Ссылка на родительскую сущность (Data ID или FQID)",
    },
    {
      name: "attributes",
      type: "array",
      description: "Массив атрибутов сущности",
    },
    {
      name: "sorting",
      type: "array",
      description: "Правила сортировки",
    },
    {
      name: "searching",
      type: "object",
      description: "Набор атрибутов для поиска",
    },
    {
      name: "identification",
      type: "array",
      description: "Правила идентификации",
    },
    {
      name: "reconciliation",
      type: "array",
      description: "Правила реконсиляции",
    },
    {
      name: "projection",
      type: "array",
      description: "Проекции через Reference",
    },
    {
      name: "icons",
      type: "ref",
      description: "Иконка сущности для диаграммы",
    },
    {
      name: "graphView",
      type: "object",
      description: "Настройки отображения на графе",
    },
    {
      name: "scanTarget",
      type: "boolean",
      description: "Актив, предназначенный для сканирования",
    },
    {
      name: "scanTargetGroup",
      type: "boolean",
      description: "Группа активов для сканирования",
    },
    {
      name: "kind",
      type: "enum",
      description: "Вид сущности (по умолчанию regular)",
    },
  ],
  attribute: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор атрибута (camelCase)",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название атрибута",
    },
    {
      name: "description",
      type: "string",
      description: "Описание атрибута",
    },
    {
      name: "dataType",
      type: "enum",
      description: "Тип данных (String, Reference, Array и т.д.)",
      required: true,
    },
    {
      name: "readonly",
      type: "boolean",
      description: "Только для чтения",
    },
    {
      name: "constraints",
      type: "array",
      description:
        "Ограничения: required, length, range, regexp, size, mime_types, unique",
    },
    {
      name: "entity",
      type: "ref",
      description: "Целевая сущность (для dataType: Reference)",
    },
    {
      name: "item",
      type: "object",
      description: "Параметры элемента (для dataType: Array)",
    },
    {
      name: "sequence",
      type: "ref",
      description: "Ссылка на последовательность (для Identifier)",
    },
    {
      name: "template",
      type: "string",
      description: 'Шаблон идентификатора: "{@prefix}-{@YYYY}-{@inc}"',
    },
    {
      name: "defaultPrefix",
      type: "string",
      description: "Префикс по умолчанию (для Identifier)",
    },
    {
      name: "incrementTemplate",
      type: "string",
      description: "Количество цифр для ведущих нулей",
    },
    {
      name: "segment",
      type: "array",
      description: "Сегменты переопределения шаблона",
    },
    {
      name: "prefixRules",
      type: "array",
      description: "Правила подстановки префикса",
    },
    {
      name: "calculation",
      type: "object",
      description: "Ссылка на расчёт (для dataType: Calculation)",
    },
    {
      name: "comments",
      type: "boolean",
      description: "Разрешить комментарии (для dataType: Text)",
    },
  ],
  linkage: [
    {
      name: "id",
      type: "string",
      description: "Уникальный идентификатор связи",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название связи",
    },
    {
      name: "description",
      type: "string",
      description: "Описание связи",
    },
    {
      name: "side1",
      type: "ref",
      description: "Левая сторона связи (Data ID или FQID)",
      required: true,
    },
    {
      name: "side2",
      type: "ref",
      description: "Правая сторона связи",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "Тип связи: 1_1, 1_n, n_n",
      required: true,
    },
    {
      name: "undirected",
      type: "boolean",
      description: "Ненаправленная связь (только для n_n)",
    },
    {
      name: "nameFrom",
      type: "object",
      description: "Глагольные формы сторон (side1/side2)",
    },
    {
      name: "useForSearch",
      type: "boolean",
      description: "Использовать в поисковых запросах",
    },
    {
      name: "attributes",
      type: "array",
      description: "Пользовательские атрибуты связи",
    },
    {
      name: "sorting",
      type: "array",
      description: "Сортировка связей",
    },
    {
      name: "view",
      type: "object",
      description: "Цвет отображения на графе",
    },
    {
      name: "excludeOnGraph",
      type: "enum",
      description: "Скрытие на графе: true/false/off",
    },
  ],
  nameFrom: [
    {
      name: "side1",
      type: "string",
      description: "Глагольная форма для стороны 1 (например, «блокирует»)",
      required: true,
    },
    {
      name: "side2",
      type: "string",
      description: "Глагольная форма для стороны 2 (например, «блокируется»)",
      required: true,
    },
  ],
  linkageAttribute: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор атрибута связи",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название атрибута",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "dataType",
      type: "enum",
      description: "Тип данных",
      required: true,
    },
    {
      name: "constraints",
      type: "array",
      description: "Валидация атрибута",
    },
    {
      name: "searchable",
      type: "boolean",
      description: "Доступен для поиска (по умолчанию true)",
    },
  ],
  action: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор действия (View ID)",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название действия",
    },
    {
      name: "description",
      type: "string",
      description: "Описание действия",
    },
    {
      name: "type",
      type: "enum",
      description:
        "Тип: open_panel, open_modal, open_page, remove, bulk, automation и др.",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Сущность, к которой применяется действие",
    },
    {
      name: "panel",
      type: "ref",
      description: "Панель (для open_panel)",
    },
    {
      name: "modal",
      type: "ref",
      description: "Модалка (для open_modal)",
    },
    {
      name: "view",
      type: "ref",
      description: "View (для open_page, open_list, open_tree)",
    },
    {
      name: "operation",
      type: "enum",
      description: "Операция: create, edit, view, remove",
    },
    {
      name: "page",
      type: "enum",
      description:
        "blank — открыть в новом окне, current — в текущем (только для open_list / open_tree / open_view)",
    },
    {
      name: "automation",
      type: "object",
      description: "Ссылка на автоматизацию",
    },
    {
      name: "scenario",
      type: "string",
      description: "Сценарий/скрипт",
    },
    {
      name: "workerTag",
      type: "string",
      description: "Тег воркера сценария",
    },
    {
      name: "attribute",
      type: "ref",
      description: "(type: workflow) Атрибут типа Workflow",
    },
    {
      name: "transition",
      type: "object",
      description:
        "(type: workflow) Переход в новый статус: { to: <statusId> }",
    },
    {
      name: "params",
      type: "object",
      description:
        "(type: open_external_widget_modal) Параметры внешнего виджета: { widget: <string> }",
    },
    {
      name: "hooks",
      type: "object",
      description: "Хуки жизненного цикла (только для type: scenario)",
    },
  ],
  dataRule: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название правила",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "target",
      type: "enum",
      description: "entity, entityAttribute или linkage",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Целевая сущность (для entity/entityAttribute)",
    },
    {
      name: "attribute",
      type: "ref",
      description: "Целевой атрибут (для entityAttribute)",
    },
    {
      name: "linkage",
      type: "ref",
      description: "Целевая связь (для linkage)",
    },
    {
      name: "condition",
      type: "rql",
      description:
        "Условие правила. RQL-выражение с тегом !rql (например: !rql @doc.status = 'NEW') или литерал true/false. Многострочное — через !rql |",
      required: true,
    },
    {
      name: "rule",
      type: "object",
      description: "Описание действия правила",
      required: true,
    },
    {
      name: "message",
      type: "string",
      description: "Сообщение об ошибке",
    },
    {
      name: "help",
      type: "string",
      description: "Справка при наведении",
    },
  ],
  dataRuleRule: [
    {
      name: "effect",
      type: "enum",
      description: "hidden, readonly, required, default, allowed",
      required: true,
    },
    {
      name: "attributes",
      type: "array",
      description: "Атрибуты, к которым применяется эффект",
    },
    {
      name: "nested",
      type: "object",
      description: "Nested-эффект для Table/Array",
    },
    {
      name: "linkages",
      type: "array",
      description: "Связи, к которым применяется эффект",
    },
  ],
  view: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор view (View ID)",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Заголовок",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "type",
      type: "enum",
      description: "entity, list, tabs_list, tree, dashboard, dashboard_tree",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Целевая сущность (для entity)",
    },
    {
      name: "widgets",
      type: "array",
      description: "Виджеты представления",
    },
    {
      name: "groups",
      type: "array",
      description: "Группы (блоки, вкладки, формы)",
    },
    {
      name: "views",
      type: "array",
      description: "Внутренние представления (для entity)",
    },
    {
      name: "source",
      type: "object",
      description: "Источник данных (для list)",
    },
    {
      name: "table",
      type: "object",
      description: "Табличное отображение (для list)",
    },
    {
      name: "actionPanel",
      type: "array",
      description: "Панель действий (для list)",
    },
    {
      name: "isMixin",
      type: "boolean",
      description: "Использовать в примеси",
    },
  ],
  viewNested: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор карточки",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "panel | modal | page",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "label",
      type: "string",
      description: "Заголовок карточки",
    },
    {
      name: "inherit",
      type: "ref",
      description: "Наследование от другой карточки",
    },
    {
      name: "menu",
      type: "array",
      description: "Действия в меню (для panel)",
    },
    {
      name: "tabs",
      type: "array",
      description: "Вкладки (для panel/page)",
    },
    {
      name: "footer",
      type: "array",
      description: "Нижняя секция (modal)",
    },
    {
      name: "onView",
      type: "array",
      description: "Действия при открытии",
    },
    {
      name: "form",
      type: "ref",
      description: "Ссылка на группу form (для modal)",
    },
    {
      name: "buttons",
      type: "array",
      description: "Кнопки submit/close (для modal)",
    },
    {
      name: "menuItem",
      type: "ref",
      description: "Ссылка на пункт меню (для page)",
    },
    {
      name: "actionPanel",
      type: "array",
      description: "Панель действий (для page)",
    },
    {
      name: "block",
      type: "ref",
      description: "Единый блок (для page)",
    },
    {
      name: "pinnedView",
      type: "object",
      description: "Закреплённый блок (для page)",
    },
  ],
  widget: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор виджета (View ID)",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "attribute, action, linkage, join, history и др.",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "attribute",
      type: "ref",
      description: "Ссылка на атрибут (для type: attribute)",
    },
    {
      name: "control",
      type: "object",
      description: "Элемент управления",
    },
    {
      name: "action",
      type: "ref",
      description: "Действие (для type: action)",
    },
    {
      name: "actions",
      type: "array",
      description: "Массив действий (для type: action)",
    },
    {
      name: "linkage",
      type: "ref",
      description: "Связь (для type: linkage)",
    },
    {
      name: "side",
      type: "enum",
      description: "Сторона связи: 1 или 2",
    },
    {
      name: "label",
      type: "string",
      description: "Заголовок виджета",
    },
  ],
  group: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор группы",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "block, form, tab, tabs, resizable_block_pair",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "label",
      type: "string",
      description: "Заголовок группы",
    },
    {
      name: "layout",
      type: "object",
      description: "Расположение компонентов",
    },
    {
      name: "components",
      type: "array",
      description: "Компоненты группы",
    },
    {
      name: "inherits",
      type: "ref",
      description: "Наследование от другой группы",
    },
  ],
  sequence: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор последовательности",
      required: true,
    },
    {
      name: "startFrom",
      type: "number",
      description: "Начальное значение (по умолчанию 1)",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
  ],
  searchingItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут сущности для поиска",
      required: true,
    },
  ],
  sourceObject: [
    {
      name: "type",
      type: "enum",
      description: "operational (база данных системы)",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Сущность, чьи объекты отображаются",
      required: true,
    },
    {
      name: "joins",
      type: "array",
      description: "Связи для отображения данных",
    },
  ],
  tree: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор дерева (Data ID)",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "ordinary | orderable | multiparent",
    },
    {
      name: "maxDepth",
      type: "number",
      description: "Максимальная вложенность от корня",
    },
    {
      name: "hierarchy",
      type: "object",
      description: "Иерархия сущностей в дереве",
      required: true,
    },
    {
      name: "sorting",
      type: "array",
      description: "Правила сортировки по уровням",
    },
  ],
  treeHierarchy: [
    {
      name: "entity",
      type: "ref",
      description: "Корневая сущность дерева",
      required: true,
    },
    {
      name: "maxInstances",
      type: "number",
      description: "Максимум объектов в корне",
    },
    {
      name: "maxChildren",
      type: "number",
      description: "Максимум дочерних через связь",
    },
    {
      name: "children",
      type: "array",
      description: "Дочерние узлы",
    },
  ],
  transitiveLinkage: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор дерева транзитивных связей",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Сущность, для которой строится дерево",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "joins",
      type: "array",
      description: "Список связей в цепочке",
      required: true,
    },
  ],
  transitiveJoin: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор присоединения",
      required: true,
    },
    {
      name: "linkage",
      type: "ref",
      description: "Связь с сущностью",
      required: true,
    },
    {
      name: "search",
      type: "object",
      description: "Настройки поиска по узлу",
    },
    {
      name: "joins",
      type: "array",
      description: "Следующие связи в цепочке",
    },
  ],
  transitiveJoinSearch: [
    {
      name: "enable",
      type: "boolean",
      description: "Включить поиск по узлу",
      required: true,
    },
    {
      name: "mode",
      type: "enum",
      description: "entity | linkage | both (по умолчанию both)",
    },
  ],
  uiRule: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила (Data ID)",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название правила",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "target",
      type: "enum",
      description: "list_view | entity_view | entity_attribute",
      required: true,
    },
    {
      name: "view",
      type: "ref",
      description:
        "Представление, в котором применяются правила (list / entity)",
      required: true,
    },
    {
      name: "context",
      type: "object",
      description: "Контекст применения (views[])",
    },
    {
      name: "condition",
      type: "rql",
      description: "Условие срабатывания (RQL)",
    },
    {
      name: "rule",
      type: "object",
      description: "Описание эффекта правила",
      required: true,
    },
    {
      name: "message",
      type: "string",
      description: "Сообщение пользователю",
    },
    {
      name: "help",
      type: "string",
      description: "Текст справки",
    },
  ],
  uiRuleContext: [
    {
      name: "views",
      type: "array",
      description:
        "Список view-id, в которых применяется (необязательно, для entity_view)",
    },
  ],
  uiRuleRule: [
    {
      name: "effect",
      type: "enum",
      description:
        "hidden | show | hiddenEmpty | readonly | editable | inherit | variant",
      required: true,
    },
    {
      name: "widgets",
      type: "array",
      description: "Виджеты, к которым применяется эффект",
    },
    {
      name: "groups",
      type: "array",
      description: "Группы, к которым применяется эффект",
    },
    {
      name: "columns",
      type: "array",
      description: "Колонки списка (для list_view)",
    },
    {
      name: "presets",
      type: "array",
      description: "Пресеты стилей (для effect: variant)",
    },
  ],
  uiPreset: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор пресета (Data ID)",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "props",
      type: "object",
      description: "Свойства стиля (color, font-weight, background, ...)",
    },
  ],
  actionBulk: [
    {
      name: "operation",
      type: "enum",
      description: "remove | edit | edit_attribute",
      required: true,
    },
    {
      name: "attributes",
      type: "array",
      description: "Атрибуты для массового редактирования (operation: edit)",
    },
    {
      name: "linkages",
      type: "array",
      description: "Связи для массового редактирования (operation: edit)",
    },
    {
      name: "values",
      type: "array",
      description: "Значения атрибутов (operation: edit_attribute)",
    },
    {
      name: "control",
      type: "object",
      description:
        "Настройки bool-поля (operation: edit_attribute + bool-атрибут)",
    },
  ],
  actionBulkAttributes: [
    {
      name: "type",
      type: "enum",
      description: "Всегда specific",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Массив ссылок на атрибуты (attribute: <id>)",
    },
  ],
  actionBulkLinkages: [
    {
      name: "type",
      type: "enum",
      description: "Всегда specific",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Массив ссылок на виджеты связей (widget: <id>)",
    },
  ],
  actionAutomation: [
    {
      name: "id",
      type: "string",
      description: "UUID автоматизации (3c521909-cc55-4b0c-b645-f79eb0263296)",
      required: true,
    },
  ],
  viewTable: [
    {
      name: "columns",
      type: "array",
      description: "Столбцы таблицы",
      required: true,
    },
    {
      name: "filter",
      type: "object",
      description: "Настройки фильтрации",
    },
    {
      name: "sortingBy",
      type: "object",
      description: "Правила сортировки",
    },
    {
      name: "paging",
      type: "object",
      description: "Пагинация",
    },
    {
      name: "refresh",
      type: "object",
      description: "Обновление данных",
    },
    {
      name: "selection",
      type: "boolean",
      description: "Возможность выбора строк",
    },
    {
      name: "actions",
      type: "array",
      description: "Действия при клике на строку",
    },
    {
      name: "empty",
      type: "object",
      description: "Текст при пустой таблице",
    },
  ],
  viewTableColumnAggregate: [
    {
      name: "type",
      type: "enum",
      description: "count",
      required: true,
    },
    {
      name: "condition",
      type: "rql",
      description: "RQL-условие фильтрации",
    },
  ],
  viewTableFilter: [
    {
      name: "attributes",
      type: "object",
      description: "Фильтрация по атрибутам",
    },
    {
      name: "linkages",
      type: "object",
      description: "Фильтрация по связям",
    },
  ],
  viewTableFilterAttributes: [
    {
      name: "type",
      type: "enum",
      description: "specific | all",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Массив атрибутов для фильтрации (при type: specific)",
    },
  ],
  viewTableFilterAttributesUse: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для фильтрации",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Атрибуты вложенной таблицы",
    },
  ],
  viewTableFilterLinkages: [
    {
      name: "type",
      type: "enum",
      description: "specific | all",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Массив связей для фильтрации (при type: specific)",
    },
  ],
  viewTableFilterLinkagesUse: [
    {
      name: "linkage",
      type: "ref",
      description: "Связь для фильтрации",
    },
    {
      name: "join",
      type: "ref",
      description: "Транзитивная связь",
    },
    {
      name: "link_attributes",
      type: "array",
      description: "Атрибуты связи",
    },
    {
      name: "linkedEntity",
      type: "array",
      description: "Атрибуты связанной сущности",
    },
  ],
  viewTableSortingBy: [
    {
      name: "columns",
      type: "array",
      description: "Столбцы для сортировки",
      required: true,
    },
    {
      name: "defaults",
      type: "object",
      description: "Сортировка по умолчанию",
    },
  ],
  viewTableSortingByColumn: [
    {
      name: "column",
      type: "ref",
      description: "Столбец (View ID)",
      required: true,
    },
    {
      name: "sorting",
      type: "ref",
      description: "Правило сортировки (Data ID)",
      required: true,
    },
  ],
  viewTableSortingByDefault: [
    {
      name: "column",
      type: "ref",
      description: "Столбец по умолчанию",
      required: true,
    },
    {
      name: "direction",
      type: "enum",
      description: "asc | desc",
      required: true,
    },
  ],
  viewTablePaging: [
    {
      name: "sizes",
      type: "array",
      description: "Варианты количества записей (например, [10, 50, 100])",
      required: true,
    },
    {
      name: "defaultSize",
      type: "number",
      description: "Количество записей по умолчанию",
      required: true,
    },
  ],
  viewTableRefresh: [
    {
      name: "mode",
      type: "enum",
      description: "manual | auto | all",
      required: true,
    },
    {
      name: "defaults",
      type: "object",
      description: "Настройки автообновления",
    },
  ],
  viewTableRefreshDefaults: [
    {
      name: "enabled",
      type: "boolean",
      description: "Автообновление включено",
      required: true,
    },
    {
      name: "unit",
      type: "enum",
      description: "second | minute | hour",
      required: true,
    },
    {
      name: "interval",
      type: "number",
      description: "Интервал в единицах unit",
      required: true,
    },
  ],
  viewTableEmpty: [
    {
      name: "message",
      type: "string",
      description: "Текст при отсутствии данных",
      required: true,
    },
  ],
  viewWidgetControl: [
    {
      name: "type",
      type: "string",
      description:
        "Тип редактора: text, text_area, select, radio, tag, level, switch, checkbox, bool_text, timestamp, date, time, tree_path, drag_drop_area, file, slider, link и др.",
    },
    {
      name: "text",
      type: "string",
      description: "Текст области перетаскивания (для drag_drop_area)",
    },
    {
      name: "trueText",
      type: "string",
      description: "Отображаемый текст для True (для bool_text)",
    },
    {
      name: "falseText",
      type: "string",
      description: "Отображаемый текст для False (для bool_text)",
    },
    {
      name: "step",
      type: "number",
      description: "Шаг ползунка (для slider)",
    },
    {
      name: "icon",
      type: "ref",
      description: "Иконка (для action-виджета, regular_button)",
    },
  ],
  viewWidgetLinkageControl: [
    {
      name: "type",
      type: "enum",
      description: "select | multi_select | table",
      required: true,
    },
    {
      name: "addLinksView",
      type: "ref",
      description: "Список для выбора связанных объектов",
    },
    {
      name: "displayMode",
      type: "enum",
      description: "flat | grouped (для транзитивных связей)",
    },
    {
      name: "columns",
      type: "array",
      description: "Столбцы (для type: table)",
    },
    {
      name: "sortingBy",
      type: "array",
      description: "Правила сортировки",
    },
    {
      name: "paging",
      type: "object",
      description: "Пагинация",
    },
  ],
  viewWidgetLinkageColumn: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор столбца",
      required: true,
    },
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут связанного объекта или связи",
    },
    {
      name: "join",
      type: "ref",
      description: "Транзитивная связь для колонки (нельзя вместе с linkage)",
    },
    {
      name: "linkage",
      type: "ref",
      description: "Связь для колонки (нельзя вместе с join)",
    },
  ],
  viewWidgetLinkageAttributes: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут связи",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Название атрибута в UI",
    },
    {
      name: "control",
      type: "object",
      description: "Элемент управления",
    },
  ],
  viewWidgetLinkageAttributeControl: [
    {
      name: "type",
      type: "string",
      description: "Тип редактора",
    },
    {
      name: "view",
      type: "ref",
      description: "Представление выбора (для Reference)",
    },
    {
      name: "editable",
      type: "boolean",
      description: "Разрешить редактирование (по умолчанию true)",
    },
  ],
  viewWidgetConversation: [
    {
      name: "linkage",
      type: "ref",
      description: "Связь с сущностью Message из domain.comm.rvision.ru",
      required: true,
    },
    {
      name: "conversationTransports",
      type: "array",
      description: "Ограничение доступных транспортов",
    },
  ],
  viewGroupLayout: [
    {
      name: "direction",
      type: "enum",
      description: "column (вертикально) — единственное доступное значение",
    },
    {
      name: "expandable",
      type: "boolean",
      description: "Возможность сворачивания (для block)",
    },
    {
      name: "minHeight",
      type: "string",
      description: "Мин. высота секции (для resizable_block_pair)",
    },
    {
      name: "maxHeight",
      type: "string",
      description: "Макс. высота секции (для resizable_block_pair)",
    },
    {
      name: "sizeRatio",
      type: "object",
      description: "Соотношение ширины секций (для resizable_block_pair)",
    },
  ],
  viewGroupComponent: [
    {
      name: "inherit",
      type: "object",
      description: "Настройки наследования",
    },
    {
      name: "widget",
      type: "ref",
      description: "Ссылка на виджет",
    },
    {
      name: "block",
      type: "ref",
      description: "Ссылка на вложенный блок",
    },
  ],
  viewButton: [
    {
      name: "type",
      type: "enum",
      description: "submit | close",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Название кнопки",
    },
    {
      name: "control",
      type: "object",
      description: "Элемент управления",
    },
    {
      name: "actions",
      type: "array",
      description: "Действия при сохранении (для type: submit)",
    },
    {
      name: "hidden",
      type: "boolean",
      description: "Скрыть (для type: submit)",
    },
  ],
  viewButtonControl: [
    {
      name: "type",
      type: "enum",
      description: "regular_button",
      required: true,
    },
    {
      name: "icon",
      type: "ref",
      description: "Иконка кнопки",
    },
  ],
  viewButtonAction: [
    {
      name: "action",
      type: "ref",
      description: "Действие (обычно set_attribute_value)",
      required: true,
    },
  ],
  viewMenuAction: [
    {
      name: "action",
      type: "ref",
      description: "Ссылка на действие",
      required: true,
    },
    {
      name: "inherit",
      type: "object",
      description: "Настройки наследования меню",
    },
  ],
  viewFooterAction: [
    {
      name: "action",
      type: "ref",
      description: "Действие (automation / scenario)",
      required: true,
    },
    {
      name: "behavior",
      type: "enum",
      description: "run | run_close | run_submit",
      required: true,
    },
    {
      name: "control",
      type: "object",
      description: "Элемент управления",
    },
  ],
  viewActionPanelItem: [
    {
      name: "widget",
      type: "ref",
      description: "Виджет действия",
      required: true,
    },
    {
      name: "inherit",
      type: "object",
      description: "Настройки наследования",
    },
  ],
  viewTab: [
    {
      name: "tab",
      type: "ref",
      description: "Вкладка (группа type: tab)",
      required: true,
    },
    {
      name: "inherit",
      type: "object",
      description: "Настройки наследования",
    },
  ],
  viewPinnedView: [
    {
      name: "block",
      type: "ref",
      description: "Закреплённый блок",
      required: true,
    },
    {
      name: "position",
      type: "enum",
      description: "top | bottom",
    },
    {
      name: "minHeight",
      type: "string",
      description: "Мин. высота (%, px)",
    },
    {
      name: "maxHeight",
      type: "string",
      description: "Макс. высота (%, px)",
    },
    {
      name: "height",
      type: "string",
      description: "Высота (по умолчанию 30%)",
    },
  ],
  inheritSettings: [
    {
      name: "type",
      type: "enum",
      description: "append | override | except",
      required: true,
    },
    {
      name: "except",
      type: "array",
      description: "Список id для исключения (при type: except)",
    },
  ],
  mixin: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор примеси",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Наименование примеси",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "weight",
      type: "number",
      description: "Приоритет (меньше = выше)",
    },
    {
      name: "useForChild",
      type: "boolean",
      description: "Наследовать дочерним сущностям (по умолчанию true)",
    },
    {
      name: "type",
      type: "enum",
      description: "linkage или view",
      required: true,
    },
    {
      name: "entity",
      type: "object",
      description: "Направление примеси (from → to)",
      required: true,
    },
    {
      name: "linkage",
      type: "ref",
      description: "Связь (для type: linkage)",
    },
    {
      name: "views",
      type: "array",
      description: "Подмешиваемые представления",
      required: true,
    },
  ],
  mixinEntity: [
    {
      name: "from",
      type: "ref",
      description: "Источник примеси",
    },
    {
      name: "to",
      type: "ref",
      description: "Целевая сущность",
    },
  ],
  mixinPosition: [
    {
      name: "type",
      type: "enum",
      description: "begin | after | end",
    },
    {
      name: "after",
      type: "object",
      description: "Компонент, после которого вставлять",
    },
  ],
  exchangeEntity: [
    {
      name: "domainLabel",
      type: "string",
      description: "Переопределение названия домена для сущности",
    },
    {
      name: "enable",
      type: "boolean",
      description: "Включить обмен для этой сущности",
    },
    {
      name: "label",
      type: "string",
      description: "Название сущности в списке",
    },
    {
      name: "forExport",
      type: "ref",
      description: "Атрибут-идентификатор для Reference",
    },
    {
      name: "upsertWith",
      type: "string",
      description:
        "Атрибуты/связи для идентификации при обновлении (через запятую)",
    },
    {
      name: "ignoreAttributes",
      type: "string",
      description: "Игнорируемые атрибуты (id через запятую)",
    },
    {
      name: "exportSystemAttributes",
      type: "string",
      description: "Системные атрибуты для экспорта (id через запятую) или all",
    },
    {
      name: "noCmsSync",
      type: "boolean",
      description: "Отключить sdk.cms.sync для этой сущности",
    },
  ],
  exchangeEntitySettings: [
    {
      name: "domainLabel",
      type: "string",
      description: "Переопределение названия домена",
    },
    {
      name: "enable",
      type: "boolean",
      description: "Включить обмен для сущности",
    },
    {
      name: "label",
      type: "string",
      description: "Название сущности в списке",
    },
    {
      name: "forExport",
      type: "ref",
      description: "Атрибут-идентификатор для Reference",
    },
    {
      name: "upsertWith",
      type: "string",
      description: "Атрибуты/связи для идентификации при обновлении",
    },
    {
      name: "ignoreAttributes",
      type: "string",
      description: "Игнорируемые атрибуты (через запятую)",
    },
    {
      name: "exportSystemAttributes",
      type: "string",
      description: "Системные атрибуты для экспорта (или all)",
    },
    {
      name: "noCmsSync",
      type: "boolean",
      description: "Отключить sdk.cms.sync для сущности",
    },
  ],
  attributeConstraint: [
    {
      name: "kind",
      type: "enum",
      description:
        "Вид валидации: required | range | length | regexp | size | mime_types | unique",
      required: true,
    },
    {
      name: "message",
      type: "string",
      description: "Сообщение об ошибке при срабатывании",
    },
    {
      name: "min",
      type: "number",
      description: "Минимум: для range — значение, для length — символов",
    },
    {
      name: "max",
      type: "number",
      description: "Максимум: для range — значение, для length/size — лимит",
    },
    {
      name: "regexp",
      type: "string",
      description: "Регулярное выражение (только для kind: regexp)",
    },
    {
      name: "mimeTypes",
      type: "array",
      description: "Список MIME-типов (только для kind: mime_types)",
    },
  ],
  arrayItem: [
    {
      name: "dataType",
      type: "enum",
      description: "Тип элемента массива (String, Reference, Enum, …)",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Целевая сущность (только для dataType: Reference)",
    },
    {
      name: "item",
      type: "object",
      description: "Параметры вложенного массива (для Array)",
    },
    {
      name: "constraints",
      type: "array",
      description: "Ограничения элемента массива",
    },
    {
      name: "calculation",
      type: "object",
      description: "Ссылка на расчёт (для Calculation)",
    },
  ],
  calculation: [
    {
      name: "schemaId",
      type: "string",
      description: "Идентификатор схемы, где определён расчёт",
      required: true,
    },
    {
      name: "id",
      type: "string",
      description: "Идентификатор расчёта",
      required: true,
    },
  ],
  prefixRule: [
    {
      name: "id",
      type: "string",
      description: "Уникальный идентификатор правила",
      required: true,
    },
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут текущей сущности для сравнения",
      required: true,
    },
    {
      name: "source",
      type: "object",
      description: "Источник справочника для подстановки префикса",
      required: true,
    },
  ],
  prefixRuleSource: [
    {
      name: "entity",
      type: "ref",
      description: "Сущность-справочник",
      required: true,
    },
    {
      name: "key",
      type: "ref",
      description: "Атрибут справочника для сравнения",
      required: true,
    },
    {
      name: "value",
      type: "ref",
      description:
        "Атрибут справочника, значение которого станет префиксом (String)",
      required: true,
    },
  ],
  searchingAttributesItem: [],
  projectionItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут сущности для проекции",
      required: true,
    },
  ],
  identificationRuleItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для идентификации",
    },
    {
      name: "and",
      type: "array",
      description: "Вложенные условия через логическое И",
    },
    {
      name: "or",
      type: "array",
      description: "Вложенные условия через логическое ИЛИ",
    },
  ],
  reconciliationDefaultItem: [
    {
      name: "source",
      type: "string",
      description: 'Название источника (или "*" для остальных)',
      required: true,
    },
  ],
  graphView: [
    {
      name: "iconColor",
      type: "enum",
      description: "Цвет иконки на графе (red / blue / green / …)",
    },
  ],
  accessRule: [
    {
      name: "target",
      type: "enum",
      description:
        "entity | action | linkage | any_entity | any_action | any_linkage",
      required: true,
    },
    {
      name: "id",
      type: "string",
      description: "(target: action) Идентификатор действия",
    },
    {
      name: "entity",
      type: "ref",
      description: "(target: entity) Сущность",
    },
    {
      name: "linkage",
      type: "ref",
      description: "(target: linkage) Связь",
    },
    {
      name: "create",
      type: "array",
      description: "Правила доступа для создания",
    },
    {
      name: "delete",
      type: "array",
      description: "Правила доступа для удаления",
    },
    {
      name: "edit",
      type: "array",
      description: "Правила доступа для редактирования",
    },
    {
      name: "view",
      type: "array",
      description: "Правила доступа для просмотра",
    },
    {
      name: "launch",
      type: "array",
      description: "(target: action) Правила доступа для запуска",
    },
  ],
  actionOpenBoardsFromGraph: [
    {
      name: "openBoards",
      type: "boolean",
      description: "Открыть диаграмму в режиме доски",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "(при openBoards: true) Название кнопки",
    },
  ],
  treeNodeOf: [
    {
      name: "treeNode",
      type: "ref",
      description: "Сущность-узел дерева вложения",
      required: true,
    },
  ],
  viewDashboardLayout: [
    {
      name: "type",
      type: "enum",
      description: "grid",
    },
    {
      name: "columns",
      type: "number",
      description: "Количество столбцов в сетке (при type: grid)",
    },
  ],
  viewWidgetDragDropContext: [
    {
      name: "dataType",
      type: "enum",
      description: "Array | Attachment | Table",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Имя атрибута сущности для прикрепления файла",
    },
  ],
  dataTypeList: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор типа данных",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название типа данных",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "dataType",
      type: "enum",
      description: "Enum | Table | Workflow",
      required: true,
    },
    {
      name: "values",
      type: "array",
      description: "Значения (для Enum)",
    },
    {
      name: "view",
      type: "array",
      description: "Цвета значений/статусов/колонок",
    },
    {
      name: "statuses",
      type: "array",
      description: "Статусы (для Workflow)",
    },
    {
      name: "initial",
      type: "string",
      description: "Начальный статус (для Workflow)",
    },
    {
      name: "transitions",
      type: "array",
      description: "Переходы (для Workflow)",
    },
    {
      name: "finals",
      type: "array",
      description: "Конечные статусы (для Workflow)",
    },
    {
      name: "attributes",
      type: "array",
      description: "Колонки (для Table)",
    },
    {
      name: "maxRows",
      type: "number",
      description: "Максимум строк (для Table)",
    },
    {
      name: "sorting",
      type: "array",
      description: "Сортировка (для Table)",
    },
  ],
  dataType: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор типа данных",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название типа данных",
    },
    {
      name: "description",
      type: "string",
      description: "Описание",
    },
    {
      name: "dataType",
      type: "enum",
      description:
        "Enum — перечисление | Table — таблица | Workflow — рабочий процесс",
      required: true,
    },
    {
      name: "values",
      type: "array",
      description: "Значения (для Enum)",
    },
    {
      name: "view",
      type: "array",
      description: "Цвета значений / статусов",
    },
    {
      name: "statuses",
      type: "array",
      description: "Статусы (для Workflow)",
    },
    {
      name: "initial",
      type: "string",
      description: "Начальный статус (для Workflow)",
    },
    {
      name: "finals",
      type: "array",
      description: "Конечные статусы (для Workflow)",
    },
    {
      name: "transitions",
      type: "array",
      description: "Переходы между статусами (для Workflow)",
    },
    {
      name: "attributes",
      type: "array",
      description: "Колонки таблицы (для Table)",
    },
    {
      name: "maxRows",
      type: "number",
      description: "Максимум строк (для Table)",
    },
    {
      name: "sorting",
      type: "array",
      description: "Сортировка колонок (для Table)",
    },
  ],
  counterColorPattern: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила",
      required: true,
    },
    {
      name: "red",
      type: "string",
      description: "Порог красного (1w2d3h4m или 60%)",
      required: true,
    },
    {
      name: "yellow",
      type: "string",
      description: "Порог жёлтого (должен быть < red)",
      required: true,
    },
  ],
  viewWidgetLinkageAttribute: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут связи",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Отображаемое название",
    },
    {
      name: "control",
      type: "object",
      description: "Элемент управления",
    },
  ],
  viewWidgetActionControl: [
    {
      name: "type",
      type: "enum",
      description: "regular_button | dropdown | drag_drop_area",
      required: true,
    },
    {
      name: "icon",
      type: "ref",
      description: "Иконка (для regular_button)",
    },
    {
      name: "text",
      type: "string",
      description: "Текст (для drag_drop_area)",
    },
    {
      name: "context",
      type: "object",
      description: "Контекст drag_drop_area",
    },
  ],
  viewTableSortingColumn: [
    {
      name: "column",
      type: "ref",
      description: "Столбец",
      required: true,
    },
    {
      name: "sorting",
      type: "ref",
      description: "Правило сортировки",
      required: true,
    },
  ],
  actionTransition: [
    {
      name: "to",
      type: "string",
      description: "Целевой статус workflow",
      required: true,
    },
  ],
  bindAlias: [
    {
      name: "external",
      type: "string",
      description: "Внешнее имя алиаса",
      required: true,
    },
    {
      name: "internal",
      type: "string",
      description: "Внутреннее имя алиаса",
      required: true,
    },
  ],
  externals: [
    {
      name: "entity",
      type: "ref",
      description: "Внешняя сущность",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "composition | selection",
    },
  ],
  override: [
    {
      name: "ancestors",
      type: "array",
      description: "FQID предков, к которым применяется override",
    },
    {
      name: "attributes",
      type: "array",
      description: "Переопределяемые атрибуты",
    },
  ],
  overrideAttribute: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут",
      required: true,
    },
    {
      name: "value",
      type: "string",
      description: "Значение",
    },
  ],
  mixinTabRef: [
    {
      name: "tab",
      type: "ref",
      description: "Вкладка",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Отображаемое название",
    },
  ],
  mixinActionRef: [
    {
      name: "action",
      type: "ref",
      description: "Действие",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Отображаемое название",
    },
  ],
  // ============ views: RQL include/exclude ============
  viewWidgetInclude: [
    {
      name: "domain",
      type: "string",
      description: "FQID домена",
      required: true,
    },
    {
      name: "entities",
      type: "array",
      description: "Сущности, доступные в редакторе RQL",
    },
  ],
  viewWidgetIncludeEntity: [
    {
      name: "entity",
      type: "ref",
      description: "Идентификатор сущности домена",
      required: true,
    },
    {
      name: "attributes",
      type: "array",
      description: "Атрибуты сущности (по умолчанию все)",
    },
    {
      name: "linkages",
      type: "array",
      description: "Связи сущности (по умолчанию все)",
    },
  ],
  viewWidgetIncludeLinkage: [
    {
      name: "side",
      type: "enum",
      description: "Сторона связи (по умолчанию 1)",
    },
    {
      name: "linkage",
      type: "ref",
      description: "Идентификатор связи",
      required: true,
    },
    {
      name: "EntityAttributes",
      type: "array",
      description: "Атрибуты связанной сущности",
    },
  ],

  // ============ views: columns[].actions[] ============
  viewTableColumnActions: [
    {
      name: "action",
      type: "ref",
      description: "Действие при клике на ячейку",
      required: true,
    },
    { name: "label", type: "string", description: "Отображаемое название" },
    { name: "icon", type: "ref", description: "Иконка" },
  ],

  // ============ mixins: точечные ============
  mixinColumnRef: [
    {
      name: "column",
      type: "ref",
      description: "Ссылка на колонку",
      required: true,
    },
  ],
  actionHooks: [
    {
      name: "onStart",
      type: "object",
      description: "Хук при запуске сценария",
    },
    {
      name: "onComplete",
      type: "object",
      description: "Хук при успешном завершении сценария",
    },
    {
      name: "onError",
      type: "object",
      description: "Хук при ошибке выполнения сценария",
    },
  ],
  actionHookLifecycle: [
    {
      name: "artifacts",
      type: "object",
      description: "Управление артефактами, созданными сценарием",
    },
    {
      name: "notify",
      type: "object",
      description: "Уведомление пользователя о событии",
    },
  ],
  actionHookArtifacts: [
    {
      name: "autodownload",
      type: "boolean",
      description: "Автоматически скачивать артефакты сценария",
    },
  ],
  actionHookNotify: [
    {
      name: "includeLinkToScenario",
      type: "boolean",
      description: "Добавить в уведомление ссылку на запуск сценария",
    },
    {
      name: "msg",
      type: "string",
      description: "Текст уведомления",
    },
  ],
};

interface SnippetDef {
  prefix: string;
  description: string;
  contexts: string[];
  body: string;
}

const SNIPPETS: SnippetDef[] = [
  {
    prefix: "newentity",
    description: "Новая сущность",
    contexts: ["entityList", "entity"],
    body: [
      "- id: ${1:NewEntity}",
      "  name: ${2:Новая сущность}",
      '  label: "{${3:id}}"',
      "  description: ${4:Описание сущности}",
      "  attributes:",
      "    - id: ${5:name}",
      "      name: ${6:Имя}",
      "      dataType: String",
    ].join("\n"),
  },
  {
    prefix: "newattr",
    description: "Новый атрибут",
    contexts: ["attribute"],
    body: [
      "- id: ${1:attrId}",
      "  name: ${2:Новый атрибут}",
      "  description: ${3:Описание атрибута}",
      "  dataType: ${4:String}",
    ].join("\n"),
  },
  {
    prefix: "newref",
    description: "Атрибут-Reference",
    contexts: ["attribute"],
    body: [
      "- id: ${1:refAttr}",
      "  name: ${2:Ссылка на сущность}",
      "  dataType: Reference",
      "  entity: ${3:TargetEntity}",
    ].join("\n"),
  },
  {
    prefix: "newarr",
    description: "Атрибут-Array",
    contexts: ["attribute"],
    body: [
      "- id: ${1:arrayAttr}",
      "  name: ${2:Массив}",
      "  dataType: Array",
      "  item:",
      "    dataType: ${3:String}",
    ].join("\n"),
  },
  {
    prefix: "newidentifier",
    description: "Атрибут-Identifier (шаблон + префикс)",
    contexts: ["attribute"],
    body: [
      "- id: ${1:iocId}",
      "  name: ${2:Идентификатор}",
      "  dataType: Identifier",
      '  template: "{@prefix}-{@YYYY}-{@MM}-{@inc}"',
      "  defaultPrefix: ${3:INC}",
      '  incrementTemplate: "0000"',
    ].join("\n"),
  },
  {
    prefix: "newlinkage",
    description: "Новая связь",
    contexts: ["linkageList", "linkage"],
    body: [
      "- id: ${1:EntityA_EntityB}",
      "  name: ${2:Связь сущностей}",
      "  side1: ${3:EntityA}",
      "  side2: ${4:EntityB}",
      "  type: ${5:1_n}",
      "  undirected: ${6:false}",
      "  nameFrom:",
      "    side1: ${7:Содержит}",
      "    side2: ${8:Входит в}",
    ].join("\n"),
  },
  {
    prefix: "newrule",
    description: "Правило данных",
    contexts: ["dataRuleList", "dataRule"],
    body: [
      "- id: ${1:dataR_newRule}",
      "  name: ${2:Новое правило}",
      "  target: entity",
      "  entity: ${3:SomeEntity}",
      "  condition: !rql ${4:someAttr IS NOT NULL}",
      "  rule:",
      "    effect: ${5:required}",
      "    attributes:",
      "      - attribute: ${6:targetAttr}",
    ].join("\n"),
  },
  {
    prefix: "newaction",
    description: "Действие открытия модалки",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_newAction}",
      "  name: ${2:Новое действие}",
      "  type: open_modal",
      "  modal: ${3:forms_newModal}",
      "  entity: ${4:SomeEntity}",
      "  operation: create",
    ].join("\n"),
  },
  {
    prefix: "newview",
    description: "Entity-view с виджетами и блоком",
    contexts: ["viewList", "view"],
    body: [
      "- id: ${1:viewMyEntity}",
      "  type: entity",
      "  entity: ${2:MyEntity}",
      "  widgets:",
      "    - id: ${3:editors_id}",
      "      type: attribute",
      "      attribute: ${4:id}",
      "  groups:",
      "    - id: ${5:blocks_info}",
      "      type: block",
      "      layout:",
      "        direction: column",
      "      components:",
      "        - widget: ${6:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newlist",
    description: "List-view (список объектов)",
    contexts: ["viewList", "view"],
    body: [
      "- id: ${1:lists_MyEntity}",
      "  type: list",
      "  source:",
      "    type: operational",
      "    entity: ${2:MyEntity}",
      "  table:",
      "    columns:",
      "      - id: ${3:name}",
      "        attribute: ${4:id}",
      "        label: ${5:Название}",
    ].join("\n"),
  },
  {
    prefix: "newwidget",
    description: "Виджет атрибута",
    contexts: ["widget"],
    body: [
      "- id: ${1:editors_attr}",
      "  type: attribute",
      "  attribute: ${2:attrId}",
      "  description: ${3:Поле для редактирования}",
    ].join("\n"),
  },
  {
    prefix: "newgroup",
    description: "Группа типа block",
    contexts: ["group"],
    body: [
      "- id: ${1:blocks_info}",
      "  type: block",
      "  description: ${2:Блок информации}",
      "  layout:",
      "    direction: column",
      "  components:",
      "    - widget: ${3:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newsequence",
    description: "Последовательность",
    contexts: ["sequenceList", "sequence"],
    body: [
      "- id: ${1:MySequence}",
      "  startFrom: ${2:1}",
      "  description: ${3:Описание последовательности}",
    ].join("\n"),
  },
  {
    prefix: "newmixin",
    description: "Миксин на панель",
    contexts: ["mixinList", "mixin"],
    body: [
      "- id: ${1:mixin_new}",
      "  type: view",
      "  entity: ${2:TargetEntity}",
      "  views:",
      "    - id: ${3:mixin_view}",
      "      type: tab",
      "      to:",
      "        tab: ${4:tabs_info}",
      "      change:",
      "        add:",
      "          components:",
      "            - widget: ${5:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newmenu",
    description: "Пункт меню с подпунктом",
    contexts: ["menuList", "menu", "menuItem"],
    body: [
      "- id: ${1:menus_root}",
      '  label: "${2:Название раздела}"',
      "  route: ${3:/my-domain}",
      "  type: root_group",
      "  placement: top",
      "  items:",
      "    - id: ${4:menu_item}",
      "      label: ${5:Пункт меню}",
      "      route: ${6:/my-domain/item}",
      "      type: menu",
      "      view: ${7:lists_MyEntity}",
    ].join("\n"),
  },
  {
    prefix: "newmedia",
    description: "Иконка",
    contexts: ["mediaList", "media"],
    body: [
      "- id: ${1:iconsMyIcon}",
      "  description: ${2:Иконка для ...}",
      "  type: icon_name",
      "  iconName: ${3:folder}",
    ].join("\n"),
  },
  {
    prefix: "newenum",
    description: "Enum-тип данных",
    contexts: ["dataTypeList", "dataType"],
    body: [
      "- id: ${1:enumMyType}",
      "  name: ${2:Новый enum}",
      "  dataType: Enum",
      "  values:",
      "    - id: ${3:value1}",
      "      name: ${4:Значение 1}",
      "    - id: ${5:value2}",
      "      name: ${6:Значение 2}",
    ].join("\n"),
  },
  {
    prefix: "newworkflow",
    description: "Workflow-тип данных",
    contexts: ["dataTypeList", "dataType"],
    body: [
      "- id: ${1:workflowMyProcess}",
      "  name: ${2:Новый workflow}",
      "  dataType: Workflow",
      "  initial: ${3:New}",
      "  statuses:",
      "    - id: ${4:New}",
      "      name: ${5:Новый}",
      "    - id: ${6:Done}",
      "      name: ${7:Завершён}",
      "  transitions:",
      "    - from: ${8:New}",
      "      to: ${9:Done}",
    ].join("\n"),
  },
  {
    prefix: "newtable",
    description: "Table-тип данных",
    contexts: ["dataTypeList", "dataType"],
    body: [
      "- id: ${1:tableMyTable}",
      "  name: ${2:Новая таблица}",
      "  dataType: Table",
      "  maxRows: ${3:100}",
      "  attributes:",
      "    - id: ${4:col1}",
      "      name: ${5:Колонка 1}",
      "      dataType: String",
    ].join("\n"),
  },
  {
    prefix: "newenumvalue",
    description: "Значение Enum",
    contexts: ["enumValue"],
    body: ["- id: ${1:value1}", "  name: ${2:Значение 1}"].join("\n"),
  },
  {
    prefix: "newworkflowstatus",
    description: "Статус Workflow",
    contexts: ["workflowStatus"],
    body: [
      "- id: ${1:status1}",
      "  name: ${2:Статус 1}",
      "  description: ${3:Описание}",
    ].join("\n"),
  },
  {
    prefix: "newtransition",
    description: "Переход Workflow",
    contexts: ["transition"],
    body: ["- from: ${1:StatusA}", "  to: ${2:StatusB}"].join("\n"),
  },
  {
    prefix: "newconstraint",
    description: "Constraint (required / range / regexp...)",
    contexts: ["constraintsItem"],
    body: ["- kind: ${1:required}", "  message: ${2:Текст ошибки}"].join("\n"),
  },
  {
    prefix: "newconstraintlen",
    description: "Constraint: length с min/max",
    contexts: ["constraintsItem"],
    body: [
      "- kind: length",
      "  min: ${1:1}",
      "  max: ${2:255}",
      "  message: ${3:Недопустимая длина}",
    ].join("\n"),
  },
  {
    prefix: "newprefixrule",
    description: "Правило подстановки префикса",
    contexts: ["prefixRule"],
    body: [
      "- id: ${1:Rule_1}",
      "  attribute: ${2:attrId}",
      "  source:",
      "    entity: ${3:SomeDict}",
      "    key: ${4:fullName}",
      "    value: ${5:shortCode}",
    ].join("\n"),
  },
  {
    prefix: "newprojection",
    description: "Проекция сущности",
    contexts: ["entity"],
    body: [
      "projection:",
      "  - attribute: ${1:name}",
      "  - attribute: ${2:description}",
    ].join("\n"),
  },
  {
    prefix: "newsearching",
    description: "Правила поиска сущности",
    contexts: ["entity"],
    body: [
      "searching:",
      "  attributes:",
      "    - ${1:id}",
      "    - ${2:name}",
    ].join("\n"),
  },
  {
    prefix: "newcountercolor",
    description: "Цветовая схема счётчика",
    contexts: ["counterColorPattern"],
    body: [
      "- id: ${1:counterColorTime}",
      "  red: ${2:60%}",
      "  yellow: ${3:40%}",
    ].join("\n"),
  },
  {
    prefix: "newtree",
    description: "Дерево связей (1 уровень)",
    contexts: ["treeList", "tree"],
    body: [
      "- id: ${1:MyTree}",
      "  type: ordinary",
      "  maxDepth: ${2:5}",
      "  hierarchy:",
      "    entity: ${3:RootEntity}",
      "    maxInstances: ${4:1}",
      "    children:",
      "      - linkage: ${5:RootToChild}",
      "        entity: ${6:ChildEntity}",
      "        side: ${7:1}",
      "  sorting:",
      "    - id: ${8:sorting_name}",
      "      name: ${9:По наименованию}",
      "      by:",
      "        - entity: ${10:RootEntity}",
      "          by:",
      "            - attribute: ${11:name}",
      "              direction: asc",
    ].join("\n"),
  },
  {
    prefix: "newtransitive",
    description: "Транзитивная связь (1 хоп)",
    contexts: ["transitiveLinkageList", "transitiveLinkage"],
    body: [
      "- id: ${1:MyTransitiveTree}",
      "  entity: ${2:StartEntity}",
      "  description: ${3:Цепочка связей}",
      "  joins:",
      "    - id: ${4:join1}",
      "      linkage: ${5:StartToMiddle}",
      "      search:",
      "        enable: true",
      "        mode: both",
    ].join("\n"),
  },
  {
    prefix: "newjoins",
    description: "Следующий хоп в транзитивной связи",
    contexts: ["transitiveJoin"],
    body: [
      "- id: ${1:join_next}",
      "  linkage: ${2:NextLinkage}",
      "  search:",
      "    enable: ${3:true}",
      "    mode: ${4:both}",
    ].join("\n"),
  },
  {
    prefix: "newuirule",
    description: "UI Rule: скрыть виджет",
    contexts: ["uiRuleList", "uiRule"],
    body: [
      "- id: ${1:hiddenWidget}",
      "  name: ${2:Скрыть виджет}",
      "  target: entity_view",
      "  view: ${3:entityView}",
      "  condition: !rql ${4:true}",
      "  rule:",
      "    effect: hidden",
      "    widgets:",
      "      - widget: ${5:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newuirulevariant",
    description: "UI Rule: вариант с пресетами",
    contexts: ["uiRuleList", "uiRule"],
    body: [
      "- id: ${1:variantRule}",
      "  name: ${2:Цветовая вариация}",
      "  target: entity_view",
      "  view: ${3:entityView}",
      '  condition: !rql ${4:@doc.status = "CRITICAL"}',
      "  rule:",
      "    effect: variant",
      "    widgets:",
      "      - widget: ${5:editors_status}",
      "        presets:",
      "          - ${6:redPreset}",
    ].join("\n"),
  },
  {
    prefix: "newuirulenested",
    description: "UI Rule: скрыть колонку таблицы",
    contexts: ["uiRuleList", "uiRule"],
    body: [
      "- id: ${1:hiddenTableColumn}",
      "  name: ${2:Скрыть колонку в таблице}",
      "  target: entity_attribute",
      "  view: ${3:entityView}",
      "  condition: !rql ${4:true}",
      "  rule:",
      "    effect: hidden",
      "    widgets:",
      "      - widget: ${5:editors_table}",
      "        nested:",
      "          type: table",
      "          attributes:",
      "            - attribute: ${6:col1}",
    ].join("\n"),
  },
  {
    prefix: "newuipreset",
    description: "UI Preset (стили)",
    contexts: ["uiPresetList", "uiPreset"],
    body: [
      "- id: ${1:redPreset}",
      "  description: ${2:Красный фон}",
      "  props:",
      "    color: ${3:#ff0000}",
      "    font-weight: ${4:bold}",
    ].join("\n"),
  },
  {
    prefix: "newpresetref",
    description: "Ссылка на пресет в widgets/groups/columns",
    contexts: ["uiRuleWidget", "uiRuleGroup", "uiRuleColumn"],
    body: ["presets:", "  - ${1:redPreset}"].join("\n"),
  },
  {
    prefix: "newbulkdelete",
    description: "Массовое действие: удаление",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_bulkRemove}",
      "  name: ${2:Удалить}",
      "  type: bulk",
      "  entity: ${3:SomeEntity}",
      "  operation: remove",
    ].join("\n"),
  },
  {
    prefix: "newbulkedit",
    description: "Массовое действие: редактирование атрибутов",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_bulkEdit}",
      "  name: ${2:Изменить}",
      "  type: bulk",
      "  entity: ${3:SomeEntity}",
      "  operation: edit",
      "  attributes:",
      "    type: specific",
      "    use:",
      "      - attribute: ${4:attr1}",
      "      - attribute: ${5:attr2}",
    ].join("\n"),
  },
  {
    prefix: "newbulkattr",
    description: "Массовое действие: изменить атрибут (bool/workflow)",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_bulkSetBool}",
      "  name: ${2:Установить флаг}",
      "  type: bulk",
      "  entity: ${3:SomeEntity}",
      "  operation: edit_attribute",
      "  values:",
      "    - attribute: ${4:isActive}",
      "      value: ${5:true}",
      "  control:",
      "    type: ${6:bool_text}",
      '    trueText: "${7:Активен}"',
      '    falseText: "${8:Неактивен}"',
    ].join("\n"),
  },
  {
    prefix: "newautomationaction",
    description: "Действие запуска автоматизации",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_runAutomation}",
      "  name: ${2:Запустить автоматизацию}",
      "  type: automation",
      "  entity: ${3:SomeEntity}",
      "  automation:",
      "    id: ${4:3c521909-cc55-4b0c-b645-f79eb0263296}",
    ].join("\n"),
  },
  {
    prefix: "newscenarioaction",
    description: "Действие запуска сценария",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_runScenario}",
      "  name: ${2:Запустить сценарий}",
      "  type: scenario",
      "  entity: ${3:SomeEntity}",
      "  scenario: ${4:MyScenario}",
      "  workerTag: ${5:default}",
    ].join("\n"),
  },
  {
    prefix: "newlisttable",
    description: "Таблица с 3 колонками",
    contexts: ["viewList", "view"],
    body: [
      "table:",
      "  columns:",
      "    - id: ${1:id}",
      "      attribute: ${2:id}",
      "      label: ${3:Идентификатор}",
      "      layout:",
      "        width:",
      "          default: ${4:100}",
      "          min: 50",
      "          max: 200",
      "    - id: ${5:name}",
      "      attribute: ${6:name}",
      "      label: ${7:Название}",
      "    - id: ${8:createdAt}",
      "      attribute: createdAt",
      "      label: Дата создания",
      "      control:",
      "        type: timestamp",
    ].join("\n"),
  },
  {
    prefix: "newtablecolumn",
    description: "Колонка таблицы",
    contexts: ["viewTable"],
    body: [
      "- id: ${1:colId}",
      "  attribute: ${2:attrId}",
      "  label: ${3:Название колонки}",
      "  layout:",
      "    width:",
      "      default: ${4:150}",
      "      min: 50",
      "      max: 300",
    ].join("\n"),
  },
  {
    prefix: "newtablefilter",
    description: "Настройка фильтрации таблицы",
    contexts: ["viewTable"],
    body: [
      "filter:",
      "  attributes:",
      "    type: ${1:all}",
      "  linkages:",
      "    type: ${2:all}",
    ].join("\n"),
  },
  {
    prefix: "newtablesorting",
    description: "Сортировка по колонке",
    contexts: ["viewTable"],
    body: [
      "sortingBy:",
      "  columns:",
      "    - column: ${1:colId}",
      "      sorting: ${2:sortingId}",
      "  defaults:",
      "    column: ${3:colId}",
      "    direction: ${4:asc}",
    ].join("\n"),
  },
  {
    prefix: "newtablepaging",
    description: "Пагинация таблицы",
    contexts: ["viewTable"],
    body: [
      "paging:",
      "  sizes:",
      "    - 10",
      "    - 50",
      "    - 100",
      "  defaultSize: ${1:20}",
    ].join("\n"),
  },
  {
    prefix: "newtablerefresh",
    description: "Автообновление таблицы",
    contexts: ["viewTable"],
    body: [
      "refresh:",
      "  mode: ${1:auto}",
      "  defaults:",
      "    enabled: ${2:true}",
      "    unit: ${3:minute}",
      "    interval: ${4:5}",
    ].join("\n"),
  },
  {
    prefix: "newtablerowclick",
    description: "Действие при клике на строку",
    contexts: ["viewTable"],
    body: [
      "actions:",
      "  - type: row_click",
      "    action: ${1:actions_openPanel}",
    ].join("\n"),
  },
  {
    prefix: "newtablecontextmenu",
    description: "Контекстное меню строки",
    contexts: ["viewTable"],
    body: [
      "actions:",
      "  - type: row_context_menu",
      "    items:",
      "      - action: ${1:actions_edit}",
      "        label: ${2:Изменить}",
      "      - action: ${3:actions_remove}",
      "        label: ${4:Удалить}",
    ].join("\n"),
  },
  {
    prefix: "newtableaggregate",
    description: "Колонка с агрегацией (count)",
    contexts: ["viewTable"],
    body: [
      "- id: ${1:linkedCount}",
      "  label: ${2:Связанных}",
      "  join: ${3:my_join_id}",
      "  aggregate:",
      "    type: count",
      "    condition: !rql ${4:true}",
    ].join("\n"),
  },
  {
    prefix: "newlistfull",
    description: "Полный list-view с таблицей и фильтрами",
    contexts: ["viewList", "view"],
    body: [
      "- id: ${1:lists_MyEntity}",
      "  type: list",
      "  label: ${2:Список MyEntity}",
      "  source:",
      "    type: operational",
      "    entity: ${3:MyEntity}",
      "  table:",
      "    columns:",
      "      - id: ${4:id}",
      "        attribute: id",
      "        label: Идентификатор",
      "      - id: ${5:name}",
      "        attribute: name",
      "        label: Название",
      "    filter:",
      "      attributes:",
      "        type: all",
      "      linkages:",
      "        type: all",
      "    sortingBy:",
      "      defaults:",
      "        column: ${6:name}",
      "        direction: asc",
      "    paging:",
      "      sizes: [10, 50, 100]",
      "      defaultSize: 20",
      "    selection: true",
      "    actions:",
      "      - type: row_click",
      "        action: ${7:actions_openPanel}",
    ].join("\n"),
  },
  {
    prefix: "newentityview",
    description: "Entity-view с панелью и модалкой",
    contexts: ["viewList", "view"],
    body: [
      "- id: ${1:viewMyEntity}",
      "  type: entity",
      "  entity: ${2:MyEntity}",
      "  widgets:",
      "    - id: ${3:editors_id}",
      "      type: attribute",
      "      attribute: ${4:id}",
      "    - id: ${5:editors_name}",
      "      type: attribute",
      "      attribute: ${6:name}",
      "  groups:",
      "    - id: ${7:blocks_info}",
      "      type: block",
      "      layout:",
      "        direction: column",
      "      components:",
      "        - widget: ${8:editors_id}",
      "        - widget: ${9:editors_name}",
      "    - id: ${10:tabs_info}",
      "      type: tab",
      "      label: ${11:Детали}",
      "      components:",
      "        - block: ${12:blocks_info}",
      "    - id: ${13:blocks_forms_new}",
      "      type: form",
      "      layout:",
      "        direction: column",
      "      components:",
      "        - widget: ${14:editors_id}",
      "        - widget: ${15:editors_name}",
      "  views:",
      "    - id: ${16:panels_info}",
      "      type: panel",
      "      label: ${17:Детали}",
      "      tabs:",
      "        - tab: ${18:tabs_info}",
      "    - id: ${19:forms_new}",
      "      type: modal",
      "      form: ${20:blocks_forms_new}",
      "      label: ${21:Добавление}",
    ].join("\n"),
  },
  {
    prefix: "newwidgetattr",
    description: "Виджет атрибута с контролом",
    contexts: ["widget"],
    body: [
      "- id: ${1:editors_attr}",
      "  type: attribute",
      "  attribute: ${2:attrId}",
      "  description: ${3:Поле для редактирования}",
      "  control:",
      "    type: ${4:text}",
    ].join("\n"),
  },
  {
    prefix: "newwidgetlinkage",
    description: "Виджет связи с таблицей",
    contexts: ["widget"],
    body: [
      "- id: ${1:editors_linkage}",
      "  type: linkage",
      "  linkage: ${2:my_linkage_id}",
      "  label: ${3:Связанные объекты}",
      "  side: ${4:2}",
      "  control:",
      "    type: table",
      "    addLinksView: ${5:lists_MyEntity}",
      "    columns:",
      "      - id: ${6:name}",
      "        attribute: name",
    ].join("\n"),
  },
  {
    prefix: "newwidgetjoin",
    description: "Виджет транзитивной связи",
    contexts: ["widget"],
    body: [
      "- id: ${1:widget_join}",
      "  type: join",
      "  joinId: ${2:my_join_id}",
      "  attribute: ${3:Name}",
      "  label: ${4:Связанные}",
    ].join("\n"),
  },
  {
    prefix: "newblock",
    description: "Группа типа block",
    contexts: ["group"],
    body: [
      "- id: ${1:blocks_info}",
      "  type: block",
      "  label: ${2:Информация}",
      "  layout:",
      "    direction: column",
      "    expandable: false",
      "  components:",
      "    - widget: ${3:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newtab",
    description: "Вкладка",
    contexts: ["group"],
    body: [
      "- id: ${1:tabs_info}",
      "  type: tab",
      "  label: ${2:Детали}",
      "  components:",
      "    - block: ${3:blocks_info}",
    ].join("\n"),
  },
  {
    prefix: "newform",
    description: "Форма (modal form)",
    contexts: ["group"],
    body: [
      "- id: ${1:blocks_forms_new}",
      "  type: form",
      "  layout:",
      "    direction: column",
      "  components:",
      "    - widget: ${2:editors_id}",
      "    - widget: ${3:editors_name}",
    ].join("\n"),
  },
  {
    prefix: "newpanel",
    description: "Панель (компактное представление)",
    contexts: ["viewNested"],
    body: [
      "- id: ${1:panels_info}",
      "  type: panel",
      "  label: ${2:Детали}",
      "  menu:",
      "    - action: ${3:actions_edit}",
      "  tabs:",
      "    - tab: ${4:tabs_info}",
    ].join("\n"),
  },
  {
    prefix: "newmodal",
    description: "Модальное окно",
    contexts: ["viewNested"],
    body: [
      "- id: ${1:forms_new}",
      "  type: modal",
      "  form: ${2:blocks_forms_new}",
      "  label: ${3:Добавление}",
      "  buttons:",
      "    - type: submit",
      "      label: ${4:Создать}",
      "    - type: close",
      "      label: ${5:Отмена}",
    ].join("\n"),
  },
  {
    prefix: "newpage",
    description: "Полноэкранная карточка",
    contexts: ["viewNested"],
    body: [
      "- id: ${1:pages_info}",
      "  type: page",
      "  menuItem: ${2:menu_item_id}",
      "  actionPanel:",
      "    - widget: ${3:buttons_edit}",
      "  tabs:",
      "    - tab: ${4:tabs_info}",
      "  pinnedView:",
      "    block: ${5:blocks_header}",
      "    position: top",
      "    height: 30%",
    ].join("\n"),
  },
  {
    prefix: "newinherit",
    description: "Наследование группы / меню",
    contexts: ["inheritSettings"],
    body: ["inherit:", "  type: ${1:append}"].join("\n"),
  },
  {
    prefix: "newmenuroot",
    description: "Корневая группа меню с подпунктом",
    contexts: ["menuRootList", "menuRoot"],
    body: [
      "- id: ${1:menus_root}",
      "  route: ${2:/my-domain}",
      '  label: "${3:Название раздела}"',
      "  type: root_group",
      "  placement: top",
      "  priority: ${4:1000}",
      "  items:",
      "    - id: ${5:menu_item}",
      "      route: ${6:/my-domain/item}",
      "      label: ${7:Пункт меню}",
      "      type: menu",
      "      view: ${8:lists_MyEntity}",
      "      priority: ${9:1000}",
    ].join("\n"),
  },
  {
    prefix: "newmenuitem",
    description: "Пункт меню",
    contexts: ["menuItemList", "menuItem"],
    body: [
      "- id: ${1:menu_item}",
      "  route: ${2:/my-domain/item}",
      "  label: ${3:Пункт меню}",
      "  type: menu",
      "  view: ${4:lists_MyEntity}",
      "  priority: ${5:1000}",
    ].join("\n"),
  },
  {
    prefix: "newmedia",
    description: "Иконка",
    contexts: ["mediaList", "media"],
    body: [
      "- id: ${1:iconsMyIcon}",
      "  description: ${2:Иконка для ...}",
      "  type: icon_name",
      "  iconName: ${3:folder}",
    ].join("\n"),
  },
  {
    prefix: "newmixinview",
    description: "Миксин на вкладку (тип view)",
    contexts: ["mixinList", "mixin"],
    body: [
      "- id: ${1:mixin_tab}",
      "  name: ${2:Примесь вкладки}",
      "  type: view",
      "  entity: ${3:TargetEntity}",
      "  views:",
      "    - id: ${4:mixin_view}",
      "      type: tab",
      "      fromView: ${5:views_source}",
      "      to:",
      "        tab: ${6:tabs_info}",
      "      change:",
      "        add:",
      "          components:",
      "            - widget: ${7:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newmixinlinkage",
    description: "Миксин на основе связи (тип linkage)",
    contexts: ["mixinList", "mixin"],
    body: [
      "- id: ${1:mixin_linkage}",
      "  type: linkage",
      "  entity:",
      "    to: ${2:TargetEntity}",
      "    from: ${3:SourceEntity}",
      "  linkage: ${4:my_linkage_id}",
      "  views:",
      "    - id: ${5:mixin_panel}",
      "      type: panel",
      "      to:",
      "        panel: ${6:panels_info}",
      "      change:",
      "        add:",
      "          tabs:",
      "            tabs:",
      "              - tab: ${7:tabs_mixin}",
    ].join("\n"),
  },
  {
    prefix: "newexchange",
    description: "Настройки обмена данными",
    contexts: ["exchangeSettings"],
    body: [
      "exchangeSettings:",
      "  enable: ${1:true}",
      "  label: ${2:Обмен данными}",
      "  attributeFormats:",
      "    Date: DD-MM-YYYY",
      "    Time: HH:mm:ss",
      "    Timestamp: DD-MM-YYYYTHH:mm:ss",
      "  entities:",
      "    ${3:MyEntity}:",
      "      enable: true",
      "      forExport: ${4:id}",
    ].join("\n"),
  },
  {
    prefix: "newexchangeentity",
    description: "Настройки обмена для сущности",
    contexts: ["exchangeEntitySettings"],
    body: [
      "enable: ${1:true}",
      "label: ${2:MyEntity}",
      "forExport: ${3:id}",
      "upsertWith: ${4:name}",
    ].join("\n"),
  },
];

/**
 * true, если курсор стоит на `- <partial>` внутри `searching:` сущности.
 * Покрывает оба стиля YAML (короткий и с доп. отступом) и partial-ввод
 * (`- `, `- a`, `- attr`).
 */
function isAtSearchingItemStart(model: any, position: any): boolean {
  const lineText = model.getLineContent(position.lineNumber);
  const before = lineText.slice(0, position.column - 1);

  if (!/^\s*-\s*[a-zA-Z_]*\s*$/.test(before)) return false;

  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  // Только внутри entities[] (searching бывает только там)
  let section = "";
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent === 0) {
      const m = pl.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) {
        section = m[1];
        break;
      }
    }
  }
  if (section !== "entities") return false;

  // Walk-up: пропускаем sibling-элементы списка, ищем `searching:`
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim() || pl.trim().startsWith("#")) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;

    // Предыдущий `- xxx:` на нашем indent — sibling, пропускаем
    if (pIndent === currentIndent && /^\s*-\s+\S/.test(pl)) {
      continue;
    }

    if (pIndent <= currentIndent) {
      if (/^\s*searching\s*:\s*$/.test(pl)) return true;
      // Другой ключ выше — не searching
      return false;
    }
  }
  return false;
}

// ============ Path-based контекст (P0) ============
// Резолвит YAML-контекст по пути "контейнерных" ключей над курсором,
// игнорируя dash-item openers (`- id: X`, `- attribute: Y` — прозрачны).
// Единственное исключение: `- attributes:` (dash с контейнерным значением)
// остаётся в пути, т.к. сам является контейнером.

interface ContainerEntry {
  key: string;
  indent: number;
  isContainer: boolean;
}

function findContainerPath(model: any, position: any): string[] {
  const currentLine = model.getLineContent(position.lineNumber);
  const currentIndent = (currentLine.match(/^(\s*)/) || ["", ""])[1].length;
  const result: string[] = [];
  let boundary = currentIndent;

  // Walk-up: O(depth), а не O(N). Пропускаем всё, что не может быть
  // предком курсора (indent >= boundary).
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

    if (indent >= boundary) continue;

    if (indent === 0) {
      const m = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) result.unshift(m[1]);
      break;
    }

    const m = line.match(/^(\s*)(-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, , , key, rest] = m;
    const isContainer = !rest.trim();

    if (isContainer) {
      result.unshift(key);
      boundary = indent;
    } else {
      // value-field / item opener: уменьшаем границу, чтобы следующая
      // родительская строка была строго выше.
      boundary = Math.min(boundary, indent);
    }
  }

  return result;
}

function computeItemTypeFromPath(model: any, position: any): string | null {
  const path = findContainerPath(model, position);
  return resolvePathToContext(path);
}

/**
 * Путь контейнеров → имя контекста в FIELD_DEFINITIONS.
 * Ключ — сегменты через `.`. Значение — `null` для «сознательно без полей»,
 * отсутствие ключа — path не разрешён, будет fallback.
 */
const PATH_TO_CONTEXT: Record<string, string> = {
  // ============ entities ============
  entities: "entity",
  "entities.attributes": "attribute",
  "entities.attributes.item": "arrayItem",
  "entities.attributes.constraints": "attributeConstraint",
  "entities.attributes.prefixRules": "prefixRule",
  "entities.attributes.prefixRules.source": "prefixRuleSource",
  "entities.attributes.calculation": "calculation",
  "entities.sorting": "sortingItem",
  "entities.sorting.by": "sortingByItem",
  "entities.identification": "identificationItem",
  "entities.identification.rule": "identificationRuleItem",
  "entities.identification.rule.and": "identificationRuleItem",
  "entities.identification.rule.or": "identificationRuleItem",
  "entities.reconciliation": "reconciliationItem",
  "entities.reconciliation.sourcePriority": "reconciliationSourceItem",
  "entities.reconciliation.default": "reconciliationDefaultItem",
  "entities.reconciliation.mergeStrategy": "reconciliationMergeStrategy",
  "entities.projection": "projectionItem",
  "entities.searching": "searchingItem",
  "entities.searching.attributes": "searchingItem",
  "entities.graphView": "graphView",
  "entities.treeNode.types": "treeNodeType",
  "entities.treeNode.types.of": "treeNodeOf",

  // ============ linkages ============
  linkages: "linkage",
  "linkages.attributes": "linkageAttribute",
  "linkages.attributes.constraints": "attributeConstraint",
  "linkages.nameFrom": "nameFrom",
  "linkages.view": "graphView",
  "linkages.sorting": "sortingItem",
  "linkages.sorting.by": "sortingByItem",
  "linkages.searching": "searchingItem",

  // ============ dataTypes ============
  dataTypes: "dataType",
  "dataTypes.values": "enumValue",
  "dataTypes.statuses": "workflowStatus",
  "dataTypes.transitions": "transition",
  "dataTypes.attributes": "attribute",
  "dataTypes.attributes.constraints": "attributeConstraint",
  "dataTypes.view.columns": "viewTableColumn",
  "dataTypes.view.columns.layout": "viewTableColumnLayout",
  "dataTypes.view.columns.layout.width": "viewTableColumnWidth",
  "dataTypes.view.columns.control": "viewTableColumnControl",
  "dataTypes.view.sortingBy.columns": "viewTableSortingColumn",
  "dataTypes.view.sortingBy.defaults": "viewTableSortingByDefault",
  "dataTypes.view.paging": "viewTablePaging",

  // ============ sequences ============
  sequences: "sequence",

  // ============ counterColorPattern(s) ============
  counterColorPattern: "counterColorPattern",
  counterColorPatterns: "counterColorPattern",

  // ============ trees ============
  trees: "tree",
  "trees.hierarchy": "treeHierarchy",
  "trees.hierarchy.children": "treeChildren",
  "trees.sorting": "treeSorting",
  "trees.sorting.by": "treeSortingBy",
  "trees.sorting.by.by": "treeSortingByBy",

  // ============ transitiveLinkages ============
  transitiveLinkages: "transitiveLinkage",
  "transitiveLinkages.joins": "transitiveJoin",
  "transitiveLinkages.joins.search": "transitiveJoinSearch",

  // ============ mixins ============
  mixins: "mixin",
  "mixins.entity": "mixinEntity",
  "mixins.views": "mixinView",
  "mixins.views.to": "mixinViewTo",
  "mixins.views.change": "mixinChange",
  "mixins.views.change.add": "mixinChangeAdd",

  // ============ dataRules ============
  dataRules: "dataRule",
  "dataRules.rule": "dataRuleRule",
  "dataRules.rule.attributes": "dataRuleAttributeAction",
  "dataRules.rule.linkages": "dataRuleLinkageAction",
  "dataRules.rule.nested": "dataRuleNested",
  "dataRules.rule.nested.attributes": "dataRuleNestedAttribute",
  "dataRules.rule.nested.items": "dataRuleNestedItem",

  // ============ actions ============
  actions: "action",
  "actions.values": "actionValue",
  "actions.control": "actionControl",
  "actions.automation": "actionAutomation",
  "actions.bulkSettings": "actionBulkSettings",
  "actions.bulkSettings.attributes.use": "actionBulkAttributeUse",
  "actions.bulkSettings.linkages.use": "actionBulkLinkageUse",
  "actions.attributes.use": "actionBulkAttributeUse",
  "actions.linkages.use": "actionBulkLinkageUse",
  "actions.transition": "actionTransition",
  "actions.openBoardsFromGraph": "actionOpenBoardsFromGraph",
  // ============ actions: hooks (type: scenario) ============
  "actions.hooks": "actionHooks",
  "actions.hooks.onStart": "actionHookLifecycle",
  "actions.hooks.onComplete": "actionHookLifecycle",
  "actions.hooks.onError": "actionHookLifecycle",
  "actions.hooks.onStart.artifacts": "actionHookArtifacts",
  "actions.hooks.onStart.notify": "actionHookNotify",
  "actions.hooks.onComplete.artifacts": "actionHookArtifacts",
  "actions.hooks.onComplete.notify": "actionHookNotify",
  "actions.hooks.onError.artifacts": "actionHookArtifacts",
  "actions.hooks.onError.notify": "actionHookNotify",

  // ============ views ============
  views: "view",
  "views.widgets": "widget",
  "views.widgets.control.columns": "viewWidgetLinkageColumn",
  "views.widgets.control.context": "viewWidgetDragDropContext",
  "views.widgets.attributes": "viewWidgetLinkageAttribute",
  "views.groups": "group",
  "views.groups.layout": "viewGroupLayout",
  "views.groups.components": "viewGroupComponent",
  "views.views": "viewNested",
  "views.views.buttons": "viewButton",
  "views.views.buttons.control": "viewButtonControl",
  "views.views.buttons.actions": "viewButtonAction",
  "views.views.footer": "viewFooterAction",
  "views.views.menu": "viewMenuAction",
  "views.views.actionPanel": "viewActionPanelItem",
  "views.views.tabs": "viewTab",
  "views.views.onView": "viewButtonAction",
  "views.views.pinnedView": "viewPinnedView",
  "views.source": "viewSource",
  "views.source.joins": "viewSourceJoin",
  "views.table.columns": "viewTableColumn",
  "views.table.columns.layout": "viewTableColumnLayout",
  "views.table.columns.layout.width": "viewTableColumnWidth",
  "views.table.columns.control": "viewTableColumnControl",
  "views.table.columns.aggregate": "viewTableColumnAggregate",
  "views.table.filter": "viewTableFilter",
  "views.table.filter.attributes.use": "viewTableFilterAttributesUse",
  "views.table.filter.linkages.use": "viewTableFilterLinkagesUse",
  "views.table.sortingBy.columns": "viewTableSortingColumn",
  "views.table.sortingBy.defaults": "viewTableSortingByDefault",
  "views.table.paging": "viewTablePaging",
  "views.table.refresh": "viewTableRefresh",
  "views.table.refresh.defaults": "viewTableRefreshDefaults",
  "views.table.actions": "viewTableAction",
  "views.table.actions.menu": "viewTableActionItem",
  "views.table.empty": "viewTableEmpty",

  // ============ menus ============
  menus: "menuRoot",
  "menus.items": "menuItem",

  // ============ medias ============
  medias: "media",

  // ============ accessRules ============
  accessRules: "accessRule",
  "accessRules.create": "accessRuleItem",
  "accessRules.delete": "accessRuleItem",
  "accessRules.edit": "accessRuleItem",
  "accessRules.view": "accessRuleItem",
  "accessRules.launch": "accessRuleItem",
  "accessRules.create.except": "accessRuleException",
  "accessRules.delete.except": "accessRuleException",
  "accessRules.edit.except": "accessRuleException",
  "accessRules.view.except": "accessRuleException",
  "accessRules.launch.except": "accessRuleException",

  // ============ permissions ============
  permissions: "permission",

  // ============ localizations ============
  localizations: "localization",
  "localizations.keys": "localizationKey",

  // ============ uiRules ============
  uiRules: "uiRule",
  "uiRules.context": "uiRuleContext",
  "uiRules.rule": "uiRuleRule",
  "uiRules.rule.widgets": "uiRuleWidget",
  "uiRules.rule.groups": "uiRuleGroup",
  "uiRules.rule.columns": "uiRuleColumn",
  "uiRules.rule.nested": "uiRuleNested",
  "uiRules.rule.nested.attributes": "uiRuleNestedAttribute",
  "uiRules.rule.nested.items": "uiRuleNestedItem",

  // ============ uiPresets ============
  uiPresets: "uiPreset",

  // ============ exchangeSettings ============
  exchangeSettings: "exchangeSettings",
  "exchangeSettings.attributeFormats": "exchangeAttributeFormats",

  // ============ views: RQL include/exclude ============
  "views.widgets.include": "viewWidgetInclude",
  "views.widgets.include.entities": "viewWidgetIncludeEntity",
  "views.widgets.include.entities.linkages": "viewWidgetIncludeLinkage",
  "views.widgets.exclude": "viewWidgetInclude",
  "views.widgets.exclude.entities": "viewWidgetIncludeEntity",
  "views.widgets.exclude.entities.linkages": "viewWidgetIncludeLinkage",

  // ============ views: inherit ============
  "views.views.inherit": "inheritSettings",
  "views.views.menu.inherit": "inheritSettings",
  "views.views.tabs.inherit": "inheritSettings",
  "views.views.actionPanel.inherit": "inheritSettings",

  // ============ views: columns[].actions[] ============
  "views.table.columns.actions": "viewTableColumnActions",
  "views.table.columns.actions.menu": "viewTableActionItem",

  // ============ mixins: components/tabs/menu (add) ============
  "mixins.views.change.add.components": "viewGroupComponent",
  "mixins.views.change.add.tabs.tabs": "mixinTabRef",
  "mixins.views.change.add.menu.menu": "mixinActionRef",
  "mixins.views.change.add.position": "mixinPosition",

  // ============ mixins: components/tabs/menu (delete) ============
  "mixins.views.change.delete.components": "viewGroupComponent",
  "mixins.views.change.delete.tabs": "mixinTabRef",
  "mixins.views.change.delete.menu": "mixinActionRef",
  "mixins.views.change.delete.columns": "mixinColumnRef",

  // ============ mixins: replace ============
  "mixins.views.replace.components": "viewGroupComponent",
  "mixins.views.replace.tabs": "mixinTabRef",
  "mixins.views.replace.menu": "mixinActionRef",
  "mixins.views.replace.actionPanel": "mixinActionRef",
};

// ============ Определение контекста ============
/**
 * Определяет контекст для полей внутри элементов массивов
 * (`sorting[]`, `projection[]`, `identification[]`, `reconciliation[]`,
 *  а также вложенных `by[]`, `rule[]`, `sourcePriority[]`).
 *
 * Работает только для случая `key: ␣` (имя поля), не для значений.
 * Не мешает первому полю (`- ␣` / `- id: ␣` / `- attribute: ␣`) — там
 * возвращает `null`, и дальнейшая логика `detectContextAtPosition`
 * обрабатывает их как раньше.
 */
function detectArrayItemContext(model: any, position: any): string | null {
  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);

  // Не лезем, если пользователь уже набирает значение
  if (/^\s*(?:-\s+)?[a-zA-Z_][\w]*\s*:\s+\S/.test(beforeCursor)) return null;
  if (/^\s*#/.test(beforeCursor)) return null;

  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  // Ищем ближайшую dash-строку `- xxx:` с меньшим indent
  let itemLine = -1;
  let itemIndent = -1;
  let itemKey = "";

  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim() || pl.trim().startsWith("#")) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent >= currentIndent) continue;

    const dm = pl.match(/^(\s*)-\s+([a-zA-Z_][\w]*)\s*:/);
    if (dm) {
      itemLine = i;
      itemIndent = dm[1].length;
      itemKey = dm[2];
      break;
    }

    // Любой ключ на меньшем indent без `-` — мы не внутри `- xxx:` item
    const km = pl.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
    if (km) return null;

    if (pIndent === 0) return null;
  }
  if (itemLine < 0) return null;

  // Ищем контейнер над `- xxx:` (с меньшим indent)
  for (let i = itemLine - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim() || pl.trim().startsWith("#")) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent >= itemIndent) continue;

    const km = pl.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
    if (!km) {
      if (pIndent === 0) break;
      continue;
    }
    const containerKey = km[1];

    if (itemKey === "id") {
      if (containerKey === "sorting") return "sortingItem";
      if (containerKey === "projection") return "projectionItem";
      if (containerKey === "identification") return "identificationItem";
      if (containerKey === "reconciliation") return "reconciliationItem";
    } else if (itemKey === "attribute") {
      if (containerKey === "by") return "sortingByItem";
      if (containerKey === "rule") return "identificationRuleItem";
      if (containerKey === "projection") return "projectionItem";
      if (containerKey === "sourcePriority") return "reconciliationSourceItem";
    } else if (itemKey === "source") {
      if (containerKey === "sourcePriority") return "reconciliationSourceItem";
      if (containerKey === "default") return "reconciliationSourceItem";
    }
    return null;
  }
  return null;
}

export function detectContextAtPosition(
  model: any,
  position: any,
  _lineContexts: Map<number, any>,
): string | null {
  // ===== searching[]: `- <partial>` внутри searching: → предлагаем `attribute:` =====
  if (isAtSearchingItemStart(model, position)) {
    return "searchingItem";
  }

  // ===== Pre-check: 2+ поля внутри элементов массивов =====
  const arrayCtx = detectArrayItemContext(model, position);
  if (arrayCtx) return arrayCtx;

  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);

  // Если пользователь уже набрал `key: value` — это значение, не поле
  if (/^\s*(?:-\s+)?[a-zA-Z_][\w]*\s*:\s+\S/.test(beforeCursor)) return null;
  if (/^\s*#/.test(beforeCursor)) return null;

  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  // ============ 1. Определяем section (верхний уровень, indent 0) ============
  let section = "";
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent === 0) {
      const m = pl.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) {
        section = m[1];
        break;
      }
    }
  }

  // ============ 2. Определяем ближайшего родителя ============
  let parentKey: string | null = null;
  let parentIndent = -1;
  let parentLine = -1;

  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim() || pl.trim().startsWith("#")) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent >= currentIndent) continue;

    const keyMatch = pl.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
    if (keyMatch) parentKey = keyMatch[1];
    else if (/^\s*-\s+id\s*:/.test(pl)) parentKey = "id";
    else continue;
    parentIndent = pIndent;
    parentLine = i;
    break;
  }

  if (!parentKey) return null;

  // ============ Actions: nested containers ============
  if (section === "actions") {
    if (parentKey === "attributes" || parentKey === "linkages") {
      const insideBulk = isInsideBulkSettings(
        (n) => model.getLineContent(n),
        position.lineNumber,
        currentIndent,
      );
      if (parentKey === "attributes") {
        return insideBulk ? "actionBulkSettingsAttributes" : "actionAttributes";
      }
      return insideBulk ? "actionBulkSettingsLinkages" : "actionLinkages";
    }
  }

  // ============ 3. Секции верхнего уровня ============
  const hasDash = /^\s*-\s*[a-zA-Z]*$/.test(beforeCursor);

  if (parentKey === "menus") return hasDash ? "menuRoot" : "menuRootList";
  if (parentKey === "medias") return hasDash ? "media" : "mediaList";
  if (parentKey === "permissions") return "permission";
  if (parentKey === "accessRules") return "accessRule";
  if (parentKey === "localizations") return "localization";
  if (parentKey === "mixins") return hasDash ? "mixin" : "mixinList";
  if (parentKey === "exchangeSettings") return "exchangeSettings";

  if (parentKey === "entities") return hasDash ? "entity" : "entityList";
  if (parentKey === "linkages") return hasDash ? "linkage" : "linkageList";
  if (parentKey === "actions") return hasDash ? "action" : "actionList";
  if (parentKey === "dataRules") return hasDash ? "dataRule" : "dataRuleList";
  if (parentKey === "views") return hasDash ? "view" : "viewList";
  if (parentKey === "dataTypes") return hasDash ? "dataType" : "dataTypeList";
  if (parentKey === "sequences") return hasDash ? "sequence" : "sequenceList";
  if (
    parentKey === "counterColorPattern" ||
    parentKey === "counterColorPatterns"
  )
    return "counterColorPattern";
  if (parentKey === "trees") return hasDash ? "tree" : "treeList";
  if (parentKey === "transitiveLinkages")
    return hasDash ? "transitiveLinkage" : "transitiveLinkageList";
  if (parentKey === "uiRules") return hasDash ? "uiRule" : "uiRuleList";
  if (parentKey === "uiPresets") return hasDash ? "uiPreset" : "uiPresetList";

  // ============ NEW: treeNode.types / of ============
  if (parentKey === "types" && section === "entities") {
    return hasDash ? "treeNodeType" : "treeNodeTypeList";
  }
  if (parentKey === "of" && section === "entities") {
    return hasDash ? "treeNodeOf" : "treeNodeOfList";
  }

  // ============ NEW: accessRules scopes ============
  if (section === "accessRules") {
    if (
      parentKey === "create" ||
      parentKey === "delete" ||
      parentKey === "edit" ||
      parentKey === "view" ||
      parentKey === "launch"
    ) {
      return hasDash ? "accessRuleItem" : "accessRuleItemList";
    }
    if (parentKey === "except") {
      return hasDash ? "accessRuleException" : "accessRuleExceptionList";
    }
  }

  // ============ NEW: action.openBoardsFromGraph ============
  if (parentKey === "openBoardsFromGraph") {
    return "actionOpenBoardsFromGraph";
  }

  // ============ NEW: drag_drop_area.context ============
  if (parentKey === "context" && section === "views") {
    return "viewWidgetDragDropContext";
  }

  // ============ menus ============
  if (section === "menus") {
    if (parentKey === "items") {
      return hasDash ? "menuItem" : "menuItemList";
    }
  }

  // ============ mixins ============
  if (section === "mixins") {
    if (parentKey === "entity") {
      // Примесь direction
      const beforeEntity = model.getLineContent(parentLine).slice(0, 20);
      return "mixinEntity";
    }
    if (parentKey === "views") {
      return hasDash ? "mixinView" : "mixinViewList";
    }
    if (parentKey === "to") {
      // to: может быть внутри mixinView — уточняем родителя
      return "mixinViewTo";
    }
    if (parentKey === "change") return "mixinChange";
    if (parentKey === "add") return "mixinChangeAdd";
    if (parentKey === "position") return "mixinPosition";
    if (parentKey === "components") {
      // Компоненты внутри mixin change.add
      return "viewGroupComponent";
    }
  }

  // ============ exchangeSettings ============
  if (section === "exchangeSettings") {
    if (parentKey === "attributeFormats") return "exchangeAttributeFormats";
    if (parentKey === "entities") {
      // entities — это объект, ключи которого сущности
      // Но detectContextAtPosition работает по parentKey. Здесь entities содержит ключи-сущности.
      // Возвращаем exchangeEntitySettings если находимся внутри одной из сущностей
      return "exchangeEntitySettings";
    }
  }

  // ============ actions: расширение ============
  if (section === "actions") {
    if (parentKey === "bulk") return "actionBulk";
    if (parentKey === "automation") return "actionAutomation";
    if (parentKey === "values") return "actionValue";
    if (parentKey === "control") return "actionControl";
    if (parentKey === "attributes") {
      // Различаем атрибуты сущности и bulk-атрибуты действия
      return "actionBulkAttributes";
    }
    if (parentKey === "linkages") return "actionBulkLinkages";
    if (parentKey === "use") {
      // use может быть в attributes или linkages bulk-действия
      let useContext: string | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lIndent < parentIndent) {
          const keyM = l.match(/^\s*(attributes|linkages)\s*:/);
          if (keyM) useContext = keyM[1];
          break;
        }
      }
      if (useContext === "attributes") return "actionBulkAttributeUse";
      if (useContext === "linkages") return "actionBulkLinkageUse";
    }
  }

  if (parentKey === "attributes") {
    // Ищем предка "searching:" выше attributes
    let sawSearching = false;
    for (let i = parentLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      if (!l.trim() || l.trim().startsWith("#")) continue;
      const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (lIndent >= parentIndent) continue;
      if (/^\s*searching\s*:\s*$/.test(l)) {
        sawSearching = true;
        break;
      }
      break;
    }
    if (sawSearching) return "searchingAttributesItem";
    return section === "linkages" ? "linkageAttribute" : "attribute";
  }

  // ============ 3.5. Лист внутри массива объектов ============
  // Если parentKey — листовое поле (attribute/source/value/...),
  // а курсор находится на уровне sibling'а (следующего поля того же объекта),
  // нужно вернуть контекст массива, а не листа.
  {
    const LEAF_TO_CONTAINERS: Record<string, string[]> = {
      attribute: ["by", "rule", "projection", "sourcePriority"],
      source: ["sourcePriority", "default"],
    };
    const containers = LEAF_TO_CONTAINERS[parentKey];
    if (containers && containers.length > 0) {
      for (let i = parentLine - 1; i >= 1; i--) {
        const pl = model.getLineContent(i);
        if (!pl.trim() || pl.trim().startsWith("#")) continue;
        const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
        if (pIndent >= parentIndent) continue;
        const km = pl.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
        if (!km) {
          if (pIndent === 0) break;
          continue;
        }
        const key = km[1];
        if (containers.includes(key)) {
          if (key === "by") return "sortingByItem";
          if (key === "rule") return "identificationRuleItem";
          if (key === "projection") return "projectionItem";
          if (key === "sourcePriority" || key === "default")
            return "reconciliationSourceItem";
        }
        if (pIndent === 0) break;
      }
    }
  }

  // ============ 4. Вложенные контейнеры ============
  if (parentKey === "constraints") return "attributeConstraint";
  if (parentKey === "item") return "arrayItem";
  if (parentKey === "calculation") return "calculation";
  if (parentKey === "prefixRules") return "prefixRule";
  if (parentKey === "rule" && section === "entities")
    return "identificationRuleItem";

  // source внутри prefixRules[].source — отличаем от других source
  if (parentKey === "source") {
    // Проверим, что выше есть prefixRules
    for (let i = parentLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (lIndent < parentIndent) {
        if (/^\s*prefixRules\s*:/.test(l)) return "prefixRuleSource";
        break;
      }
      if (lIndent === 0) break;
    }
    return null;
  }
  if (parentKey === "sorting") return "sortingItem";
  if (parentKey === "by") return "sortingByItem";
  if (parentKey === "identification") return "identificationItem";
  if (parentKey === "reconciliation") return "reconciliationItem";
  if (parentKey === "projection") return "projectionItem";
  if (parentKey === "nameFrom") return "nameFrom";
  if (parentKey === "control") {
    // Специальные ветки уже выше (linkage / attribute / buttons / menu / columns).
    // Здесь — общий fallback для attribute-widgets.
    return "viewWidgetControl";
  }
  if (parentKey === "sourcePriority") return "reconciliationSourceItem";

  if (parentKey === "default" && section === "entities")
    return "reconciliationDefaultItem";

  if (parentKey === "mergeStrategy") return "reconciliationMergeStrategy";

  if (parentKey === "graphView") return "graphView";
  // ============ views: list-view ============
  if (section === "views") {
    // widgets[]
    if (parentKey === "widgets") {
      // Внутри виджета мы уже в контексте widget, это поле control/linkage...
      return "widget";
    }
    if (parentKey === "control") {
      // Контекст зависит от родителя: linkage.control или widgets[].control
      let controlParent: "linkage" | "widget" | "attribute" | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          const km = l.match(/^\s*(linkage|widget|attribute)\s*:/);
          if (km) controlParent = km[1] as any;
          break;
        }
      }
      if (controlParent === "linkage") return "viewWidgetLinkageControl";
      if (controlParent === "attribute")
        return "viewWidgetLinkageAttributeControl";
      return "viewWidgetControl";
    }
    if (parentKey === "linkage") {
      // linkage: <ref> — это может быть внутри widget или отдельный linkage. Уточняем:
      // Если внутри views.widgets[] — это виджет, а не атрибут ссылки
      let insideWidget = false;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          if (/^\s*widgets\s*:/.test(l)) insideWidget = true;
          break;
        }
      }
      // если это внутри widgets[] — это свойство widget, не отдельный контекст
      // (parentKey = "id" выше — уже покрывает)
      if (!insideWidget) return "linkage";
    }
    if (parentKey === "columns") {
      // Внутри widget.linkage.control.columns
      let insideLinkage = false;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          if (/^\s*linkage\s*:/.test(l)) insideLinkage = true;
          break;
        }
      }
      if (insideLinkage) return "viewWidgetLinkageColumn";
      return "viewTableColumn";
    }
    if (parentKey === "attributes") {
      // Внутри widget.linkage.attributes
      let insideLinkageWidget = false;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          if (/^\s*linkage\s*:/.test(l)) insideLinkageWidget = true;
          break;
        }
      }
      if (insideLinkageWidget) return "viewWidgetLinkageAttributes";
      return "attribute"; // обычные атрибуты сущности
    }

    // groups
    if (parentKey === "groups") {
      return "group";
    }
    if (parentKey === "layout") {
      const pathStr = findContainerPath(model, position).join(".");
      if (pathStr === "views") return "viewDashboardLayout";
      if (pathStr.endsWith("columns")) return "viewTableColumnLayout";
      return "viewGroupLayout";
    }
    if (parentKey === "components") return "viewGroupComponent";
    if (parentKey === "inherit" || parentKey === "inherits")
      return "inheritSettings";

    // views[] внутри views (nested cards)
    if (parentKey === "views") return "viewNested";
    if (parentKey === "menu" || parentKey === "actionPanel") {
      // menu в panel, actionPanel в page — оба массивы action
      return parentKey === "actionPanel"
        ? "viewActionPanelItem"
        : "viewMenuAction";
    }
    if (parentKey === "tabs") return "viewTab";
    if (parentKey === "buttons") return "viewButton";
    if (parentKey === "footer") return "viewFooterAction";
    if (parentKey === "pinnedView") return "viewPinnedView";
    if (parentKey === "onView") {
      // onView — массив action, но только set_attribute_value
      return "viewButtonAction";
    }
    if (parentKey === "conversationTransports") {
      // conversation widget
      return "viewWidgetConversation";
    }
    if (parentKey === "source") return "viewSource";
    if (parentKey === "joins") return "viewSourceJoin";
    if (parentKey === "table") return "viewTable";
    if (parentKey === "columns") {
      // Различаем viewTable.columns и views.widgets.linkage.control.columns
      // по ближайшему контейнеру выше
      let colParent: "table" | "widget" | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          const km = l.match(/^\s*(table|control|widgets|linkage|join)\s*:/);
          if (km) {
            if (km[1] === "table") colParent = "table";
            else colParent = "widget";
          }
          break;
        }
      }
      // Если находимся в views.widgets[].control.columns — это колонки виджета связи
      // Но для простоты возвращаем viewTableColumn — подойдёт для обоих
      return "viewTableColumn";
    }
    if (parentKey === "layout") return "viewTableColumnLayout";
    if (parentKey === "width") return "viewTableColumnWidth";
    if (parentKey === "aggregate") return "viewTableColumnAggregate";
    if (parentKey === "filter") return "viewTableFilter";
    if (parentKey === "use") {
      // use может быть в attributes или linkages filter
      let useParent: "attributes" | "linkages" | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          const km = l.match(/^\s*(attributes|linkages)\s*:/);
          if (km) useParent = km[1] as any;
          break;
        }
      }
      if (useParent === "attributes") return "viewTableFilterAttributesUse";
      if (useParent === "linkages") return "viewTableFilterLinkagesUse";
    }
    if (parentKey === "sortingBy") return "viewTableSortingBy";
    if (parentKey === "defaults") {
      // defaults может быть в sortingBy или refresh
      let defParent: "sortingBy" | "refresh" | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          const km = l.match(/^\s*(sortingBy|refresh)\s*:/);
          if (km) defParent = km[1] as any;
          break;
        }
      }
      return defParent === "refresh"
        ? "viewTableRefreshDefaults"
        : "viewTableSortingByDefault";
    }
    if (parentKey === "paging") return "viewTablePaging";
    if (parentKey === "refresh") return "viewTableRefresh";
    if (parentKey === "actions") return "viewTableAction";
    if (parentKey === "items") return "viewTableActionItem";
    if (parentKey === "empty") return "viewTableEmpty";
    if (parentKey === "actionPanel") return "viewActionPanelItem";
    if (parentKey === "control") return "viewTableColumnControl";
  }

  // Старый fallback для table (если views-контекст не распознан)
  if (parentKey === "table") return "viewTable";
  if (parentKey === "values") return "enumValue";
  if (parentKey === "statuses") return "workflowStatus";
  if (parentKey === "transitions") return "transition";
  if (parentKey === "items" && section === "menus") return "menuItem";
  if (parentKey === "widgets") return "widget";
  if (parentKey === "groups") return "group";
  if (parentKey === "rule") {
    if (section === "dataRules") return "dataRuleRule";
    if (section === "uiRules") return "uiRuleRule";
    return "identificationRule";
  }
  // ============ trees ============
  if (parentKey === "hierarchy") return "treeHierarchy";
  if (parentKey === "children") return "treeChildren";
  if (parentKey === "sorting" && section === "trees") {
    // Различаем treeSorting и treeSortingBy:
    // если выше есть `by:` — значит это уже внутри by[].by[]
    return hasDash ? "treeSorting" : "treeSortingList";
  }
  if (parentKey === "by" && section === "trees") {
    // Определяем уровень: внешний (entity + by) или внутренний (attribute + direction)
    // Смотрим, что было перед нашим `by:` — `- id:` или `- entity:`
    let byParentKind: "id" | "entity" | null = null;
    for (let i = parentLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (lIndent >= parentIndent) continue;
      if (/^\s*-\s+id\s*:/.test(l)) {
        byParentKind = "id";
        break;
      }
      if (/^\s*-\s+entity\s*:/.test(l)) {
        byParentKind = "entity";
        break;
      }
      if (lIndent === 0) break;
    }
    if (byParentKind === "entity") return "treeSortingByBy";
    return "treeSortingBy";
  }

  // ============ transitiveLinkages ============
  if (parentKey === "joins" && section === "transitiveLinkages")
    return "transitiveJoin";
  if (parentKey === "search" && section === "transitiveLinkages")
    return "transitiveJoinSearch";

  // ============ uiRules ============
  if (parentKey === "rule" && section === "uiRules") return "uiRuleRule";
  if (parentKey === "context" && section === "uiRules") return "uiRuleContext";
  if (parentKey === "widgets" && section === "uiRules") return "uiRuleWidget";
  if (parentKey === "groups" && section === "uiRules") return "uiRuleGroup";
  if (parentKey === "columns" && section === "uiRules") return "uiRuleColumn";
  if (parentKey === "nested" && section === "uiRules") return "uiRuleNested";
  if (parentKey === "attributes" && section === "uiRules")
    return "uiRuleNestedAttribute";
  if (parentKey === "items" && section === "uiRules") return "uiRuleNestedItem";
  if (parentKey === "props" && section === "uiPresets") return "uiPresetProps";

  // ============ 5. Внутри `- id: ...` — определяем по section и наличию attributes выше ============
  if (parentKey === "id") {
    // NEW: path-based резолв (закрывает transitiveLinkages, trees, dataTypes[].values[],
    // entities[].sorting[], entities[].attributes[] и т.д.)
    const path = findContainerPath(model, position);
    const pathCtx = resolvePathToContext(path);
    if (pathCtx) return pathCtx;
  }

  // NEW: parentKey — не `id`, но parentLine всё равно dash-item opener
  // (`- attribute: X`, `- linkage: Y`, `- widget: Z`, `- tab: T`, `- action: A`).
  // Это 2-я+ строка элемента, который начинается не с `id:`.
  if (parentLine > 0 && parentKey !== "id") {
    const parentText = model.getLineContent(parentLine);
    if (/^\s*-\s+[a-zA-Z_][\w]*\s*:/.test(parentText)) {
      const path = findContainerPath(model, position);
      const pathCtx = resolvePathToContext(findContainerPath(model, position));
      if (pathCtx) return pathCtx;
    }
  }

  if (parentKey === "exchangeSettings") return "exchangeSettings";
  if (parentKey === "attributeFormats") return "exchangeAttributeFormats";
  // entities в exchangeSettings — это объект { <EntityId>: { ... } },
  // поэтому для полей внутри конкретной сущности возвращаем exchangeEntity.
  // parentKey будет равен имени entity (не "entities"), т.к. стек
  // отслеживает ключи. Различим по ancestor "exchangeSettings".
  if (section === "exchangeSettings") {
    // Найти ближайший ancestor с ключом "entities" — тогда это поле внутри сущности
    for (let i = position.lineNumber - 1; i >= 1; i--) {
      const pl = model.getLineContent(i);
      const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
      if (pIndent >= currentIndent) continue;
      const m = pl.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
      if (!m) continue;
      if (m[1] === "entities") return "exchangeEntity";
      if (pIndent === 0) break;
    }
  }

  return null;
}

// ============ Хелпер для поля/сниппета ============

function buildFieldSuggestion(monaco: any, field: FieldDef, range: any): any {
  const isRequired = field.required === true;
  return {
    label: field.name,
    kind: monaco.languages.CompletionItemKind.Field,
    insertText: field.name + ": ",
    filterText: field.name,
    sortText: `${field.priority ?? (isRequired ? 0 : 1)}_${field.name}`,
    detail: `${field.type}${isRequired ? " · required" : ""}`,
    documentation: field.description,
    range,
  };
}

function buildSnippetSuggestion(
  monaco: any,
  snippet: SnippetDef,
  range: any,
  currentIndent: string,
  hasDash: boolean,
): any {
  let body = snippet.body;
  if (hasDash && body.startsWith("- ")) {
    body = body.slice(2);
  }

  const lines = body.split("\n");
  const insertText = lines.map((line) => currentIndent + line).join("\n");

  return {
    label: `✨ ${snippet.prefix}`,
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    filterText: snippet.prefix,
    sortText: SORT.SNIPPET + snippet.prefix,
    detail: snippet.description,
    documentation: `Snippet: ${snippet.description}`,
    range,
  };
}

// ============ Кеш коллекций: пересобираем только при смене ModelIndex/домена ============

interface CollectionsCache {
  indexRef: any;
  domainRef: string | null;
  entities?: SectionRef[];
  linkages?: SectionRef[];
  actions?: SectionRef[];
  sequences?: SectionRef[];
  counterColorPattern?: SectionRef[];
  menus?: SectionRef[];
  uiPresets?: SectionRef[];
  trees?: SectionRef[];
  views?: SectionRef[];
  widgets?: SectionRef[];
  groups?: SectionRef[];
  columns?: SectionRef[];
  /** Ключ — "entity:<fqid>" | "linkage:<id>" | "__unknown__". */
  attributes?: Map<string, RefSuggestion[]>;
  scenarios?: RefSuggestion[];
  joinTargetIndex?: Map<string, { targetFqid: string; linkageFqid: string }>;
}

const _colCache: CollectionsCache = { indexRef: null, domainRef: null };

function ensureCache(): CollectionsCache {
  if (
    _colCache.indexRef !== ctx.modelIndex ||
    _colCache.domainRef !== ctx.currentDomainId
  ) {
    _colCache.indexRef = ctx.modelIndex;
    _colCache.domainRef = ctx.currentDomainId;
    _colCache.entities = undefined;
    _colCache.linkages = undefined;
    _colCache.actions = undefined;
    _colCache.sequences = undefined;
    _colCache.counterColorPattern = undefined;
    _colCache.menus = undefined;
    _colCache.uiPresets = undefined;
    _colCache.trees = undefined;
    _colCache.views = undefined;
    _colCache.widgets = undefined;
    _colCache.groups = undefined;
    _colCache.columns = undefined;
    _colCache.attributes = undefined;
    _colCache.scenarios = undefined;
    _colCache.joinTargetIndex = undefined;
  }
  return _colCache;
}

// Быстрый доступ — каждый lazily
function cachedEntities(): SectionRef[] {
  const c = ensureCache();
  return (c.entities ??= collectSectionRefs(ctx, "entities"));
}
function cachedLinkages(): SectionRef[] {
  const c = ensureCache();
  return (c.linkages ??= collectSectionRefs(ctx, "linkages"));
}
function cachedActions(): SectionRef[] {
  const c = ensureCache();
  return (c.actions ??= collectSectionRefs(ctx, "actions"));
}
function cachedSequences(): SectionRef[] {
  const c = ensureCache();
  return (c.sequences ??= collectSectionRefs(ctx, "sequences"));
}
function cachedCounterColors(): SectionRef[] {
  const c = ensureCache();
  return (c.counterColorPattern ??= collectSectionRefs(
    ctx,
    "counterColorPattern",
  ));
}
function cachedMenus(): SectionRef[] {
  const c = ensureCache();
  return (c.menus ??= collectSectionRefs(ctx, "menus"));
}
function cachedUiPresets(): SectionRef[] {
  const c = ensureCache();
  return (c.uiPresets ??= collectSectionRefs(ctx, "uiPresets"));
}
function cachedTrees(): SectionRef[] {
  const c = ensureCache();
  return (c.trees ??= collectSectionRefs(ctx, "trees"));
}
function cachedViews(): SectionRef[] {
  const c = ensureCache();
  return (c.views ??= collectViewRefs(ctx));
}
function cachedWidgets(): SectionRef[] {
  const c = ensureCache();
  return (c.widgets ??= collectWidgetRefs(ctx));
}
function cachedGroups(): SectionRef[] {
  const c = ensureCache();
  return (c.groups ??= collectGroupRefs(ctx));
}
function cachedColumns(): SectionRef[] {
  const c = ensureCache();
  return (c.columns ??= collectColumnRefs(ctx));
}
function findCurrentDataTypeId(model: any, position: any): string | null {
  const lines = model.getValue().split("\n");
  const currentLine = position.lineNumber - 1; // 0-based

  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind !== 0) continue;
    const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
    if (!sm) continue;
    if (sm[1] === "dataTypes") sectionStart = i;
    else if (sectionStart >= 0) {
      sectionEnd = i;
      break;
    }
  }
  if (
    sectionStart < 0 ||
    currentLine < sectionStart ||
    currentLine >= sectionEnd
  ) {
    return null;
  }

  let itemIndent = -1;
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const dashM = line.match(/^(\s*)-\s+\S/);
    if (dashM) {
      itemIndent = dashM[1].length;
      break;
    }
  }
  if (itemIndent < 0) return null;
  const fieldIndent = itemIndent + 2;

  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const dashM = line.match(/^(\s*)-\s+\S/);
    if (!dashM || dashM[1].length !== itemIndent) continue;

    let itemEnd = sectionEnd;
    for (let j = i + 1; j < sectionEnd; j++) {
      const jLine = lines[j];
      if (!jLine.trim()) continue;
      const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
      const jDash = jLine.match(/^(\s*)-\s+\S/);
      if (jDash && jInd === itemIndent) {
        itemEnd = j;
        break;
      }
    }

    if (currentLine >= i && currentLine < itemEnd) {
      for (let j = i; j < itemEnd; j++) {
        const jLine = lines[j];
        if (!jLine.trim() || jLine.trim().startsWith("#")) continue;
        const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
        if (jInd !== itemIndent && jInd !== fieldIndent) continue;
        const im = jLine.match(/^\s*(?:-\s+)?id\s*:\s*["']?([^\s"'#]+)["']?/);
        if (im) return im[1];
      }
      return null;
    }
    i = itemEnd - 1;
  }
  return null;
}

function getDataTypeStatuses(model: any, position: any): string[] {
  const dtId = findCurrentDataTypeId(model, position);
  if (!dtId) return [];
  const parsed = parseDataTypesFromText(model.getValue());
  return parsed.workflows.get(dtId) || [];
}

/** Строит список атрибутов с учётом контекста сущности. */
function computeAttributesForEntity(
  entityFqid: string | null,
  includeAllDomain: boolean,
): RefSuggestion[] {
  const cur = (ctx.currentDomainId || "").toLowerCase();
  const seen = new Set<string>();
  const out: RefSuggestion[] = [];

  // 1. Системные атрибуты
  SYSTEM_ATTRIBUTES_FOR_COMPLETION.forEach((sys) => {
    seen.add(sys.id);
    out.push({
      label: sys.id,
      insertText: " " + sys.id,
      kind: 0,
      sortText: "0_" + sys.id,
      detail: sys.dataType,
      documentation: sys.description + " · системный",
    });
  });

  const mkDoc = (a: any, contextLabel: string): string => {
    const parts: string[] = [];
    if (a.dataType) parts.push(a.dataType);
    if (a.description) parts.push(a.description);
    if (a.constraints?.length)
      parts.push(`constraints: ${a.constraints.join(", ")}`);
    parts.push(contextLabel);
    return parts.join(" · ");
  };

  const pushAttr = (
    e: any,
    a: any,
    prefix: string,
    contextLabel: string,
  ): void => {
    if (!a?.id || seen.has(a.id)) return;
    seen.add(a.id);
    out.push({
      label: a.id,
      insertText: " " + a.id,
      kind: 0,
      sortText: prefix + a.id,
      detail: contextLabel,
      documentation: mkDoc(a, contextLabel),
    });
    a.nestedAttributes?.forEach((na: any) => {
      if (!na?.id || seen.has(na.id)) return;
      seen.add(na.id);
      out.push({
        label: na.id,
        insertText: " " + na.id,
        kind: 0,
        sortText: "1_" + na.id,
        detail: `table: ${e.entityId}.${a.id}`,
        documentation: mkDoc(na, `table: ${e.entityId}.${a.id}`),
      });
    });
  };

  // 2. Цепочка наследования: self → ancestor
  if (entityFqid && ctx.modelIndex) {
    const start = ctx.modelIndex.entitiesByFqid[entityFqid.toLowerCase()];
    if (start) {
      const chain: any[] = [];
      const visited = new Set<string>();
      let e: any = start;
      while (e && !visited.has(e.fqid)) {
        visited.add(e.fqid);
        chain.push(e);
        e = e.inherits ? ctx.modelIndex.entitiesByFqid[e.inherits] : undefined;
      }
      chain.forEach((e, idx) => {
        const isSelf = idx === 0;
        const prefix = isSelf ? "0_" : "1_";
        const contextLabel = isSelf
          ? `entity: ${e.entityId}`
          : `inherited from ${e.entityId}`;
        e.attributes?.forEach((a: any) => pushAttr(e, a, prefix, contextLabel));
      });
    }
  }

  // 3. Остальные атрибуты домена — только если контекст не определён
  //    или явно попросили (includeAllDomain). SortText 9_ — в самом низу.
  if (includeAllDomain) {
    ctx.modelIndex?.entities?.forEach((e: any) => {
      if ((e.domainId || "").toLowerCase() !== cur) return;
      e.attributes?.forEach((a: any) =>
        pushAttr(e, a, "9_", `entity: ${e.entityId}`),
      );
    });
  }

  return out;
}

function computeAttributesForContext(
  context: AttributeCompletionContext,
): RefSuggestion[] {
  if (context.kind === "precomputed") {
    return context.precomputedItems || [];
  }
  const out: RefSuggestion[] = [];
  const seen = new Set<string>();

  const mkDoc = (a: any, contextLabel: string): string => {
    const parts: string[] = [];
    if (a.dataType) parts.push(a.dataType);
    if (a.description) parts.push(a.description);
    if (a.constraints?.length)
      parts.push(`constraints: ${a.constraints.join(", ")}`);
    parts.push(contextLabel);
    return parts.join(" · ");
  };

  const pushAttr = (
    ownerLabel: string,
    a: any,
    prefix: string,
    contextLabel: string,
  ): void => {
    if (!a?.id || seen.has(a.id)) return;
    seen.add(a.id);
    out.push({
      label: a.id,
      insertText: " " + a.id,
      kind: 0,
      sortText: prefix + a.id,
      detail: contextLabel,
      documentation: mkDoc(a, contextLabel),
    });
    a.nestedAttributes?.forEach((na: any) => {
      if (!na?.id || seen.has(na.id)) return;
      seen.add(na.id);
      out.push({
        label: na.id,
        insertText: " " + na.id,
        kind: 0,
        sortText: "1_" + na.id,
        detail: `table: ${ownerLabel}.${a.id}`,
        documentation: mkDoc(na, `table: ${ownerLabel}.${a.id}`),
      });
    });
  };

  // 1. Собственные + унаследованные (self → ancestors)
  if (context.kind === "entity" && context.entityFqid) {
    const start = ctx.modelIndex?.entitiesByFqid[context.entityFqid];
    if (start) {
      const chain: any[] = [];
      const visited = new Set<string>();
      let e: any = start;
      while (e && !visited.has(e.fqid)) {
        visited.add(e.fqid);
        chain.push(e);
        e = e.inherits ? ctx.modelIndex?.entitiesByFqid[e.inherits] : undefined;
      }
      chain.forEach((e: any, idx: number) => {
        const isSelf = idx === 0;
        const prefix = isSelf ? "0_" : "1_";
        const contextLabel = isSelf
          ? `entity: ${e.entityId}`
          : `inherited from ${e.entityId}`;
        e.attributes?.forEach((a: any) =>
          pushAttr(e.entityId, a, prefix, contextLabel),
        );
      });
    }
  }

  // 2. Атрибуты связи (self)
  if (context.kind === "linkage") {
    (context.linkageAttributes || []).forEach((a: any) =>
      pushAttr(
        context.linkageId || "?",
        a,
        "0_",
        `linkage: ${context.linkageId}`,
      ),
    );
  }

  // 3. Системные — в самом конце (только для entity/linkage)
  if (context.kind === "entity" || context.kind === "linkage") {
    SYSTEM_ATTRIBUTES_FOR_COMPLETION.forEach((sys) => {
      if (seen.has(sys.id)) return;
      seen.add(sys.id);
      out.push({
        label: sys.id,
        insertText: " " + sys.id,
        kind: 0,
        sortText: "2_" + sys.id,
        detail: sys.dataType,
        documentation: sys.description + " · системный",
      });
    });
  }

  // 4. Fallback (unknown-контекст): все атрибуты домена в самом низу
  if (context.kind === "unknown") {
    const cur = (ctx.currentDomainId || "").toLowerCase();
    ctx.modelIndex?.entities?.forEach((e: any) => {
      if ((e.domainId || "").toLowerCase() !== cur) return;
      e.attributes?.forEach((a: any) =>
        pushAttr(e.entityId, a, "9_", `entity: ${e.entityId}`),
      );
    });
    // системные в fallback — тоже внизу, но перед чужими
    SYSTEM_ATTRIBUTES_FOR_COMPLETION.forEach((sys) => {
      if (seen.has(sys.id)) return;
      seen.add(sys.id);
      out.push({
        label: sys.id,
        insertText: " " + sys.id,
        kind: 0,
        sortText: "8_" + sys.id,
        detail: sys.dataType,
        documentation: sys.description + " · системный",
      });
    });
  }

  return out;
}

function unquote(v: string): string {
  const t = v.replace(/\s+#.*$/, "").trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Ищет `fieldName:` среди прямых sibling-полей текущего YAML-блока
 * (например, `join:` рядом с `attribute:` в блоке `- attribute: ...`).
 */
function findSiblingFieldValue(
  model: any,
  position: any,
  fieldName: string,
): string | null {
  const lineCount = model.getLineCount();
  const currentLine = position.lineNumber;
  const lineText = model.getLineContent(currentLine);
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  // Границы текущего `- <key>:` блока
  let blockStart = -1;
  let blockDashIndent = -1;
  for (let i = currentLine; i >= 1; i--) {
    const l = model.getLineContent(i);
    const dashMatch = l.match(/^(\s*)-\s+\S/);
    if (dashMatch && dashMatch[1].length < currentIndent) {
      blockStart = i;
      blockDashIndent = dashMatch[1].length;
      break;
    }
  }
  if (blockStart < 0) return null;

  let blockEnd = lineCount;
  for (let i = blockStart + 1; i <= lineCount; i++) {
    const l = model.getLineContent(i);
    const dashMatch = l.match(/^(\s*)-\s+\S/);
    if (dashMatch && dashMatch[1].length === blockDashIndent) {
      blockEnd = i - 1;
      break;
    }
  }

  const re = /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.+?)\s*$/;
  for (let i = blockStart; i <= blockEnd; i++) {
    const l = model.getLineContent(i);
    const m = l.match(re);
    if (!m) continue;
    if (m[2] !== fieldName) continue;
    return unquote(m[3]);
  }
  return null;
}

/**
 * Идёт вверх по YAML-уровням, ища `fieldName:` в одном из родительских
 * блоков (например, `linkage:` на уровне `- id: widget_xxx`, когда мы
 * находимся в `widgets[].attributes[].attribute:`).
 */
function findAncestorFieldValue(
  model: any,
  position: any,
  fieldName: string,
  maxLevelsUp = 5,
): string | null {
  const lineCount = model.getLineCount();
  const currentLine = position.lineNumber;
  const lineText = model.getLineContent(currentLine);
  let currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  for (let level = 0; level < maxLevelsUp; level++) {
    // Родительский блок: первая строка выше с меньшим indent
    let parentStartLine = -1;
    let parentIndent = -1;
    for (let i = currentLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      if (!l.trim() || l.trim().startsWith("#")) continue;
      const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind < currentIndent) {
        parentStartLine = i;
        parentIndent = ind;
        break;
      }
    }
    if (parentStartLine < 0) return null;

    let parentEndLine = lineCount;
    for (let i = parentStartLine + 1; i <= lineCount; i++) {
      const l = model.getLineContent(i);
      if (!l.trim()) continue;
      const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind <= parentIndent) {
        parentEndLine = i - 1;
        break;
      }
    }

    const re = /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.+?)\s*$/;
    for (let i = parentStartLine; i <= parentEndLine; i++) {
      const l = model.getLineContent(i);
      const m = l.match(re);
      if (!m) continue;
      const ind = m[1].length;
      if (ind !== parentIndent && ind !== parentIndent + 2) continue;
      if (m[2] !== fieldName) continue;
      return unquote(m[3]);
    }

    currentIndent = parentIndent;
  }
  return null;
}

function buildJoinTargetIndex(): Map<
  string,
  { targetFqid: string; linkageFqid: string }
> {
  const map = new Map<string, { targetFqid: string; linkageFqid: string }>();

  const linkageMap = new Map<string, any>();
  for (const l of ctx.modelIndex?.entityLinkages || []) {
    linkageMap.set(`${l.domainId}/${l.id}`.toLowerCase(), l);
  }

  const getChildEntity = (
    linkageFqid: string,
    parentFqid: string,
    side: 1 | 2 | undefined,
  ): string | null => {
    const linkage = linkageMap.get(linkageFqid.toLowerCase());
    if (!linkage) return null;
    const parentLower = parentFqid.toLowerCase();
    const s1 = linkage.side1Fqid;
    const s2 = linkage.side2Fqid;

    if (s1 === s2) return s1 === parentLower ? s2 : null;

    const effectiveSide: 1 | 2 = side === 2 ? 2 : 1;
    const parentSide = effectiveSide === 1 ? s1 : s2;
    const childSide = effectiveSide === 1 ? s2 : s1;
    if (parentSide === parentLower) return childSide;
    if (s1 === parentLower) return s2;
    if (s2 === parentLower) return s1;
    return null;
  };

  const walk = (
    domainId: string,
    parentFqid: string,
    joins: any[] | undefined,
  ): void => {
    if (!joins) return;
    for (const j of joins) {
      if (!j || typeof j !== "object") continue;
      if (typeof j.id !== "string" || !j.id) continue;
      if (typeof j.linkage !== "string" || !j.linkage) continue;
      const linkageFqid = j.linkage.includes("/")
        ? j.linkage.toLowerCase()
        : `${domainId}/${j.linkage}`.toLowerCase();
      const child = getChildEntity(
        linkageFqid,
        parentFqid,
        j.side === 1 || j.side === 2 ? j.side : undefined,
      );
      if (!child) continue;
      const key = `${domainId}#${j.id}`.toLowerCase();
      if (!map.has(key)) map.set(key, { targetFqid: child, linkageFqid });
      walk(domainId, child, j.joins);
    }
  };

  for (const tl of ctx.modelIndex?.transitiveLinkages || []) {
    walk(tl.domainId, tl.entity.toLowerCase(), tl.joins as any[]);
  }
  return map;
}

function findLinkageByRef(
  ref: string,
  currentDomain: string,
): EntityLinkage | null {
  const trimmed = (ref || "").trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  const targetDomain =
    slash > 0
      ? trimmed.slice(0, slash).toLowerCase()
      : currentDomain.toLowerCase();
  const id = slash > 0 ? trimmed.slice(slash + 1) : trimmed;
  return (
    (ctx.modelIndex?.entityLinkages || []).find(
      (l) => (l.domainId || "").toLowerCase() === targetDomain && l.id === id,
    ) || null
  );
}

/**
 * Резолвит join-id (list-view legacy `source.joins[]`) в FQID
 * «противоположной» сущности от `source.entity` этого view.
 */
function resolveJoinTargetFqid(
  joinId: string,
  viewId: string | null,
  currentDomain: string,
): string | null {
  if (!joinId) return null;

  // (1) legacy view.source.joins — как в linter.ts (приоритет первый)
  if (viewId) {
    const srcJoin = (ctx.modelIndex?.viewSourceJoins || []).find(
      (j) =>
        j.domainId.toLowerCase() === currentDomain &&
        j.viewId === viewId &&
        j.id === joinId,
    );
    if (srcJoin) {
      const lk = findLinkageByRef(srcJoin.linkage, currentDomain);
      const schema = ctx.modelIndex?.schemasByDomain?.[currentDomain];
      const viewItem = schema?.sections?.views?.items?.find(
        (v) => v.id === viewId,
      );
      const sourceEntity = viewItem?.sourceEntity;
      if (lk && sourceEntity) {
        const srcFqid = sourceEntity.includes("/")
          ? sourceEntity.toLowerCase()
          : `${currentDomain}/${sourceEntity}`.toLowerCase();
        if (lk.side1Fqid === srcFqid) return lk.side2Fqid;
        if (lk.side2Fqid === srcFqid) return lk.side1Fqid;
      }
    }
  }

  // (2) transitiveLinkages (глобально; приоритет — текущий домен)
  const c = ensureCache();
  if (!c.joinTargetIndex) {
    c.joinTargetIndex = buildJoinTargetIndex();
  }
  const direct = c.joinTargetIndex.get(
    `${currentDomain}#${joinId}`.toLowerCase(),
  );
  if (direct) return direct.targetFqid;

  // (3) fallback: join-id из другого домена (редко, но по docs возможно)
  const suffix = `#${joinId.toLowerCase()}`;
  for (const [k, v] of c.joinTargetIndex) {
    if (k.endsWith(suffix)) return v.targetFqid;
  }
  return null;
}

/**
 * Внутри `widget`-а определяет, в каком из его «содержательных» полей
 * находится cursor:
 *   - "attributes"       — legacy `widgets[].attributes[].attribute`
 *                          (массив атрибутов связи)
 *   - "control.columns"  — `widgets[].control.columns[].attribute`
 *                          (атрибут связанной сущности)
 *   - null               — не в этих полях
 */
function detectWidgetFieldContainer(
  model: any,
  position: any,
): "attributes" | "control.columns" | null {
  const lineText = model.getLineContent(position.lineNumber);
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  let sawColumns = false;

  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const l = model.getLineContent(i);
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= currentIndent) continue;

    const trimmed = l.trim();
    if (/^columns\s*:\s*$/.test(trimmed)) {
      sawColumns = true;
      continue;
    }
    if (/^attributes\s*:\s*$/.test(trimmed)) {
      return sawColumns ? "control.columns" : "attributes";
    }
    if (/^[a-zA-Z_][\w]*\s*:/.test(trimmed)) {
      // Другой контейнер — если уже прошли columns, значит это control.columns
      return sawColumns ? "control.columns" : null;
    }
  }
  return sawColumns ? "control.columns" : null;
}

/** Противоположная сторона связи widget.linkage относительно view.entity. */
function computeOppositeEntityForWidget(
  widget: any,
  viewId: string | null,
  currentDomain: string,
): string | null {
  if (!viewId || !widget?.linkage) return null;
  const schema = ctx.modelIndex?.schemasByDomain?.[currentDomain];
  const viewItem = schema?.sections?.views?.items?.find((v) => v.id === viewId);
  const viewEntityRaw = viewItem?.entity || viewItem?.sourceEntity;
  if (!viewEntityRaw) return null;

  const viewFqid = String(viewEntityRaw).includes("/")
    ? String(viewEntityRaw).toLowerCase()
    : `${currentDomain}/${viewEntityRaw}`.toLowerCase();

  const lk = findLinkageByRef(widget.linkage, currentDomain);
  return computeOppositeEntityForLinkage(lk, viewFqid);
}

/** Резолвит FQID сущности для строки YAML (self/inherits-aware). */
function detectEntityFqidForPosition(model: any, position: any): string | null {
  const cur = (ctx.currentDomainId || "").toLowerCase();
  if (!cur || !ctx.lineMap || !ctx.modelIndex) return null;

  const lineCtx = ctx.lineMap.lineContexts.get(position.lineNumber);
  if (!lineCtx) return null;

  // 1. Прямой контекст сущности (entities[])
  if (lineCtx.entityId) {
    return `${cur}/${lineCtx.entityId}`.toLowerCase();
  }

  const schema = ctx.modelIndex.schemasByDomain?.[cur];
  if (!schema) return null;

  // 2. Контекст top-level view
  const viewCrumb = lineCtx.breadcrumbs.find((b) => b.type === "view");
  if (viewCrumb) {
    const viewItem = schema.sections.views.items?.find(
      (v) => v.id === viewCrumb.id,
    );
    const viewEntity = viewItem?.entity || viewItem?.sourceEntity;
    if (viewEntity) {
      return viewEntity.includes("/")
        ? viewEntity.toLowerCase()
        : `${cur}/${viewEntity}`.toLowerCase();
    }
  }

  // 3. Контекст dataRule
  const drCrumb = lineCtx.breadcrumbs.find((b) => b.type === "dataRule");
  if (drCrumb) {
    const drItem = ctx.modelIndex.dataRules.find(
      (r: any) =>
        (r.domainId || "").toLowerCase() === cur && r.id === drCrumb.id,
    );
    if (drItem?.entity) return drItem.entity;
  }

  // 4. Контекст action
  const actCrumb = lineCtx.breadcrumbs.find((b) => b.type === "action");
  if (actCrumb) {
    const actItem = ctx.modelIndex.actions.find(
      (a: any) =>
        (a.domainId || "").toLowerCase() === cur && a.id === actCrumb.id,
    );
    if (actItem?.entity) return actItem.entity;
  }

  return null;
}

/**
 * Определяет, к чему относится поле `attribute:` в текущей позиции.
 *
 * Приоритет:
 *   1. linkаge-контекст (linkages[].sorting[].by[].attribute) → linkage.attributes
 *   2. entity-контекст (widgets[].attribute, columns[].attribute,
 *      searching[].attribute, sorting[].by[].attribute, projection[], …)
 *   3. unknown (fallback) — все атрибуты домена
 */
function detectAttributeCompletionContext(
  model: any,
  position: any,
): AttributeCompletionContext | null {
  const cur = (ctx.currentDomainId || "").toLowerCase();
  if (!cur || !ctx.lineMap || !ctx.modelIndex) {
    return { kind: "unknown" };
  }

  const lineCtx = ctx.lineMap.lineContexts.get(position.lineNumber);
  if (!lineCtx) return { kind: "unknown" };

  // 1. linkages[].sorting[].by[].attribute — linkage как «self»
  const lkCrumb = lineCtx.breadcrumbs.find((b) => b.type === "linkage");
  if (lkCrumb) {
    const lk = findLinkageByRef(lkCrumb.id, cur);
    return {
      kind: "linkage",
      linkageId: lkCrumb.id,
      linkageAttributes: lk?.attributes || [],
    };
  }

  // 2. filter.linkages.use[].link_attributes[] / linkedEntity[]
  const filterCtx = detectFilterLinkageContext(model, position, lineCtx);
  if (filterCtx) {
    if (filterCtx.mode === "link_attributes") {
      if (filterCtx.linkageRecord) {
        return {
          kind: "linkage",
          linkageId: filterCtx.linkageRecord.id,
          linkageAttributes: filterCtx.linkageRecord.attributes || [],
        };
      }
      return null;
    }
    if (filterCtx.joinTargetFqid) {
      return { kind: "entity", entityFqid: filterCtx.joinTargetFqid };
    }
    if (filterCtx.linkageRecord && filterCtx.viewEntityFqid) {
      const opposite = computeOppositeEntityForLinkage(
        filterCtx.linkageRecord,
        filterCtx.viewEntityFqid,
      );
      if (opposite) return { kind: "entity", entityFqid: opposite };
    }
    return null;
  }

  // 3. NEW (B4.1): prefixRules[].source.key/value
  const prefixCtx = detectPrefixRuleSourceContext(model, position, cur);
  if (prefixCtx) return prefixCtx;

  // 4. NEW (B4.2): uiRule.widgets[].nested.attributes[].attribute
  const uiRuleNestedCtx = detectUiRuleNestedAttributeContext(
    model,
    position,
    lineCtx,
  );
  if (uiRuleNestedCtx) return uiRuleNestedCtx;

  // 5. sibling join: → target entity
  const siblingJoin = findSiblingFieldValue(model, position, "join");
  if (siblingJoin) {
    const viewCrumb = lineCtx.breadcrumbs.find((b) => b.type === "view");
    const targetFqid = resolveJoinTargetFqid(
      siblingJoin,
      viewCrumb?.id || null,
      cur,
    );
    if (targetFqid) return { kind: "entity", entityFqid: targetFqid };
  }

  // 6. widget.type=linkage
  const widgetCrumb = lineCtx.breadcrumbs.find((b) => b.type === "widget");
  if (widgetCrumb) {
    const vCrumb = lineCtx.breadcrumbs.find((b) => b.type === "view");
    const widget = (ctx.modelIndex.viewWidgets || []).find(
      (w: any) =>
        w.id === widgetCrumb.id && (!vCrumb || w.parentViewId === vCrumb.id),
    );
    if (widget?.type === "linkage" && widget.linkage) {
      const container = detectWidgetFieldContainer(model, position);
      if (container === "attributes") {
        const lk = findLinkageByRef(widget.linkage, cur);
        return {
          kind: "linkage",
          linkageId: lk?.id || widget.linkage,
          linkageAttributes: lk?.attributes || [],
        };
      }
      if (container === "control.columns") {
        const owning = resolveOwningEntityFqid(
          vCrumb?.id || "",
          cur,
          ctx.modelIndex,
        );
        const opposite = resolveLinkageTargetEntityFqid(
          widget.linkage,
          owning,
          cur,
          ctx.modelIndex,
        );
        if (opposite) return { kind: "entity", entityFqid: opposite };
      }
    }
  }

  // 7. ancestor linkage
  const ancestorLinkage = findAncestorFieldValue(model, position, "linkage");
  if (ancestorLinkage) {
    const lk = findLinkageByRef(ancestorLinkage, cur);
    if (lk) {
      return {
        kind: "linkage",
        linkageId: lk.id,
        linkageAttributes: lk.attributes || [],
      };
    }
  }

  // 8. NEW (B4.3/B4.4): tree-filter[].entity
  const filterEntityFqid = findFilterEntityFqid(model, position, cur);
  if (filterEntityFqid) {
    return { kind: "entity", entityFqid: filterEntityFqid };
  }

  // 9. entity crumb (list-view source.entity)
  const entityFqid = detectEntityFqidForPosition(model, position);
  if (entityFqid) return { kind: "entity", entityFqid };

  return { kind: "unknown" };
}

interface FilterLinkageContext {
  mode: "link_attributes" | "linkedEntity";
  linkageRecord: any | null;
  joinTargetFqid: string | null;
  viewEntityFqid: string | null;
}

/**
 * Возвращает FQID сущности для tree-view filter-блока:
 *   views[type=tree].table.filter[i].entity
 * Для list-view (filter: без entity:) — возвращает null.
 * Для любого не-views контекста — null.
 */
function findFilterEntityFqid(
  model: any,
  position: any,
  currentDomain: string,
): string | null {
  const lineText = model.getLineContent(position.lineNumber);
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const l = model.getLineContent(i);
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= currentIndent) continue;
    const trimmed = l.trim();

    // `- entity:` / `entity:` — tree-filter
    const em = trimmed.match(/^(?:-\s+)?entity\s*:\s*(.+?)\s*$/);
    if (em) {
      const v = unquote(em[1]);
      return v.includes("/")
        ? v.toLowerCase()
        : `${currentDomain}/${v}`.toLowerCase();
    }

    // `filter:` на list-уровне — сущности нет, дальше не ищем
    if (/^filter\s*:\s*$/.test(trimmed)) return null;

    // вышли за пределы filter/table — стоп
    if (/^(table|source|views?)\s*:/.test(trimmed)) return null;
  }
  return null;
}

/**
 * cursor внутри `prefixRules[].source.key:` или `source.value:` →
 * контекст = сущность из sibling `source.entity`.
 */
function detectPrefixRuleSourceContext(
  model: any,
  position: any,
  cur: string,
): AttributeCompletionContext | null {
  const lineText = model.getLineContent(position.lineNumber);

  // Мы точно в поле key: или value:?
  if (!/^\s*(key|value)\s*:/.test(lineText)) return null;

  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  // Ищем `source:` на меньшем indent
  let sourceBlockIndent = -1;
  let sourceBlockStart = -1;
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const l = model.getLineContent(i);
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= currentIndent) continue;
    const trimmed = l.trim();
    if (/^source\s*:\s*$/.test(trimmed)) {
      sourceBlockStart = i;
      sourceBlockIndent = ind;
      break;
    }
    if (/^[a-zA-Z_][\w]*\s*:/.test(trimmed)) return null;
  }
  if (sourceBlockStart < 0) return null;

  // Ищем `entity:` внутри source-блока
  for (let i = sourceBlockStart + 1; i <= model.getLineCount(); i++) {
    const l = model.getLineContent(i);
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind <= sourceBlockIndent) break;
    const trimmed = l.trim();
    const em = trimmed.match(/^(?:-\s+)?entity\s*:\s*(.+?)\s*$/);
    if (em) {
      const v = unquote(em[1]);
      const fqid = v.includes("/")
        ? v.toLowerCase()
        : `${cur}/${v}`.toLowerCase();
      return { kind: "entity", entityFqid: fqid };
    }
  }
  return null;
}

/**
 * cursor внутри `uiRule.widgets[].nested.attributes[].attribute:` →
 * колонки Table-атрибута, на который ссылается sibling `widget:`.
 */
function detectUiRuleNestedAttributeContext(
  model: any,
  position: any,
  lineCtx: any,
): AttributeCompletionContext | null {
  const cur = (ctx.currentDomainId || "").toLowerCase();
  if (!cur || !ctx.modelIndex) return null;

  // Мы в uiRule? (breadcrumb, не текстовый walk — надёжнее)
  const uiRuleCrumb = lineCtx.breadcrumbs.find((b: any) => b.type === "uiRule");
  if (!uiRuleCrumb) return null;

  // Убеждаемся, что cursor именно в nested.attributes[]
  const lineText = model.getLineContent(position.lineNumber);
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  let container: "attributes" | "other" | null = null;
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const l = model.getLineContent(i);
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= currentIndent) continue;
    const trimmed = l.trim();

    if (/^attributes\s*:\s*$/.test(trimmed)) {
      container = "attributes";
      break;
    }
    if (/^(widget|nested|columns|groups|widgets)\s*:/.test(trimmed)) {
      container = "other";
      break;
    }
  }
  if (container !== "attributes") return null;

  // Резолвим uiRule → view → entity
  const uiRule = ctx.modelIndex.uiRules.find(
    (r: any) =>
      (r.domainId || "").toLowerCase() === cur && r.id === uiRuleCrumb.id,
  );
  if (!uiRule || !uiRule.view) return null;

  const schema = ctx.modelIndex.schemasByDomain?.[cur];
  const viewItem = schema?.sections?.views?.items?.find(
    (v) => v.id === uiRule.view,
  );
  const viewEntityRaw = viewItem?.entity || viewItem?.sourceEntity;
  if (!viewEntityRaw) return null;

  const entityFqid = String(viewEntityRaw).includes("/")
    ? String(viewEntityRaw).toLowerCase()
    : `${cur}/${viewEntityRaw}`.toLowerCase();

  // Sibling `widget:` (в том же `- widget:`-блоке)
  const widgetId = findAncestorFieldValue(model, position, "widget");
  if (!widgetId) return null;

  const widget = (ctx.modelIndex.viewWidgets || []).find(
    (w: any) => w.id === widgetId && w.parentViewId === uiRule.view,
  );
  if (!widget?.attribute) return null;

  // Резолвим атрибут через цепочку наследования
  const startEntity = ctx.modelIndex.entitiesByFqid[entityFqid];
  if (!startEntity) return null;

  let attr: any = null;
  const visited = new Set<string>();
  let e: any = startEntity;
  while (e && !visited.has(e.fqid)) {
    visited.add(e.fqid);
    const hit = e.attributes.find((a: any) => a.id === widget.attribute);
    if (hit) {
      attr = hit;
      break;
    }
    e = e.inherits ? ctx.modelIndex.entitiesByFqid[e.inherits] : undefined;
  }
  if (!attr?.nestedAttributes || attr.nestedAttributes.length === 0) {
    return null;
  }

  const items: RefSuggestion[] = [];
  const seen = new Set<string>();
  attr.nestedAttributes.forEach((na: any) => {
    if (!na?.id || seen.has(na.id)) return;
    seen.add(na.id);
    const parts: string[] = [];
    if (na.dataType) parts.push(na.dataType);
    if (na.description) parts.push(na.description);
    parts.push(`column of ${attr.id}`);
    items.push({
      label: String(na.id),
      insertText: " " + String(na.id),
      kind: 0,
      sortText: "0_" + String(na.id),
      detail: `column of ${attr.id}`,
      documentation: parts.join(" · "),
    });
  });

  if (items.length === 0) return null;

  return { kind: "precomputed", precomputedItems: items };
}

function detectFilterLinkageContext(
  model: any,
  position: any,
  lineCtx: any,
): FilterLinkageContext | null {
  const cur = (ctx.currentDomainId || "").toLowerCase();
  if (!cur) return null;

  const viewCrumb = lineCtx.breadcrumbs.find((b: any) => b.type === "view");
  if (!viewCrumb) return null;

  // 1. Определяем контейнер
  const lineText = model.getLineContent(position.lineNumber);
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  let container: "link_attributes" | "linkedEntity" | null = null;
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const l = model.getLineContent(i);
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= currentIndent) continue;
    const trimmed = l.trim();
    if (/^link_attributes\s*:\s*$/.test(trimmed)) {
      container = "link_attributes";
      break;
    }
    if (/^linkedEntity\s*:\s*$/.test(trimmed)) {
      container = "linkedEntity";
      break;
    }
    // вышли из filter-структуры, не встретив целевой контейнер
    return null;
  }
  if (!container) return null;

  // 2. Sibling linkage / join
  const linkageRef = findSiblingFieldValue(model, position, "linkage");
  const joinRef = !linkageRef
    ? findSiblingFieldValue(model, position, "join")
    : null;

  const linkageRecord = linkageRef ? findLinkageByRef(linkageRef, cur) : null;
  const joinTargetFqid = joinRef
    ? resolveJoinTargetFqid(joinRef, viewCrumb.id, cur)
    : null;

  // 3. Определяем viewEntityFqid:
  //    a) tree-режим — filter[].entity;
  //    b) list-режим — view.source.entity.
  let viewEntityFqid: string | null = null;

  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const l = model.getLineContent(i);
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= currentIndent) continue;

    const trimmed = l.trim();

    // `- entity:` / `entity:` — tree-filter
    const em = trimmed.match(/^(?:-\s+)?entity\s*:\s*(.+?)\s*$/);
    if (em) {
      const v = unquote(em[1]);
      viewEntityFqid = v.includes("/")
        ? v.toLowerCase()
        : `${cur}/${v}`.toLowerCase();
      break;
    }

    // `filter:` — значит tree-item ещё не встретили → list
    if (/^(?:-\s+)?filter\s*:\s*$/.test(trimmed)) break;

    // `table:` / `source:` — стоп
    if (/^(?:-\s+)?(table|source)\s*:/.test(trimmed)) break;
  }

  if (!viewEntityFqid) {
    const schema = ctx.modelIndex?.schemasByDomain?.[cur];
    const viewItem = schema?.sections?.views?.items?.find(
      (v) => v.id === viewCrumb.id,
    );
    const src = viewItem?.sourceEntity || viewItem?.entity;
    if (src) {
      const s = String(src);
      viewEntityFqid = s.includes("/")
        ? s.toLowerCase()
        : `${cur}/${s}`.toLowerCase();
    }
  }

  return {
    mode: container,
    linkageRecord,
    joinTargetFqid,
    viewEntityFqid,
  };
}

function computeOppositeEntityForLinkage(
  linkageRecord: any,
  viewFqid: string,
): string | null {
  if (!linkageRecord || !viewFqid) return null;
  const v = viewFqid.toLowerCase();
  if ((linkageRecord.side1Fqid || "").toLowerCase() === v)
    return linkageRecord.side2Fqid || null;
  if ((linkageRecord.side2Fqid || "").toLowerCase() === v)
    return linkageRecord.side1Fqid || null;
  return null;
}

function cachedAttributes(
  context: AttributeCompletionContext,
): RefSuggestion[] {
  // precomputed — не кэшируем: список зависит от конкретного widget+attribute,
  // а не только от entity/linkage.
  if (context.kind === "precomputed") {
    return computeAttributesForContext(context);
  }
  const c = ensureCache();
  if (!c.attributes) c.attributes = new Map();
  const key =
    context.kind === "entity"
      ? `entity:${context.entityFqid}`
      : context.kind === "linkage"
        ? `linkage:${context.linkageId}`
        : "__unknown__";
  if (c.attributes.has(key)) return c.attributes.get(key)!;
  const result = computeAttributesForContext(context);
  c.attributes.set(key, result);
  return result;
}

function cachedScenarios(): RefSuggestion[] {
  const c = ensureCache();
  if (c.scenarios) return c.scenarios;

  const seen = new Set<string>();
  const out: RefSuggestion[] = [];

  (ctx.modelIndex?.scenarios || []).forEach((s: any) => {
    if (!s?.id || seen.has(s.id)) return;
    seen.add(s.id);

    const actions: Array<{
      domainId?: string;
      actionId?: string;
      actionName?: string;
      workerTag?: string;
    }> = Array.isArray(s.actions) ? s.actions : [];
    const domains: string[] = Array.isArray(s.domains) ? s.domains : [];

    const details: string[] = [];
    details.push(
      `${actions.length} ${actions.length === 1 ? "экшен" : "экшенов"}`,
    );
    if (domains.length > 0) details.push(`домены: ${domains.join(", ")}`);

    if (actions.length > 0) {
      details.push("---");
      for (const a of actions.slice(0, 20)) {
        const where = a.domainId ? `[${a.domainId}] ` : "";
        const tag = a.workerTag ? ` · worker: ${a.workerTag}` : "";
        const name = a.actionName || a.actionId || "";
        const id =
          a.actionId && a.actionName && a.actionId !== a.actionName
            ? ` (${a.actionId})`
            : "";
        details.push(`${where}${name}${id}${tag}`);
      }
      if (actions.length > 20) {
        details.push(`… и ещё ${actions.length - 20}`);
      }
    }

    out.push({
      label: s.id,
      insertText: " " + s.id,
      kind: 0, // Kind будет переустановлен через withKind
      sortText: "0_" + s.id,
      detail: `${actions.length} actions${domains.length ? " · " + domains.join(", ") : ""}`,
      documentation: details.join("\n"),
    });
  });

  c.scenarios = out;
  return out;
}

// Кеш `Kind` — перезаписывается при первом обращении, если needed
const withKindCache = new WeakMap<
  RefSuggestion[],
  Map<number, RefSuggestion[]>
>();

function withKind(items: RefSuggestion[], kind: number): RefSuggestion[] {
  let byKind = withKindCache.get(items);
  if (!byKind) {
    byKind = new Map();
    withKindCache.set(items, byKind);
  }
  let cached = byKind.get(kind);
  if (cached) return cached;
  cached = items.map((x) => ({ ...x, kind }));
  byKind.set(kind, cached);
  return cached;
}

// ============ RQL: определение контекста и предложения ============

const RQL_FIELDS = new Set(["expression", "constraint", "condition"]);

/** Курсор внутри RQL? */
function isInsideRql(model: any, position: any): boolean {
  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);

  // Случай 1: на текущей строке — `field: !rql ...`
  const fm = beforeCursor.match(/^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
  if (fm) {
    const fieldName = fm[2];
    const rawValue = fm[3];

    // Явный YAML-тег !rql
    if (/!rql\b/.test(rawValue)) return true;

    // Поля, где по спецификации RQL всегда (если не литерал)
    if (RQL_FIELDS.has(fieldName)) {
      const trimmedNoComment = rawValue.split("#")[0].trim();
      // `condition: true` / `false` — литерал, не RQL
      if (/^(true|false)$/i.test(trimmedNoComment)) return false;
      // Пустое или частично набранное значение — тоже RQL-контекст
      return true;
    }
  }

  // Случай 2: block scalar `field: !rql |` или `field: |`, где field ∈ RQL_FIELDS
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim()) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;

    if (pIndent < currentIndent) {
      const bm = pl.match(
        /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(!rql\s+)?[|>]/,
      );
      if (bm) {
        const fieldName = bm[2];
        if (bm[3] || RQL_FIELDS.has(fieldName)) return true;
      }
      return false;
    }

    if (pIndent === 0) return false;
  }
  return false;
}

// ============ RQL: @root.member ============

/** Сканирует токен назад от курсора, включая `@` и `.`. */
function scanRqlToken(
  model: any,
  position: any,
): { startColumn: number; tokenText: string } {
  const lineText = model.getLineContent(position.lineNumber);
  const col = position.column - 1; // 0-based позиция курсора
  let i = col;
  while (i > 0) {
    const ch = lineText[i - 1];
    // пробел, скобки, операторы, кавычки, точка с запятой — стоп
    if (/\s/.test(ch)) break;
    if ("(),[]{}!|&+*\/:;\"'".indexOf(ch) >= 0) break;
    // `=` `<` `>` — тоже стоп (сравнения)
    if (ch === "=" || ch === "<" || ch === ">" || ch === "%") break;
    // минус — стоп (арифметика), кроме случая, когда он внутри числа;
    // для RQL-алиасов минус не встречается — упрощаем.
    if (ch === "-") break;
    i--;
  }
  return {
    startColumn: i + 1, // 1-based
    tokenText: lineText.slice(i, col),
  };
}

/** Члены для @root: null — «не знаю», пустой массив — «нет членов». */
function getRqlAliasMembers(
  root: string,
  ctx: ProviderContext,
): Array<{ label: string; detail?: string; documentation?: string }> | null {
  if (root === "doc") {
    // Все атрибуты всех сущностей текущего домена (плоско).
    const cur = (ctx.currentDomainId || "").toLowerCase();
    const seen = new Set<string>();
    const out: Array<{
      label: string;
      detail?: string;
      documentation?: string;
    }> = [];

    // Системные атрибуты — всегда доступны.
    for (const sys of [
      ["id", "Системный: идентификатор объекта"],
      ["label", "Системный: лейбл объекта"],
      ["createdAt", "Системный: дата создания"],
      ["updatedAt", "Системный: дата изменения"],
      ["createdBy", "Системный: кто создал"],
      ["updatedBy", "Системный: кто обновил"],
      ["organizationId", "Системный: организация"],
      ["version", "Системный: версия объекта"],
      ["domainId", "Системный: домен"],
      ["entityId", "Системный: сущность"],
    ] as const) {
      seen.add(sys[0]);
      out.push({ label: sys[0], detail: sys[1] });
    }

    ctx.modelIndex?.entities?.forEach((e: any) => {
      if ((e.domainId || "").toLowerCase() !== cur) return;
      e.attributes?.forEach((a: any) => {
        if (!a?.id || seen.has(a.id)) return;
        seen.add(a.id);
        const parts: string[] = [];
        if (a.dataType) parts.push(a.dataType);
        if (a.description) parts.push(a.description);
        parts.push(`entity: ${e.entityId}`);
        out.push({
          label: a.id,
          detail: parts.join(" · "),
        });
        a.nestedAttributes?.forEach((na: any) => {
          if (!na?.id || seen.has(na.id)) return;
          seen.add(na.id);
          out.push({
            label: na.id,
            detail: `${na.dataType || ""} · table: ${e.entityId}.${a.id}`,
          });
        });
      });
    });
    return out;
  }

  if (root === "row") {
    // Колонки из Table-атрибутов текущего домена (плоско).
    const cur = (ctx.currentDomainId || "").toLowerCase();
    const seen = new Set<string>();
    const out: Array<{ label: string; detail?: string }> = [];
    ctx.modelIndex?.dataTypes?.forEach((dt: any) => {
      if ((dt.domainId || "").toLowerCase() !== cur) return;
      if (dt.kind !== "Table") return;
      (dt.columns || []).forEach((c: string) => {
        if (seen.has(c)) return;
        seen.add(c);
        out.push({ label: c, detail: `колонка Table ${dt.id}` });
      });
    });
    return out;
  }

  if (root === "CurrentUser") {
    return [
      { label: "id", detail: "Идентификатор текущего пользователя" },
      { label: "username", detail: "Имя текущего пользователя" },
    ];
  }

  if (
    root === "CurrentDate" ||
    root === "CurrentTime" ||
    root === "CurrentTimestamp" ||
    root === "CurrentDateTime" ||
    root === "CurrentDayOfWeek" ||
    root === "index"
  ) {
    return [];
  }

  // @enumX / @workflowX — из dataTypes текущего домена
  const cur = (ctx.currentDomainId || "").toLowerCase();
  const dt = ctx.modelIndex?.dataTypes?.find(
    (d: any) => (d.domainId || "").toLowerCase() === cur && d.id === root,
  );
  if (dt) {
    if (dt.kind === "Enum" && Array.isArray(dt.values)) {
      return (dt.values as string[]).map((v) => ({
        label: v,
        detail: `значение Enum ${dt.id}`,
      }));
    }
    if (dt.kind === "Workflow" && Array.isArray(dt.statuses)) {
      return (dt.statuses as string[]).map((s) => ({
        label: s,
        detail: `статус Workflow ${dt.id}`,
      }));
    }
  }

  return null;
}

/** Список предложений для @root[.prefix]. */
function buildRqlAliasCompletions(
  model: any,
  position: any,
  Kind: any,
  ctx: ProviderContext,
): { suggestions: any[] } | null {
  const { startColumn, tokenText } = scanRqlToken(model, position);
  if (!tokenText.startsWith("@")) return null;

  const dot = tokenText.indexOf(".");
  const root = dot < 0 ? tokenText.slice(1) : tokenText.slice(1, dot);
  const prefix = "@" + root;
  const afterDot = dot >= 0 ? tokenText.slice(dot + 1) : "";

  const members = getRqlAliasMembers(root, ctx);

  const range = {
    startLineNumber: position.lineNumber,
    startColumn,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };

  const suggestions: any[] = [];

  // Если root известен — предлагаем его члены @root.<member>.
  if (members && members.length > 0) {
    for (const m of members) {
      const full = prefix + "." + m.label;
      suggestions.push({
        label: full,
        insertText: full,
        filterText: full,
        sortText: "0_" + m.label,
        kind: Kind.Field,
        detail: m.detail,
        documentation: m.documentation,
        range,
      });
    }
    // Если курсор стоит сразу после точки (@doc.|), root уже не нужен в списке.
    // Если пользователь только начал набирать @doc (без точки) — добавим
    // и сам @doc в конце, чтобы не мешал.
    if (dot < 0 && afterDot === "") {
      // Только @root введено: предложим и сам @root как fallback
      // (например, для сравнения `@CurrentUser = @doc.createdBy`).
      suggestions.push({
        label: prefix,
        insertText: prefix,
        filterText: prefix,
        sortText: "9_" + prefix,
        kind: Kind.Variable,
        detail: "псевдоним целиком",
        range,
      });
    }
    return { suggestions };
  }

  // Root неизвестен — общий список RQL-конструкций.
  return { suggestions: buildRqlSuggestions(model, position, Kind, ctx) };
}

/** Список RQL-конструкций для автокомплита. */
function buildRqlSuggestions(
  model: any,
  position: any,
  Kind: any,
  ctx: ProviderContext,
): any[] {
  const word = model.getWordUntilPosition(position);
  const range = {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn,
  };

  const out: any[] = [];
  const push = (
    label: string,
    kind: number,
    detail: string,
    sortText?: string,
  ) => {
    out.push({
      label,
      kind,
      insertText: label,
      filterText: label,
      sortText: sortText ?? label,
      detail,
      documentation: detail,
      range,
    });
  };

  // ---- Псевдонимы объектов (без точки — чтобы не ломать range на `.`) ----
  const aliases: Array<[string, string]> = [
    ["@doc", "Текущий объект (сущность, к которой применяется правило)"],
    ["@row", "Текущая строка таблицы (для атрибутов типа Table)"],
    ["@index", "Индекс элемента массива / строки таблицы"],
    ["@CurrentUser", "Объект текущего пользователя"],
    ["@CurrentDate", "Текущая дата"],
    ["@CurrentTime", "Текущее время"],
    ["@CurrentTimestamp", "Текущая метка времени"],
    ["@CurrentDateTime", "Текущая дата-время"],
    ["@CurrentDayOfWeek", "Название текущего дня недели (en)"],
  ];
  aliases.forEach(([a, d]) => push(a, Kind.Variable, d, "0_" + a));

  // ---- Функции (верхний уровень RQL) ----
  const functions: Array<[string, string]> = [
    ["has", "has(array, value) — есть ли value в поле-массиве"],
    ["hasAll", "hasAll(array, values) — все значения массива присутствуют"],
    ["hasAny", "hasAny(array, values) — хотя бы одно значение"],
    ["hasRole", "hasRole('roleName') — текущий пользователь имеет роль"],
    [
      "hasUserGroup",
      "hasUserGroup('groupName') — пользователь входит в группу",
    ],
    ["isSuperAdmin", "isSuperAdmin() — текущий пользователь — суперадмин"],
    ["select", "select(expr, from(...), where(...), ...)"],
    ["from", "from('current', @entity, @alias)"],
    ["join", "join('domain', @entity, @alias, on(...))"],
    ["where", "where(condition)"],
    ["group", "group(field, ...)"],
    ["having", "having(aggregate_condition)"],
    ["order", "order(asc(field) | desc(field))"],
    ["limit", "limit(N)"],
    ["and", "and(a, b)"],
    ["or", "or(a, b)"],
    ["not", "not(a)"],
    ["eq", "eq(a, b) — a = b"],
    ["ne", "ne(a, b) — a ≠ b"],
    ["lt", "lt(a, b) — a < b"],
    ["gt", "gt(a, b) — a > b"],
    ["lte", "lte(a, b) — a ≤ b"],
    ["gte", "gte(a, b) — a ≥ b"],
    ["like", "like(a, 'pattern') — шаблон LIKE"],
    ["in", "in(a, b) — вхождение во множество"],
    ["cast", "CAST(value, 'TYPE') — приведение типа"],
    ["count", "count(expr) — агрегат"],
  ];
  functions.forEach(([a, d]) => push(a, Kind.Function, d, "1_" + a));

  // ---- Операторы и литералы ----
  const ops: Array<[string, string]> = [
    ["true", "логическое true"],
    ["false", "логическое false"],
    ["AND", "логическое И"],
    ["OR", "логическое ИЛИ"],
    ["NOT", "логическое НЕ"],
    ["IN", "вхождение в множество"],
    ["NOT IN", "не входит во множество"],
    ["IS NULL", "значение не задано"],
    ["IS NOT NULL", "значение задано"],
    ["LIKE", "поиск по шаблону"],
    ["NOT LIKE", "не соответствует шаблону"],
    ["BETWEEN", "нахождение в диапазоне"],
    ["NOT BETWEEN", "вне диапазона"],
  ];
  ops.forEach(([a, d]) => push(a, Kind.Keyword, d, "2_" + a));

  return out;
}

function buildListValueCompletion(
  model: any,
  position: any,
  fieldNames: string[],
  values: RefSuggestion[],
  Kind: any,
): { suggestions: any[] } | null {
  const beforeCursor = model
    .getLineContent(position.lineNumber)
    .slice(0, position.column - 1);
  const fieldAlt = fieldNames
    .map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (
    !new RegExp(`^\\s*(?:-\\s+)?(?:${fieldAlt})\\s*:\\s*["']?`).test(
      beforeCursor,
    )
  ) {
    return null;
  }
  const wordAtPos = model.getWordUntilPosition(position);
  const range = {
    startLineNumber: position.lineNumber,
    startColumn: wordAtPos.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: wordAtPos.endColumn,
  };
  return {
    suggestions: values.map((v) => ({
      label: v.label,
      kind: v.kind ?? Kind.Value,
      insertText: v.insertText.replace(/^ /, ""), // без ведущего пробела
      filterText: v.label,
      sortText: v.sortText,
      detail: v.detail,
      documentation: mdDoc(v.documentation),
      range,
    })),
  };
}

export function registerMonacoProviders(monaco: any): void {
  if (providersRegistered) return;
  providersRegistered = true;

  // === Регистрируем прямую команду для Quick Fix (обходит баг WorkspaceEdit) ===
  if (!(monaco.editor as any).__dgApplyEditRegistered) {
    (monaco.editor as any).__dgApplyEditRegistered = true;
    monaco.editor.registerCommand(
      "dg-apply-edit",
      (_accessor: any, args: any) => {
        const editors = monaco.editor.getEditors();
        if (!editors || editors.length === 0) return;
        const editor = editors.find((e: any) => e.hasTextFocus()) || editors[0];
        if (!editor) return;

        editor.executeEdits("quickfix", [
          {
            range: {
              startLineNumber: args.startLineNumber,
              startColumn: args.startColumn,
              endLineNumber: args.endLineNumber,
              endColumn: args.endColumn,
            },
            text: args.text,
          },
        ]);
        editor.focus();
      },
    );
  }

  monaco.languages.registerDocumentSymbolProvider("yaml", {
    provideDocumentSymbols: (model: any) => {
      if (!ctx.lineMap) return [];
      try {
        return buildSymbols(monaco, ctx.lineMap);
      } catch {
        return [];
      }
    },
  });

  monaco.languages.registerDefinitionProvider("yaml", {
    provideDefinition: (model: any, position: any) =>
      provideDefinition(monaco, model, position),
  });

  monaco.languages.registerHoverProvider("yaml", {
    provideHover: (model: any, position: any) => {
      try {
        if (!ctx.modelIndex) return null;
        const lineText = model.getLineContent(position.lineNumber);
        const hit = findWordAtLine(lineText, position.column);
        if (!hit) return null;

        const buildRange = () => ({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: lineText.length + 1,
        });

        // ========== linkage — до entity/dataType, потому что id linkage
        // может совпасть с id entity (case-insensitive) ==========
        if (hit.field === "linkage") {
          const targetDomain =
            hit.domainPrefix || (ctx.currentDomainId || "").toLowerCase();
          const linkage = (ctx.modelIndex?.entityLinkages || []).find(
            (l) =>
              (l.domainId || "").toLowerCase() === targetDomain &&
              l.id.toLowerCase() === hit.value.toLowerCase(),
          );
          if (linkage) {
            return {
              range: buildRange(),
              contents: [
                { value: buildLinkageHoverMarkdown(linkage, ctx.modelIndex!) },
              ],
            };
          }
          return null; // linkage не найдена — не падать в entity-hover
        }

        // ========== dataType — превью типа данных ==========
        if (hit.type === "ref-datatype") {
          const dt = ctx.modelIndex.dataTypes.find(
            (d: any) => d.id === hit.value,
          );
          if (!dt) {
            // Не нашли dataType — возможно, это базовый тип
            const base = [
              "String",
              "Integer",
              "Decimal",
              "Float",
              "Bool",
              "Uuid",
              "Timestamp",
              "Date",
              "Time",
              "TimestampRange",
              "Text",
              "MAC",
              "IpAddress",
              "CIDR",
              "URL",
              "Attachment",
              "Identifier",
              "Counter",
              "Calculation",
              "Configuration",
              "Variable",
              "RQL",
              "Automation",
              "Reference",
              "Array",
              "Table",
              "Enum",
              "Workflow",
            ];
            if (base.includes(hit.value)) {
              return {
                range: buildRange(),
                contents: [{ value: `**${hit.value}** — базовый тип` }],
              };
            }
            return null;
          }

          const contents: any[] = [];
          contents.push({
            value: `**${dt.id}**${dt.name && dt.name !== dt.id ? ` — ${dt.name}` : ""}`,
          });
          if (dt.kind) contents.push({ value: `Тип: \`${dt.kind}\`` });
          if (dt.values && dt.values.length > 0) {
            const shown = dt.values.slice(0, 25);
            contents.push({
              value:
                `**Значения** (${dt.values.length}): ` +
                shown.map((v: string) => `\`${v}\``).join(", ") +
                (dt.values.length > 25 ? "…" : ""),
            });
          }
          if (dt.statuses && dt.statuses.length > 0) {
            const shown = dt.statuses.slice(0, 25);
            contents.push({
              value:
                `**Статусы** (${dt.statuses.length}): ` +
                shown.map((v: string) => `\`${v}\``).join(", ") +
                (dt.statuses.length > 25 ? "…" : ""),
            });
          }
          if (dt.columns && dt.columns.length > 0) {
            contents.push({
              value: `**Колонки** (${dt.columns.length}): ${dt.columns.slice(0, 15).join(", ")}`,
            });
          }
          return { range: buildRange(), contents };
        }

        // ========== Все виды ссылок на сущность ==========
        // id-def, ref-entity, ref-item (локальные), ref-fqid-foreign (внешние)
        const isEntityLike =
          hit.type === "id-def" ||
          hit.type === "ref-entity" ||
          hit.type === "ref-item" ||
          hit.type === "ref-fqid-foreign";

        if (isEntityLike) {
          // ── id-def: различаем entity id и attribute id по lineContexts ──
          if (hit.type === "id-def") {
            const lc = ctx.lineMap?.lineContexts.get(position.lineNumber);
            const crumbs = lc?.breadcrumbs || [];
            // Атрибут: последний crumb — attribute, entity выше
            const attrCrumb = crumbs.find(
              (b) => b.type === "attribute" && b.line === position.lineNumber,
            );
            const entityId = lc?.entityId;
            if (attrCrumb && entityId && ctx.modelIndex) {
              const curDomain = (ctx.currentDomainId || "").toLowerCase();
              const entity =
                ctx.modelIndex.entitiesByFqid[
                  `${curDomain}/${entityId}`.toLowerCase()
                ] ||
                (ctx.modelIndex.entities || []).find(
                  (e: any) =>
                    e.entityId.toLowerCase() === entityId.toLowerCase(),
                );
              if (entity) {
                const attr = findAttrInEntityChain(
                  entity,
                  hit.value,
                  ctx.modelIndex,
                );
                if (attr) {
                  return {
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: 1,
                      endLineNumber: position.lineNumber,
                      endColumn:
                        model.getLineContent(position.lineNumber).length + 1,
                    },
                    contents: [
                      {
                        value: buildAttributeHoverMarkdown(
                          entity,
                          attr,
                          ctx.modelIndex,
                        ),
                      },
                    ],
                  };
                }
              }
              return null;
            }
            // иначе — обычный entity id, идём дальше по существующей ветке
          }

          let entity: any = null;

          // Пытаемся найти сущность по нескольким сценариям
          if (hit.fqid) {
            // ref-entity / ref-fqid-foreign — есть полный fqid
            entity = ctx.modelIndex.entitiesByFqid[hit.fqid.toLowerCase()];
          }
          if (!entity) {
            // ref-item (локальная ссылка вроде `inherits: Device`)
            // или id-def
            const currentDomain = (ctx.currentDomainId || "").toLowerCase();
            const candidate = `${currentDomain}/${hit.value}`.toLowerCase();
            entity = ctx.modelIndex.entitiesByFqid[candidate];
          }
          if (!entity) {
            // Последний фоллбэк — ищем по entityId по всем доменам (на случай если ссылка на другой домен без префикса)
            const target = hit.value.toLowerCase();
            entity = (ctx.modelIndex.entities || []).find(
              (e: any) => e.entityId.toLowerCase() === target,
            );
          }

          if (!entity) return null;

          if (entity) {
            return {
              range: buildRange(),
              contents: [
                { value: buildEntityHoverMarkdown(entity, ctx.modelIndex) },
              ],
            };
          }
        }

        if (hit.type === "ref-attribute" && hit.attributePart) {
          const index = ctx.modelIndex;

          // Если entityPart не задан явно (атрибут без точки — `attribute: name`) —
          // берём сущность из контекста курсора (entities[].id → атрибут → ...).
          let entity: any = null;
          if (hit.entityPart) {
            if (hit.domainPrefix) {
              entity =
                index.entitiesByFqid[
                  `${hit.domainPrefix}/${hit.entityPart}`.toLowerCase()
                ];
            }
            if (!entity) {
              const curDomain = (ctx.currentDomainId || "").toLowerCase();
              entity =
                index.entitiesByFqid[
                  `${curDomain}/${hit.entityPart}`.toLowerCase()
                ];
            }
            if (!entity) {
              entity = (index.entities || []).find(
                (e: any) =>
                  e.entityId.toLowerCase() === hit.entityPart!.toLowerCase(),
              );
            }
          } else {
            const lc = ctx.lineMap?.lineContexts.get(position.lineNumber);
            const entityId = lc?.entityId || null;
            if (!entityId) return null;

            const curDomain = (ctx.currentDomainId || "").toLowerCase();
            entity =
              index.entitiesByFqid[`${curDomain}/${entityId}`.toLowerCase()];
            if (!entity) {
              // fallback: сущность могла быть в другом домене (кросс-доменный
              // uiRule/dataRule контекст) — ищем по entityId
              entity = (index.entities || []).find(
                (e: any) => e.entityId.toLowerCase() === entityId.toLowerCase(),
              );
            }
          }

          if (!entity) return null;

          const attr = findAttrInEntityChain(entity, hit.attributePart, index);
          if (!attr) return null;

          return {
            range: buildRange(),
            contents: [
              { value: buildAttributeHoverMarkdown(entity, attr, index) },
            ],
          };
        }

        return null;
      } catch {
        return null;
      }
    },
  });

  // Once — глобальный command
  if (!(monaco.editor as any).__dgCommandRegistered) {
    (monaco.editor as any).__dgCommandRegistered = true;
    monaco.editor.registerCommand(
      "dg-issue-action",
      (_accessor: any, payload: any) => {
        document.dispatchEvent(
          new CustomEvent("dg:issue-action", { detail: payload }),
        );
      },
    );
  }

  monaco.languages.registerCodeActionProvider(
    "yaml",
    {
      provideCodeActions: (model: any, range: any, context: any) => {
        const actions: any[] = [];
        const seenTitles = new Set<string>();
        const addActionOnce = (action: any) => {
          if (seenTitles.has(action.title)) return;
          seenTitles.add(action.title);
          actions.push(action);
        };

        context.markers.forEach((marker: any) => {
          const source = String(marker.source || "");
          if (source !== "dg-linter" && source !== "attribute-validator")
            return;

          // ── Единая точка: тот же buildQuickFix, что и в Fix all ──
          const fix = buildQuickFix(marker, model);
          if (fix) {
            let title = "🛠️ Исправить";
            if (fix.kind === "camelcase") {
              const newId = fix.edits[0]?.text || "";
              title = newId
                ? `🐫 Переименовать в «${newId}»`
                : "🐫 Исправить именование";
            } else if (fix.kind === "label") {
              title = '🏷️ Добавить label: "{id}"';
            } else if (fix.kind === "description") {
              title = '📝 Добавить description: ""';
            }

            addActionOnce({
              title,
              kind: "quickfix",
              diagnostics: [marker],
              isPreferred: true,
              command: {
                id: "dg-apply-edit",
                title: "Apply",
                arguments: [fix.edits[0]],
              },
            });
          }

          // ── Стандартные действия для каждого маркера ──
          addActionOnce({
            title: "📖 Показать справку по правилу",
            kind: "quickfix",
            diagnostics: [marker],
            command: {
              id: "dg-issue-action",
              title: "Show help",
              arguments: [{ action: "help", message: marker.message }],
            },
          });

          addActionOnce({
            title: "🔬 Открыть линтер схем",
            kind: "quickfix",
            diagnostics: [marker],
            command: {
              id: "dg-issue-action",
              title: "Open lint",
              arguments: [{ action: "open-lint", message: marker.message }],
            },
          });
        });

        return { actions, dispose: () => {} };
      },
    },
    {
      providedCodeActionKinds: [
        (monaco.languages as any).CodeActionKind?.QuickFix || "quickfix",
      ],
    },
  );

  monaco.languages.registerCompletionItemProvider("yaml", {
    triggerCharacters: [":", "/", " ", ".", "-"],
    provideCompletionItems: (model: any, position: any) => {
      const raw = ((): { suggestions: any[] } | null => {
        if (!ctx.modelIndex) return null;
        const Kind = monaco.languages.CompletionItemKind;

        //setTimeout(ensureSuggestDetailsVisible, 30);

        // ============ RQL-контекст: только RQL-конструкции ============
        // ============ RQL-контекст ============
        if (isInsideRql(model, position)) {
          // Сначала пробуем @root.member
          const aliasResult = buildRqlAliasCompletions(
            model,
            position,
            Kind,
            ctx,
          );
          if (aliasResult) return aliasResult;
          // Общий RQL-список
          return {
            suggestions: buildRqlSuggestions(model, position, Kind, ctx),
          };
        }

        // ============ Далее — обычная YAML-логика ============

        // ============ searching[]: массив атрибутов ============
        // Поддерживаем две формы:
        //   A. Канонично:   searching: [{ attribute: <cursor> }, ...]
        //   B. Legacy/docs: searching: { attributes: [<cursor>, ...] }
        {
          const lineText0 = model.getLineContent(position.lineNumber);
          const before0 = lineText0.slice(0, position.column - 1);

          const inSearching = (currentIndent: number): boolean => {
            for (let i = position.lineNumber - 1; i >= 1; i--) {
              const l = model.getLineContent(i);
              if (!l.trim() || l.trim().startsWith("#")) continue;
              const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
              if (lIndent >= currentIndent) continue;
              const trimmed = l.trim();
              if (/^searching\s*:\s*$/.test(trimmed)) return true;
              // любой другой ключ на меньшем отступе — вышли из searching
              if (/^[a-zA-Z_][\w]*\s*:/.test(trimmed)) return false;
              if (lIndent === 0) return false;
            }
            return false;
          };

          const buildSuggestions = (): { suggestions: any[] } | null => {
            const context = detectAttributeCompletionContext(model, position);
            if (!context) return null;
            const wordAtPos0 = model.getWordUntilPosition(position);
            const range0 = {
              startLineNumber: position.lineNumber,
              startColumn: wordAtPos0.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: wordAtPos0.endColumn,
            };
            const attrs = cachedAttributes(context);
            if (attrs.length === 0) return null;
            return {
              suggestions: attrs.map((v) => ({
                label: v.label,
                kind: Kind.Field,
                insertText: v.label,
                filterText: v.label,
                sortText: v.sortText,
                detail: v.detail,
                documentation: v.documentation,
                range: range0,
              })),
            };
          };

          // A. Каноничная форма: `- attribute: <cursor>`
          const mA = before0.match(/^(\s*)-\s+attribute\s*:\s*(.*)$/);
          if (mA) {
            if (inSearching(mA[1].length)) return buildSuggestions();
          }

          // B. Legacy: `- <cursor>` внутри `searching.attributes:`
          const mB = before0.match(/^(\s*)-\s+([\w]*)$/);
          if (mB) {
            const currentIndent = mB[1].length;
            let sawAttributes = false;
            for (let i = position.lineNumber - 1; i >= 1; i--) {
              const l = model.getLineContent(i);
              if (!l.trim() || l.trim().startsWith("#")) continue;
              const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
              const trimmed = l.trim();
              if (trimmed.startsWith("-")) continue;
              if (lIndent > currentIndent) continue;
              if (!sawAttributes && /^attributes\s*:/.test(trimmed)) {
                sawAttributes = true;
                continue;
              }
              if (sawAttributes && /^searching\s*:/.test(trimmed)) {
                return buildSuggestions();
              }
              if (lIndent < currentIndent) break;
            }
          }
        }

        const lineText = model.getLineContent(position.lineNumber);
        const beforeCursor = lineText.slice(0, position.column - 1);
        const wordAtPos = model.getWordUntilPosition(position);
        const cur = (ctx.currentDomainId || "").toLowerCase();

        // === 1. Проверяем, value ли это (`field: value`) ===
        const fieldMatch = beforeCursor.match(
          /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*["']?[^"'\n]*["']?$/,
          // /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*["']?[\w./-]*["']?$/,
        );

        // === 2. Если НЕ value — field-name / root / snippets ===
        if (!fieldMatch) {
          const lineIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

          if (
            lineIndent === 0 &&
            /^[a-zA-Z_][a-zA-Z0-9_]*\s*$/.test(beforeCursor)
          ) {
            const rootItems = [
              ["id", "Уникальный идентификатор домена (FQDN)"],
              ["name", "Название домена"],
              ["version", "Версия схемы (SemVer)"],
              ["type", "Тип элемента экспертизы (domain)"],
              ["description", "Описание домена"],
              ["status", "Статус схемы"],
              ["date", "Дата схемы"],
              ["tags", "Теги"],
              ["author", "Автор схемы"],
              ["entities", "Сущности домена"],
              ["dataTypes", "Кастомные типы (Enum, Workflow, Table)"],
              ["linkages", "Связи сущностей"],
              ["sequences", "Последовательности для Identifier"],
              ["counterColorPatterns", "Цветовые схемы счётчиков"],
              ["trees", "Древовидные связи"],
              ["transitiveLinkages", "Транзитивные связи"],
              ["mixins", "Примеси"],
              ["dataRules", "Правила данных"],
              ["exchangeSettings", "Настройки импорта и экспорта объектов"],
              ["actions", "Действия"],
              ["medias", "Иконки"],
              ["views", "Представления"],
              ["widgets", "Доменные виджеты (для дашбордов)"],
              ["menus", "Меню домена"],
              ["permissions", "Разрешения действий и доступа к данным"],
              [
                "accessRules",
                "Правила доступа (scope create/edit/view/delete/launch)",
              ],
              ["localizations", "Локализации"],
              ["uiRules", "UI Rules"],
              ["uiPresets", "UI Presets"],
            ] as const;
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            };
            return {
              suggestions: rootItems.map(([id, desc]) => ({
                label: id,
                kind: Kind.Module,
                insertText: id + ":",
                filterText: id,
                sortText: id,
                detail: desc,
                range,
              })),
            };
          }

          // === exchangeSettings.entities → <EntityId>: (ключ = id сущности домена) ===
          // `entities:` — карта, а не массив. Пока пользователь не набрал `:`,
          // подсказываем id сущностей текущего домена.
          {
            const path = findContainerPath(model, position);
            if (
              path.length === 2 &&
              path[0] === "exchangeSettings" &&
              path[1] === "entities"
            ) {
              const cur = (ctx.currentDomainId || "").toLowerCase();
              const seen = new Set<string>();
              const suggestions: any[] = [];
              const wordAtPos = model.getWordUntilPosition(position);
              const range = {
                startLineNumber: position.lineNumber,
                startColumn: wordAtPos.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: wordAtPos.endColumn,
              };
              ctx.modelIndex?.entities?.forEach((e: any) => {
                if ((e.domainId || "").toLowerCase() !== cur) return;
                if (seen.has(e.entityId)) return;
                seen.add(e.entityId);
                const parts: string[] = [];
                if (e.name && e.name !== e.entityId) parts.push(e.name);
                parts.push(`${e.attributes.length} атр.`);
                suggestions.push({
                  label: e.entityId,
                  kind: Kind.Class,
                  insertText: e.entityId + ":",
                  filterText: e.entityId,
                  sortText: "0_" + e.entityId,
                  detail: parts.join(" · "),
                  documentation: mdDoc(e.description),
                  range,
                });
              });
              if (suggestions.length > 0) return { suggestions };
            }
          }

          const context = detectContextAtPosition(
            model,
            position,
            ctx.lineMap?.lineContexts || new Map(),
          );
          if (!context) return null;

          const rawIndent = (lineText.match(/^(\s*)/) || ["", ""])[1];
          const currentIndent = "  ".repeat(Math.floor(rawIndent.length / 2));
          const hasDash = /^\s*-/.test(beforeCursor);
          const suggestions: any[] = [];
          const snippetRange = {
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: wordAtPos.endColumn,
          };
          SNIPPETS.forEach((sn) => {
            if (sn.contexts.includes(context)) {
              suggestions.push(
                buildSnippetSuggestion(
                  monaco,
                  sn,
                  snippetRange,
                  currentIndent,
                  hasDash,
                ),
              );
            }
          });
          const fields =
            FIELD_DEFINITIONS[context] ??
            FIELD_DEFINITIONS[context.replace(/List$/, "")];
          if (fields) {
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: wordAtPos.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: wordAtPos.endColumn,
            };
            fields.forEach((f) =>
              suggestions.push(buildFieldSuggestion(monaco, f, range)),
            );
          }
          return suggestions.length > 0 ? { suggestions } : null;
        }

        // === 3. Value — switch по fieldName, СБОР ТОЛЬКО НУЖНОГО ===
        const fieldName = fieldMatch[2];

        // Guard: value-completion поддерживается только для полей из KNOWN_VALUE_FIELDS
        // и BOOLEAN_FIELD_NAMES. Для `name:`, `description:`, `label:` и прочих
        // свободных полей сразу выходим — не запускаем O(N) разбор контекста.
        if (
          !BOOLEAN_FIELD_NAMES.has(fieldName) &&
          !KNOWN_VALUE_FIELDS.has(fieldName)
        ) {
          return null;
        }

        const vctxRaw = getCachedValueContext(model, position);
        const pathItemType = computeItemTypeFromPath(model, position);

        // Приоритет: path-based, КРОМЕ мест, где detectValueContext уточняет
        // через widget.type (единственный «динамический» путь на сегодня).
        // Такие пути — whitelist.
        const pathStr = findContainerPath(model, position).join(".");
        const DYNAMIC_PATHS = new Set<string>([
          "views.widgets.control", // control.type зависит от widget.type
        ]);

        const effectiveItemType =
          DYNAMIC_PATHS.has(pathStr) && vctxRaw.itemType
            ? vctxRaw.itemType
            : (pathItemType ?? vctxRaw.itemType ?? "");

        const vctx = { ...vctxRaw, itemType: effectiveItemType };

        const r = buildValueCompletion; // сокращение
        // ============ Boolean-поля: только true / false ============
        if (BOOLEAN_FIELD_NAMES.has(fieldName)) {
          return r(
            model,
            position,
            [fieldName],
            mkSimple(["true", "false"], Kind.Value, {
              true: "логическое true",
              false: "логическое false",
            }),
            Kind,
          );
        }

        switch (fieldName) {
          case "iconName": {
            // Только внутри medias[] — иначе iconName может быть чем-то другим
            const path = findContainerPath(model, position);
            if (path[0] !== "medias" && vctx.section !== "medias") {
              return null;
            }
            // Частые иконки — сверху через префикс sortText
            const POPULAR = new Set([
              "Add",
              "Edit",
              "Trash",
              "Eye",
              "Save",
              "Close",
              "Refresh",
              "Search",
              "Filter",
              "Settings",
              "Folder",
              "File",
              "FileText",
              "Download",
              "Upload",
              "Menu",
              "MoreVertical",
              "Check",
              "Alert",
              "Info",
              "User",
              "Users",
              "Group",
              "Link",
              "List",
              "Dashboard",
              "Server",
              "Cloud",
              "Lock",
              "Shield",
              "Bug",
              "Rocket",
              "StarFilled",
              "StarUnfilled",
              "Play",
              "Pause",
            ]);
            return r(
              model,
              position,
              ["iconName"],
              COMMON_ICON_NAMES.map(([name, desc]) => ({
                label: name,
                insertText: " " + name,
                kind: Kind.Value,
                sortText: (POPULAR.has(name) ? "0_" : "1_") + name,
                documentation: desc,
              })),
              Kind,
            );
          }
          case "initial": {
            if (vctx.section !== "dataTypes") return null;
            const statuses = getDataTypeStatuses(model, position);
            if (statuses.length === 0) return null;
            return r(
              model,
              position,
              ["initial"],
              mkSimple(statuses, Kind.EnumMember, {
                ...statuses.reduce(
                  (acc, s) => ({ ...acc, [s]: `Статус workflow` }),
                  {},
                ),
              }),
              Kind,
            );
          }
          case "from":
          case "to": {
            // Только внутри dataTypes[].transitions[]
            if (vctx.section !== "dataTypes") return null;
            if (vctx.container !== "transitions") return null;
            const statuses = getDataTypeStatuses(model, position);
            const items = ["*", ...statuses];
            return r(
              model,
              position,
              ["from", "to"],
              mkSimple(items, Kind.Value, {
                "*": "Любой статус",
              }),
              Kind,
            );
          }
          // ---------- dataType ----------
          case "dataType": {
            // NEW: drag_drop_area.context.dataType
            if (vctx.itemType === "viewWidgetDragDropContext") {
              return r(
                model,
                position,
                ["dataType"],
                mkSimple(["Array", "Attachment", "Table"], Kind.Value, {
                  Array: "Массив вложений",
                  Attachment: "Одно вложение",
                  Table: "Таблица вложений",
                }),
                Kind,
              );
            }

            if (vctx.section === "dataTypes" && vctx.itemType === "dataType") {
              return r(
                model,
                position,
                ["dataType"],
                mkSimple(["Enum", "Table", "Workflow"], Kind.Value, {
                  Enum: "Перечисление — фиксированный список значений",
                  Table: "Таблица — структурированные данные (строки/колонки)",
                  Workflow: "Рабочий процесс — статусы и переходы",
                }),
                Kind,
              );
            }
            const base: RefSuggestion[] = BASE_DATA_TYPES_COMPLETION.map(
              (t) => ({
                label: t,
                insertText: " " + t,
                kind: Kind.Value,
                sortText: "0_" + t,
                documentation: BASE_DATA_TYPE_DESCRIPTIONS[t],
              }),
            );
            const custom: RefSuggestion[] = [];
            const seen = new Set<string>();
            ctx.modelIndex.dataTypes
              .filter((dt: any) => (dt.domainId || "").toLowerCase() === cur)
              .forEach((dt: any) => {
                if (!dt?.id || seen.has(dt.id)) return;
                seen.add(dt.id);
                const parts: string[] = [];
                if (dt.kind) parts.push(dt.kind);
                if (dt.description) parts.push(dt.description);
                if (dt.kind === "Enum" && typeof dt.valuesCount === "number")
                  parts.push(`${dt.valuesCount} значений`);
                if (
                  dt.kind === "Workflow" &&
                  typeof dt.statusesCount === "number"
                )
                  parts.push(`${dt.statusesCount} статусов`);
                if (
                  dt.kind === "Table" &&
                  typeof dt.attributesCount === "number"
                )
                  parts.push(`${dt.attributesCount} колонок`);
                custom.push({
                  label: dt.id,
                  insertText: " " + dt.id,
                  kind:
                    dt.kind === "Enum"
                      ? Kind.Enum
                      : dt.kind === "Workflow"
                        ? Kind.Interface
                        : Kind.Struct,
                  sortText: "1_" + dt.id,
                  documentation: parts.join(" · "),
                });
              });
            return (
              r(model, position, ["dataType"], [...base, ...custom], Kind) || {
                suggestions: [],
              }
            );
          }

          // ---------- type ----------
          case "type": {
            const map: Record<
              string,
              { list: string[]; desc?: Record<string, string> }
            > = {
              view: {
                list: [
                  "entity",
                  "list",
                  "tree",
                  "tabs_list",
                  "dashboard",
                  "dashboard_tree",
                ],
              },
              viewNested: { list: ["panel", "modal", "page"] },
              widget: {
                list: Object.keys(WIDGET_TYPE_DESCRIPTIONS),
                desc: WIDGET_TYPE_DESCRIPTIONS,
              },
              group: {
                list: ["block", "form", "tab", "tabs", "resizable_block_pair"],
              },
              action: {
                list: Object.keys(ACTION_TYPE_DESCRIPTIONS),
                desc: ACTION_TYPE_DESCRIPTIONS,
              },
              linkage: { list: ["1_1", "1_n", "n_n"] },
              dataType: { list: ["Enum", "Table", "Workflow"] },
              tree: { list: ["ordinary", "orderable", "multiparent"] },
              viewWidgetControl: {
                list: Object.keys(CONTROL_TYPE_DESCRIPTIONS),
                desc: CONTROL_TYPE_DESCRIPTIONS,
              },
              viewWidgetLinkageControl: {
                list: ["select", "multi_select", "table", "list", "tree"],
              },
              reconciliationMergeStrategy: {
                list: RECONCILIATION_MERGE_STRATEGIES.map(([t]) => t),
                desc: RECONCILIATION_MERGE_LABELS,
              },
              menu: {
                list: ["root_group", "root_menu"],
                desc: {
                  root_group: "Раздел с подразделами (левое меню)",
                  root_menu: "Отдельный пункт в главном меню",
                },
              },
              menuItem: {
                list: ["menu"],
                desc: { menu: "Подраздел в группе" },
              },
              media: {
                list: ["icon_name", "data"],
                desc: {
                  icon_name: "Иконка из дизайн-системы",
                  data: "Base64-строка",
                },
              },
              viewTableColumnControl: {
                list: Object.keys(CONTROL_TYPE_DESCRIPTIONS),
                desc: CONTROL_TYPE_DESCRIPTIONS,
              },
              treeNodeType: {
                list: ["root", "branch", "leaf"],
                desc: {
                  root: "Корень дерева вложения",
                  branch: "Ветка дерева вложения",
                  leaf: "Лист дерева вложения",
                },
              },
              viewDashboardLayout: {
                list: ["grid"],
                desc: { grid: "Расположение виджетов сеткой" },
              },
              // ============ NEW: bulk-edit (без bulkSettings) ============
              actionAttributes: {
                list: ["specific"],
                desc: {
                  specific: "Редактирование только перечисленных атрибутов",
                },
              },
              actionLinkages: {
                list: ["specific"],
                desc: {
                  specific:
                    "Редактирование только перечисленных виджетов связей",
                },
              },

              // ============ NEW: bulkSettings (tree_bulk) ============
              actionBulkSettingsAttributes: {
                list: ["all", "specific"],
                desc: {
                  all: "Редактирование всех атрибутов сущности",
                  specific: "Редактирование только перечисленных атрибутов",
                },
              },
              actionBulkSettingsLinkages: {
                list: ["all", "specific"],
                desc: {
                  all: "Редактирование во всех виджетах связей",
                  specific: "Редактирование только перечисленных виджетов",
                },
              },
            };
            const entry = map[vctx.itemType];
            return entry
              ? r(
                  model,
                  position,
                  ["type"],
                  mkSimple(entry.list, Kind.Value, entry.desc),
                  Kind,
                )
              : null;
          }

          // ---------- effect ----------
          case "effect": {
            let list: string[] | null = null;
            if (vctx.itemType === "dataRuleRule")
              list = ["hidden", "readonly", "required", "default", "allowed"];
            else if (vctx.itemType === "uiRuleRule")
              list = [
                "hidden",
                "show",
                "hiddenEmpty",
                "readonly",
                "editable",
                "inherit",
                "variant",
              ];
            return list
              ? r(
                  model,
                  position,
                  ["effect"],
                  mkSimple(list, Kind.Value, EFFECT_DESCRIPTIONS),
                  Kind,
                )
              : null;
          }

          // ---------- target ----------
          case "target": {
            let list: string[] | null = null;
            if (vctx.itemType === "dataRule")
              list = ["entity", "entityAttribute", "linkage"];
            else if (vctx.itemType === "uiRule")
              list = ["list_view", "entity_view", "entity_attribute"];
            else if (vctx.itemType === "accessRule")
              list = [
                "entity",
                "action",
                "linkage",
                "any_entity",
                "any_action",
                "any_linkage",
              ];
            return list
              ? r(
                  model,
                  position,
                  ["target"],
                  mkSimple(list, Kind.Value, TARGET_DESCRIPTIONS),
                  Kind,
                )
              : null;
          }

          case "direction": {
            let list: string[] | null = null;
            if (vctx.container === "layout") list = ["column", "row"];
            else if (
              vctx.itemType === "sortingByItem" ||
              vctx.container === "by" ||
              vctx.container === "defaults"
            )
              list = ["asc", "desc"];
            return list
              ? r(
                  model,
                  position,
                  ["direction"],
                  mkSimple(list, Kind.Value, {
                    column: "Вертикальное размещение",
                    asc: "По возрастанию",
                    desc: "По убыванию",
                  }),
                  Kind,
                )
              : null;
          }
          case "mode":
            return vctx.container === "search"
              ? r(
                  model,
                  position,
                  ["mode"],
                  mkSimple(["entity", "linkage", "both"], Kind.Value, {
                    entity: "Искать по атрибутам связанной сущности",
                    linkage: "Искать по атрибутам связи",
                    both: "Искать и по сущности, и по связи",
                  }),
                  Kind,
                )
              : null;
          case "placement":
            return r(
              model,
              position,
              ["placement"],
              mkSimple(["top", "settings"], Kind.Value, {
                top: "Главное меню",
                settings: "Раздел Настройки",
              }),
              Kind,
            );
          case "defaultViewMode": {
            return r(
              model,
              position,
              ["defaultViewMode"],
              mkSimple(["cola", "horizontal", "vertical"], Kind.Value, {
                cola: "Центральное упорядочивание",
                horizontal: "Горизонтально",
                vertical: "Вертикально",
              }),
              Kind,
            );
          }
          case "defaultGroupMode": {
            return r(
              model,
              position,
              ["defaultGroupMode"],
              mkSimple(["cluster", "byEntity"], Kind.Value, {
                cluster: "Кластерная группировка",
                byEntity: "Группировка по сущности",
              }),
              Kind,
            );
          }
          case "operation": {
            const actionType = findActionTypeForModel(
              model,
              position.lineNumber,
            );
            const opMap: Record<string, string[]> = {
              open_modal: ["create", "edit"],
              open_page: ["create", "edit", "view"],
              bulk: ["remove", "edit", "edit_attribute", "import", "export"],
              tree_bulk: ["edit", "remove"],
            };
            const list = actionType ? opMap[actionType] : null;
            return list
              ? r(
                  model,
                  position,
                  ["operation"],
                  mkSimple(list, Kind.Value, {
                    create: "Создать объект",
                    edit: "Редактировать объект",
                    view: "Просмотреть объект",
                    remove: "Удалить объект",
                    edit_attribute: "Изменить атрибут",
                    import: "Импортировать",
                    export: "Экспортировать",
                  }),
                  Kind,
                )
              : null;
          }
          case "page": {
            const actionType = findActionTypeForModel(
              model,
              position.lineNumber,
            );
            const allowed = ["open_list", "open_tree", "open_view"];
            if (actionType && allowed.includes(actionType)) {
              return r(
                model,
                position,
                ["page"],
                mkSimple(["blank", "current"], Kind.Value, {
                  blank: "Отобразить в отдельном окне",
                  current: "Отобразить в текущем окне",
                }),
                Kind,
              );
            }
            return null;
          }
          case "side": {
            return r(
              model,
              position,
              ["side"],
              mkSimple(["1", "2"], Kind.Value, {
                "1": "Первая сторона",
                "2": "Вторая сторона",
              }),
              Kind,
            );
          }

          // ---------- entity refs ----------
          case "iconColor": {
            if (
              vctx.container === "graphView" ||
              (vctx.section === "linkages" && vctx.container === "view")
            ) {
              return r(
                model,
                position,
                ["iconColor"],
                mkSimple(
                  GRAPH_VIEW_COLORS.map(([c]) => c),
                  Kind.EnumMember,
                  GRAPH_VIEW_COLOR_LABELS,
                ),
                Kind,
              );
            }
            return null;
          }
          case "entity":
          case "inherits":
          case "side1":
          case "side2": {
            if (
              (fieldName === "side1" || fieldName === "side2") &&
              vctx.container === "nameFrom"
            ) {
              return null;
            }

            // Trees children — контекстная подсказка entity
            if (fieldName === "entity") {
              const treeCtx = detectTreeChildrenContext(
                model,
                position,
                cur,
                ctx.modelIndex,
              );
              if (treeCtx) {
                return r(
                  model,
                  position,
                  ["entity"],
                  buildTreeEntityCandidates(treeCtx, Kind),
                  Kind,
                );
              }
            }

            const refs = collectRefsForField(
              cachedEntities(),
              ctx.currentDomainId,
              {
                shortKind: Kind.Class,
              },
            );
            return r(
              model,
              position,
              ["inherits", "entity", "side1", "side2"],
              refs,
              Kind,
            );
          }

          // ---------- простые ref-поля ----------
          case "linkage": {
            // Trees (уже есть)
            const treeCtx = detectTreeChildrenContext(
              model,
              position,
              cur,
              ctx.modelIndex,
            );
            if (treeCtx) {
              return r(
                model,
                position,
                ["linkage"],
                buildTreeLinkageCandidates(treeCtx.parentEntityFqid, cur, Kind),
                Kind,
              );
            }
            // Transitive (новое)
            const transCtx = detectTransitiveJoinContext(
              model,
              position,
              cur,
              ctx.modelIndex,
            );
            if (transCtx) {
              return r(
                model,
                position,
                ["linkage"],
                buildTransitiveLinkageCandidates(
                  transCtx.parentEntityFqid,
                  cur,
                  Kind,
                ),
                Kind,
              );
            }
            return r(
              model,
              position,
              ["linkage"],
              collectRefsForField(cachedLinkages(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );
          }
          case "widget":
            return r(
              model,
              position,
              ["widget"],
              collectRefsForField(cachedWidgets(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );
          case "group":
            return r(
              model,
              position,
              ["group"],
              collectRefsForField(cachedGroups(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );
          case "column":
            return r(
              model,
              position,
              ["column"],
              collectRefsForField(cachedColumns(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );
          case "action":
            return r(
              model,
              position,
              ["action"],
              collectRefsForField(cachedActions(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );
          case "sequence":
            return r(
              model,
              position,
              ["sequence"],
              collectRefsForField(cachedSequences(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );
          case "counterColorPattern":
            return r(
              model,
              position,
              ["counterColorPattern"],
              collectRefsForField(cachedCounterColors(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );
          case "menuItem":
            return r(
              model,
              position,
              ["menuItem"],
              collectRefsForField(cachedMenus(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );
          case "preset":
            return r(
              model,
              position,
              ["preset"],
              collectRefsForField(cachedUiPresets(), ctx.currentDomainId, {
                shortKind: Kind.EnumMember,
              }),
              Kind,
            );

          case "segment": {
            // segment — массив литералов (можно с @, можно без).
            // Monaco в YAML-режиме в массив-элементах выдаёт value-suggestions через
            // тот же механизм, что и для `- attr:`.
            return r(
              model,
              position,
              ["segment"],
              mkSimple(["@prefix", "@YYYY", "@YY", "@MM", "@DD"], Kind.Value, {
                "@prefix":
                  "Настраиваемый префикс (правила подстановки или defaultPrefix)",
                "@YYYY": "Текущий год, 4 цифры",
                "@YY": "Текущий год, 2 цифры",
                "@MM": "Текущий месяц, 01–12",
                "@DD": "Текущий день месяца, 01–31",
              }),
              Kind,
            );
          }
          case "tree":
            return r(
              model,
              position,
              ["tree"],
              collectRefsForField(cachedTrees(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            );

          // ---------- attribute / scenario ----------
          case "attribute": {
            const context = detectAttributeCompletionContext(model, position);
            if (!context) return null;
            const items = withKind(cachedAttributes(context), Kind.Field);
            return (
              r(model, position, ["attribute"], items, Kind) || {
                suggestions: [],
              }
            );
          }
          case "scenario": {
            const items = withKind(cachedScenarios(), Kind.Reference);
            return (
              r(model, position, ["scenario"], items, Kind) || {
                suggestions: [],
              }
            );
          }

          // ---------- view / modal / panel / form / addLinksView ----------
          case "modal": {
            const views = cachedViews();
            const refs = collectRefsForField(views, ctx.currentDomainId, {
              shortKind: Kind.Reference,
              typeFilter: "modal",
            });
            return r(model, position, ["modal"], refs, Kind);
          }
          case "panel": {
            const views = cachedViews();
            const refs = collectRefsForField(views, ctx.currentDomainId, {
              shortKind: Kind.Reference,
              typeFilter: "panel",
            });
            return r(model, position, ["panel"], refs, Kind);
          }
          case "addLinksView": {
            const views = cachedViews().filter(
              (v) => v.type === "list" || v.type === "tabs_list",
            );
            const refs = collectRefsForField(views, ctx.currentDomainId, {
              shortKind: Kind.Reference,
            });
            return (
              r(model, position, ["addLinksView"], refs, Kind) || {
                suggestions: [],
              }
            );
          }
          case "form": {
            const groups = cachedGroups().filter((g) => g.type === "form");
            const refs = collectRefsForField(groups, ctx.currentDomainId, {
              shortKind: Kind.Reference,
            });
            return r(model, position, ["form"], refs, Kind);
          }
          case "view": {
            let items = cachedViews();
            if (
              vctx.itemType === "menu" ||
              vctx.itemType === "menuItem" ||
              vctx.itemType === "action"
            ) {
              items = items.filter((v) =>
                [
                  "list",
                  "tabs_list",
                  "tree",
                  "dashboard",
                  "dashboard_tree",
                ].includes(v.type || ""),
              );
            }
            const refs = collectRefsForField(items, ctx.currentDomainId, {
              shortKind: Kind.Reference,
            });
            return r(model, position, ["view"], refs, Kind);
          }
          case "kind": {
            if (vctx.container === "constraints") {
              return r(
                model,
                position,
                ["kind"],
                mkSimple(
                  [
                    "required",
                    "range",
                    "length",
                    "regexp",
                    "size",
                    "mime_types",
                    "unique",
                  ],
                  Kind.Value,
                  {
                    required: "Значение не должно быть пустым",
                    range: "Число в диапазоне min..max",
                    length: "Длина строки от min до max",
                    regexp: "Строка соответствует регулярному выражению",
                    size: "Размер файла от min до max",
                    mime_types: "Допустимые MIME-типы вложения",
                    unique:
                      "Уникальное значение (String/Integer/Uuid/Reference/Array/Table)",
                  },
                ),
                Kind,
              );
            }
            // NEW: entities[].kind
            if (vctx.section === "entities" && vctx.itemType === "entity") {
              return r(
                model,
                position,
                ["kind"],
                mkSimple(["abstract", "regular", "static"], Kind.Value, {
                  abstract: "Абстрактная сущность (только наследование)",
                  regular: "Стандартная сущность (по умолчанию)",
                  static: "Статическая сущность (без создания экземпляров)",
                }),
                Kind,
              );
            }

            // NEW: accessRules scope item
            if (vctx.itemType === "accessRuleItem") {
              return r(
                model,
                position,
                ["kind"],
                mkSimple(["permission", "pass", "condition"], Kind.Value, {
                  permission: "Разрешить всё для обработки (с исключениями)",
                  pass: "Пропустить всё для обработки (с исключениями)",
                  condition: "Разрешить обработку при выполнении RQL-условия",
                }),
                Kind,
              );
            }

            return null;
          }
          case "displayMode": {
            if (vctx.section === "views" && vctx.container === "control") {
              return r(
                model,
                position,
                ["displayMode"],
                mkSimple(["flat", "grouped"], Kind.Value, {
                  flat: "Плоская таблица (для транзитивных связей)",
                  grouped:
                    "Группировка по первому звену цепочки (для транзитивных связей)",
                }),
                Kind,
              );
            }
            return null;
          }

          case "linkageAttribute": {
            const wId = lineCtxRef(model, position, "widget");
            const vId = lineCtxRef(model, position, "view");
            if (!wId) return null;

            const widget = (ctx.modelIndex?.viewWidgets || []).find(
              (w: any) => w.id === wId && (!vId || w.parentViewId === vId),
            );
            if (!widget?.linkage) return null;

            const lk = findLinkageByRef(widget.linkage, cur);
            if (!lk) return null;

            const items: RefSuggestion[] = (lk.attributes || [])
              .filter((a: any) => a && a.id)
              .map((a: any) => ({
                label: String(a.id),
                insertText: " " + String(a.id),
                kind: Kind.Field,
                sortText: "0_" + String(a.id),
                detail: `linkage: ${lk.id}`,
                documentation: [
                  a.dataType || "",
                  a.description || "",
                  `linkage: ${lk.id}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }));

            return (
              r(model, position, ["linkageAttribute"], items, Kind) || {
                suggestions: [],
              }
            );
          }

          case "forExport": {
            const path = findContainerPath(model, position);
            if (
              path.length !== 3 ||
              path[0] !== "exchangeSettings" ||
              path[1] !== "entities"
            ) {
              return null;
            }
            const entityId = path[2];
            const cur = (ctx.currentDomainId || "").toLowerCase();
            const entity =
              ctx.modelIndex?.entitiesByFqid[
                `${cur}/${entityId}`.toLowerCase()
              ];
            if (!entity) return null;

            const seen = new Set<string>();
            const items: RefSuggestion[] = [];

            // Системные атрибуты (per docs — label по умолчанию)
            for (const sys of [
              "label",
              "id",
              "createdAt",
              "updatedAt",
              "createdBy",
              "updatedBy",
              "organizationId",
              "tenantId",
              "version",
            ]) {
              if (seen.has(sys)) continue;
              seen.add(sys);
              items.push({
                label: sys,
                insertText: " " + sys,
                kind: Kind.Field,
                sortText: "0_" + sys,
                detail: "системный",
              });
            }

            // Атрибуты через цепочку наследования
            let curEntity: any = entity;
            const visited = new Set<string>();
            while (curEntity && !visited.has(curEntity.fqid)) {
              visited.add(curEntity.fqid);
              for (const a of curEntity.attributes) {
                if (seen.has(a.id)) continue;
                seen.add(a.id);
                items.push({
                  label: a.id,
                  insertText: " " + a.id,
                  kind: Kind.Field,
                  sortText: "1_" + a.id,
                  detail: `${a.dataType} · ${curEntity.entityId}`,
                  documentation: a.description || undefined,
                });
              }
              curEntity = curEntity.inherits
                ? ctx.modelIndex?.entitiesByFqid[curEntity.inherits]
                : undefined;
            }

            return r(model, position, ["forExport"], items, Kind);
          }

          case "upsertWith":
          case "ignoreAttributes": {
            const path = findContainerPath(model, position);
            if (
              path.length !== 3 ||
              path[0] !== "exchangeSettings" ||
              path[1] !== "entities"
            ) {
              return null;
            }
            const entityId = path[2];
            const cur = (ctx.currentDomainId || "").toLowerCase();
            const entityFqid = `${cur}/${entityId}`.toLowerCase();
            const entity = ctx.modelIndex?.entitiesByFqid[entityFqid];
            if (!entity) return null;

            const seen = new Set<string>();
            const items: RefSuggestion[] = [];

            // Атрибуты (унаследованные тоже)
            let curEntity: any = entity;
            const visited = new Set<string>();
            while (curEntity && !visited.has(curEntity.fqid)) {
              visited.add(curEntity.fqid);
              for (const a of curEntity.attributes) {
                if (seen.has(a.id)) continue;
                seen.add(a.id);
                items.push({
                  label: a.id,
                  insertText: a.id,
                  kind: Kind.Field,
                  sortText: "0_" + a.id,
                  detail: `${a.dataType} · ${curEntity.entityId}`,
                });
              }
              curEntity = curEntity.inherits
                ? ctx.modelIndex?.entitiesByFqid[curEntity.inherits]
                : undefined;
            }

            // Связи сущности
            for (const l of ctx.modelIndex?.entityLinkages || []) {
              if (
                (l.side1Fqid === entityFqid || l.side2Fqid === entityFqid) &&
                !seen.has(l.id)
              ) {
                seen.add(l.id);
                items.push({
                  label: l.id,
                  insertText: l.id,
                  kind: Kind.Reference,
                  sortText: "2_" + l.id,
                  detail: `связь · ${l.type}`,
                });
              }
            }

            // Системные
            for (const sys of [
              "id",
              "label",
              "createdAt",
              "updatedAt",
              "createdBy",
              "updatedBy",
              "organizationId",
              "tenantId",
              "version",
            ]) {
              if (seen.has(sys)) continue;
              seen.add(sys);
              items.push({
                label: sys,
                insertText: sys,
                kind: Kind.Field,
                sortText: "3_" + sys,
                detail: "системный",
              });
            }

            return buildListValueCompletion(
              model,
              position,
              ["upsertWith", "ignoreAttributes"],
              items,
              Kind,
            );
          }

          case "exportSystemAttributes": {
            const path = findContainerPath(model, position);
            if (
              path.length !== 3 ||
              path[0] !== "exchangeSettings" ||
              path[1] !== "entities"
            ) {
              return null;
            }
            const items: RefSuggestion[] = [
              {
                label: "all",
                insertText: "all",
                kind: Kind.Value,
                sortText: "0_all",
                documentation: "Экспортировать все системные атрибуты",
              },
            ];
            for (const sys of [
              "id",
              "label",
              "createdAt",
              "updatedAt",
              "createdBy",
              "updatedBy",
              "organizationId",
              "tenantId",
              "domainId",
              "entityId",
              "entityName",
              "version",
            ]) {
              items.push({
                label: sys,
                insertText: sys,
                kind: Kind.Field,
                sortText: "1_" + sys,
                detail: "системный",
              });
            }
            return buildListValueCompletion(
              model,
              position,
              ["exportSystemAttributes"],
              items,
              Kind,
            );
          }

          case "Date":
          case "Time":
          case "Timestamp":
          case "TimestampRange": {
            const path = findContainerPath(model, position);
            if (
              path.length !== 2 ||
              path[0] !== "exchangeSettings" ||
              path[1] !== "attributeFormats"
            ) {
              return null;
            }

            const DATE_FORMATS = [
              ["DD-MM-YYYY", "День-Месяц-Год (RU)"],
              ["YYYY-MM-DD", "Год-Месяц-День (ISO)"],
              ["DD/MM/YYYY", "День/Месяц/Год"],
              ["MM/DD/YYYY", "Месяц/День/Год (US)"],
              ["DD.MM.YYYY", "День.Месяц.Год"],
            ];
            const TIME_FORMATS = [
              ["HH:mm:ss", "Время 24ч с секундами"],
              ["HH:mm", "Время 24ч"],
              ["hh:mm A", "Время 12ч (AM/PM)"],
            ];
            const TS_FORMATS = [
              ["DD-MM-YYYYTHH:mm:ss", "Дата-время с T"],
              ["DD-MM-YYYY HH:mm:ss", "Дата-время с пробелом"],
              ["YYYY-MM-DDTHH:mm:ssZ", "ISO 8601 с таймзоной"],
              ["DD.MM.YYYY HH:mm:ss", "RU с точками"],
            ];

            let formats: string[][];
            if (fieldName === "Date") formats = DATE_FORMATS;
            else if (fieldName === "Time") formats = TIME_FORMATS;
            else if (fieldName === "Timestamp") formats = TS_FORMATS;
            else formats = TS_FORMATS; // TimestampRange

            return r(
              model,
              position,
              [fieldName],
              formats.map(([value, desc]) => ({
                label: value,
                insertText: " " + value,
                kind: Kind.Value,
                sortText: value,
                documentation: desc,
              })),
              Kind,
            );
          }
        }

        return null;
      })();

      const wordAtPosition = model.getWordUntilPosition(position);
      const prefix = wordAtPosition.word || "";

      if (
        raw &&
        raw.suggestions.length > 0 &&
        !hasPrefixMatch(raw.suggestions, prefix)
      )
        return null;

      return raw && raw.suggestions.length > 0 ? raw : null;
    },
  });
}

function lineCtxRef(_model: any, position: any, type: string): string | null {
  const lc = ctx.lineMap?.lineContexts.get(position.lineNumber);
  if (!lc) return null;
  const crumb = lc.breadcrumbs.find((b) => b.type === type);
  return crumb?.id || null;
}

export function applyRqlMarkers(
  monaco: any,
  model: any,
  lines: string[],
): void {
  try {
    const text = model.getValue();
    const lineContexts = ctx.lineMap?.lineContexts || new Map();
    const issues = scanRqlInText(text, lineContexts, ctx.modelIndex);
    const markers = issues.map((p) => ({
      severity:
        p.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      message: `RQL: ${p.message}`,
      startLineNumber: p.line,
      startColumn: p.column,
      endLineNumber: p.line,
      endColumn: p.column + p.length,
      source: "rql-check",
    }));
    monaco.editor.setModelMarkers(model, "rql-check", markers);
  } catch {}
}

// ============ Actions: required fields by type ============

interface ActionBlockInfo {
  id: string;
  /** 1-based */
  typeLine: number | null;
  type: string | null;
  fields: Map<string, { value: string; line: number }>;
}

/**
 * Собирает блоки `actions[]` с полями прямого уровня (`itemIndent + 2`).
 * Секция `actions` — только top-level.
 */
function collectActionBlocks(lines: string[]): ActionBlockInfo[] {
  const blocks: ActionBlockInfo[] = [];
  let inActions = false;
  let actionsIndent = -1;
  let current: ActionBlockInfo | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;

    if (ind === 0) {
      const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sm) {
        inActions = sm[1] === "actions";
        actionsIndent = -1;
        if (current) {
          blocks.push(current);
          current = null;
        }
      }
      continue;
    }
    if (!inActions) continue;

    if (actionsIndent === -1) {
      const m = line.match(/^(\s*)-\s+\S/);
      if (m) actionsIndent = m[1].length;
    }

    const idM = line.match(/^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?/);
    if (idM && idM[1].length === actionsIndent) {
      if (current) blocks.push(current);
      current = {
        id: idM[2],
        typeLine: null,
        type: null,
        fields: new Map(),
      };
      continue;
    }

    if (!current) continue;

    const fieldIndent = actionsIndent + 2;
    if (ind !== fieldIndent) continue;

    const fm = line.match(/^\s*([a-zA-Z_][\w]*)\s*:\s*(.*?)\s*(?:#.*)?$/);
    if (!fm) continue;
    const key = fm[1];
    const value = fm[2].trim();
    if (!current.fields.has(key)) {
      current.fields.set(key, { value, line: i + 1 });
    }
    if (key === "type" && value) {
      current.typeLine = i + 1;
      current.type = value.replace(/^["']|["']$/g, "");
    }
  }
  if (current) blocks.push(current);

  return blocks;
}

/** Обязательные поля по типу action. Копия логики linter.ts:checkActionRequiredFields. */
const ACTION_REQUIRED_FIELDS: Record<string, string[]> = {
  open_modal: ["modal", "entity", "operation"],
  open_panel: ["panel", "entity"],
  open_page: ["view", "entity", "operation"], // view или pageView
  open_graph_view: ["entity"],
  open_board_view: ["entity"],
  remove: ["entity"],
  generate_qr_code: ["entity"],
  copy_entity_link: ["entity"],
  open_list: ["view"],
  open_tree: ["view"],
  open_view: ["view"],
  bulk: ["operation"],
  tree_bulk: ["operation", "bulkSettings"],
  set_attribute_value: ["entity", "values"],
};

/** Поля-контейнеры: значение inline пустое, проверяется только наличие ключа. */
const ACTION_CONTAINER_FIELDS = new Set([
  "values",
  "bulkSettings",
  "control",
  "automation",
  "transition",
  "params",
  "widgetParams",
  "openBoardsFromGraph",
]);

export function applyTreeMarkers(
  monaco: any,
  model: any,
  lines: string[],
  index: ModelIndex | null,
  currentDomainId: string,
): void {
  if (!index) {
    monaco.editor.setModelMarkers(model, "tree-validator", []);
    return;
  }

  const markers: any[] = [];
  const curDomain = currentDomainId.toLowerCase();

  // 1. Найти trees:
  let treesStart = -1;
  let treesEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) {
      const m = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) {
        if (m[1] === "trees") treesStart = i;
        else if (treesStart >= 0) {
          treesEnd = i;
          break;
        }
      }
    }
  }
  if (treesStart < 0) {
    monaco.editor.setModelMarkers(model, "tree-validator", []);
    return;
  }

  let treeIndent = -1;
  for (let i = treesStart + 1; i < treesEnd; i++) {
    const m = lines[i].match(/^(\s*)-\s+id\s*:/);
    if (m) {
      treeIndent = m[1].length;
      break;
    }
  }
  if (treeIndent < 0) {
    monaco.editor.setModelMarkers(model, "tree-validator", []);
    return;
  }

  const entityLookup = (entityId: string | null): any => {
    if (!entityId) return null;
    if (entityId.includes("/"))
      return index.entitiesByFqid[entityId.toLowerCase()] || null;
    return (
      index.entitiesByFqid[`${curDomain}/${entityId}`.toLowerCase()] || null
    );
  };

  const isSameOrAncestor = (
    ancestorFqid: string,
    descFqid: string,
  ): boolean => {
    if (!ancestorFqid || !descFqid) return false;
    const ancL = ancestorFqid.toLowerCase();
    let cur: string | undefined = descFqid.toLowerCase();
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (cur === ancL) return true;
      const e = index.entitiesByFqid[cur];
      if (!e || !e.inherits) return false;
      cur = e.inherits.toLowerCase();
    }
    return false;
  };

  const emitMarker = (
    line: number,
    col: number,
    len: number,
    severity: any,
    message: string,
    code: string,
  ) => {
    markers.push({
      severity,
      message,
      startLineNumber: line,
      startColumn: col,
      endLineNumber: line,
      endColumn: col + len,
      source: "tree-validator",
      code,
    });
  };

  for (let i = treesStart + 1; i < treesEnd; i++) {
    const treeIdM = lines[i].match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
    if (!treeIdM || treeIdM[1].length !== treeIndent) continue;

    const treeBlockEnd = (() => {
      for (let j = i + 1; j < treesEnd; j++) {
        if (!lines[j].trim()) continue;
        const ind = (lines[j].match(/^(\s*)/) || ["", ""])[1].length;
        if (ind < treeIndent) return j;
        const d = lines[j].match(/^(\s*)-\s+\S/);
        if (d && d[1].length === treeIndent) return j;
      }
      return treesEnd;
    })();

    // hierarchy:
    let hierarchyLine = -1;
    let hierarchyIndent = -1;
    for (let j = i + 1; j < treeBlockEnd; j++) {
      const m = lines[j].match(/^(\s*)hierarchy\s*:\s*$/);
      if (m) {
        hierarchyLine = j;
        hierarchyIndent = m[1].length;
        break;
      }
    }
    if (hierarchyLine < 0) continue;

    // hierarchy.entity:
    let rootEntityId: string | null = null;
    for (let j = hierarchyLine + 1; j < treeBlockEnd; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind <= hierarchyIndent) break;
      const m = line.match(/^\s*entity\s*:\s*([^\s#]+)/);
      if (m) {
        rootEntityId = m[1].replace(/["']/g, "");
        break;
      }
    }
    const rootEntity = entityLookup(rootEntityId);
    const rootFqid = rootEntity
      ? rootEntity.fqid
      : rootEntityId
        ? `${curDomain}/${rootEntityId}`.toLowerCase()
        : null;
    if (!rootFqid) continue;

    // hierarchy.children:
    let childrenLine = -1;
    let childrenIndent = -1;
    for (let j = hierarchyLine + 1; j < treeBlockEnd; j++) {
      const m = lines[j].match(/^(\s*)children\s*:\s*$/);
      if (m && m[1].length > hierarchyIndent) {
        childrenLine = j;
        childrenIndent = m[1].length;
        break;
      }
    }
    if (childrenLine < 0) continue;

    const walk = (
      parentFqid: string,
      containerLine: number,
      containerIndent: number,
      containerEnd: number,
    ) => {
      let childIndent = -1;
      for (let j = containerLine + 1; j < containerEnd; j++) {
        if (!lines[j].trim()) continue;
        const d = lines[j].match(/^(\s*)-\s+\S/);
        if (d && d[1].length > containerIndent) {
          childIndent = d[1].length;
          break;
        }
      }
      if (childIndent < 0) return;

      let j = containerLine + 1;
      while (j < containerEnd) {
        if (!lines[j].trim()) {
          j++;
          continue;
        }
        const ind = (lines[j].match(/^(\s*)/) || ["", ""])[1].length;
        if (ind <= containerIndent) break;
        const d = lines[j].match(/^(\s*)-\s+\S/);
        if (!d || d[1].length !== childIndent) {
          j++;
          continue;
        }

        const childStart = j;
        let childEnd = containerEnd;
        for (let k = j + 1; k < containerEnd; k++) {
          if (!lines[k].trim()) continue;
          const kInd = (lines[k].match(/^(\s*)/) || ["", ""])[1].length;
          if (kInd < childIndent) {
            childEnd = k;
            break;
          }
          const kd = lines[k].match(/^(\s*)-\s+\S/);
          if (kd && kd[1].length === childIndent) {
            childEnd = k;
            break;
          }
        }

        // Читаем linkage: и entity:
        let linkageId: string | null = null;
        let linkageLine = -1;
        let linkageCol = 1;
        let entityId: string | null = null;
        let entityLine = -1;
        let entityCol = 1;

        for (let k = childStart; k < childEnd; k++) {
          const l = lines[k];
          if (!l.trim()) continue;
          const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
          // Принимаем `- linkage:` (indent = childIndent) и
          // sibling-поля `entity:` / `children:` (indent = childIndent + 2)
          if (lInd !== childIndent && lInd !== childIndent + 2) continue;

          if (linkageId === null) {
            const m = l.match(/^\s*(?:-\s+)?linkage\s*:\s*([^\s#]+)/);
            if (m) {
              linkageId = m[1].replace(/["']/g, "");
              linkageLine = k;
              linkageCol = l.indexOf(linkageId) + 1;
            }
          }
          if (entityId === null) {
            const m = l.match(/^\s*(?:-\s+)?entity\s*:\s*([^\s#]+)/);
            if (m) {
              entityId = m[1].replace(/["']/g, "");
              entityLine = k;
              entityCol = l.indexOf(entityId) + 1;
            }
          }
        }

        const linkageRec = linkageId
          ? resolveLinkageForMonaco(linkageId, curDomain, index)
          : null;
        const childEntityRec = entityLookup(entityId);

        // entity не найдена
        if (entityId && !childEntityRec && entityLine >= 0) {
          emitMarker(
            entityLine + 1,
            entityCol,
            entityId.length,
            monaco.MarkerSeverity.Error,
            `Сущность «${entityId}» не найдена в домене ${curDomain}`,
            "tree/children-entity-unknown",
          );
        }

        // linkage не найдена
        if (linkageId && !linkageRec && linkageLine >= 0) {
          const missingDomain = isForeignDomainNotLoaded(linkageId, index);
          if (missingDomain) {
            emitMarker(
              linkageLine + 1,
              linkageCol,
              linkageId.length,
              monaco.MarkerSeverity.Info,
              `Связь «${linkageId}» — домен «${missingDomain}» не загружен в кэш`,
              "tree/children-linkage-domain-not-loaded",
            );
          } else {
            emitMarker(
              linkageLine + 1,
              linkageCol,
              linkageId.length,
              monaco.MarkerSeverity.Error,
              `Связь «${linkageId}» не найдена в домене ${curDomain}`,
              "tree/children-linkage-unknown",
            );
          }
        }

        // Проверки стороны / типа
        if (linkageRec && parentFqid && childEntityRec && linkageLine >= 0) {
          const parentLower = parentFqid.toLowerCase();
          const childLower = childEntityRec.fqid.toLowerCase();
          const isSymmetric = linkageRec.side1Fqid === linkageRec.side2Fqid;

          if (linkageRec.type !== "1_n" && linkageRec.type !== "n_n") {
            emitMarker(
              linkageLine + 1,
              linkageCol,
              linkageId!.length,
              monaco.MarkerSeverity.Error,
              `linkage "${linkageId}": type "${linkageRec.type}" недопустим для дерева — нужен 1_n или n_n`,
              "tree/children-linkage-type-invalid",
            );
          } else if (linkageRec.type === "n_n" && linkageRec.undirected) {
            emitMarker(
              linkageLine + 1,
              linkageCol,
              linkageId!.length,
              monaco.MarkerSeverity.Error,
              `linkage "${linkageId}": n_n undirected недопустим в дереве`,
              "tree/children-undirected-nn",
            );
          } else if (!isSymmetric) {
            const parentMatchesSide1 = isSameOrAncestor(
              linkageRec.side1Fqid,
              parentLower,
            );
            const childMatchesSide2 = isSameOrAncestor(
              linkageRec.side2Fqid,
              childLower,
            );
            const parentMatchesSide2 = isSameOrAncestor(
              linkageRec.side2Fqid,
              parentLower,
            );
            const childMatchesSide1 = isSameOrAncestor(
              linkageRec.side1Fqid,
              childLower,
            );

            const connectsForward = parentMatchesSide1 && childMatchesSide2;
            const connectsBackward = parentMatchesSide2 && childMatchesSide1;
            const parentShort = parentFqid.split("/").pop();

            if (!connectsForward && !connectsBackward) {
              emitMarker(
                linkageLine + 1,
                linkageCol,
                linkageId!.length,
                monaco.MarkerSeverity.Error,
                `linkage "${linkageId}" (${linkageRec.side1Fqid.split("/").pop()} → ${linkageRec.side2Fqid.split("/").pop()}) не связывает parent «${parentShort}» и child «${entityId}»`,
                "tree/children-side-mismatch",
              );
            } else if (linkageRec.type === "1_n" && connectsBackward) {
              emitMarker(
                linkageLine + 1,
                linkageCol,
                linkageId!.length,
                monaco.MarkerSeverity.Warning,
                `1_n: parent «${parentShort}» должен быть на стороне 1 (one), а linkage его ставит на сторону 2 (many)`,
                "tree/children-inverted-1n",
              );
            }
          }
        }

        // Рекурсия в nested children:
        const childParentFqid = childEntityRec
          ? childEntityRec.fqid
          : entityId
            ? `${curDomain}/${entityId}`.toLowerCase()
            : parentFqid;
        let grandChildrenLine = -1;
        let grandChildrenIndent = -1;
        for (let k = childStart + 1; k < childEnd; k++) {
          const m = lines[k].match(/^(\s*)children\s*:\s*$/);
          if (m) {
            grandChildrenLine = k;
            grandChildrenIndent = m[1].length;
            break;
          }
        }
        if (grandChildrenLine >= 0) {
          walk(
            childParentFqid,
            grandChildrenLine,
            grandChildrenIndent,
            childEnd,
          );
        }

        j = childEnd;
      }
    };

    walk(rootFqid, childrenLine, childrenIndent, treeBlockEnd);
    i = treeBlockEnd - 1;
  }

  monaco.editor.setModelMarkers(model, "tree-validator", markers);
}

export function applyActionRequiredFieldsMarkers(
  monaco: any,
  model: any,
): void {
  try {
    const lines = model.getValue().split("\n");
    const blocks = collectActionBlocks(lines);
    const markers: any[] = [];

    for (const block of blocks) {
      const type = block.type;
      if (!type) continue;

      const required = ACTION_REQUIRED_FIELDS[type];
      if (!required) continue;

      const typeLine = block.typeLine;
      if (!typeLine) continue;

      for (const field of required) {
        // open_page: `view` можно заменить на `pageView`
        if (
          type === "open_page" &&
          field === "view" &&
          (block.fields.has("pageView") || block.fields.has("view"))
        ) {
          continue;
        }

        if (ACTION_CONTAINER_FIELDS.has(field)) {
          if (block.fields.has(field)) continue;
        } else {
          const f = block.fields.get(field);
          if (f && f.value) continue;
        }

        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `type: ${type} требует поле «${field}»`,
          startLineNumber: typeLine,
          startColumn: 1,
          endLineNumber: typeLine,
          endColumn: 1_000_000,
          source: "action-required-validator",
        });
      }
    }

    monaco.editor.setModelMarkers(model, "action-required-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[action-required-validator]", err);
  }
}

// ============ Attribute-reference markers (searching / sorting / projection) ============

interface LocalEntityInfo {
  id: string;
  inherits: string | null;
  attrs: Set<string>;
}

interface AttrRefMarker {
  line: number;
  col: number;
  end: number;
  value: string;
  kind: "searching" | "sorting" | "projection";
  entityId: string;
}

function isInInheritanceChain(
  startEntityId: string,
  targetEntityId: string,
  entities: Map<string, LocalEntityInfo>,
): boolean {
  let cur = entities.get(startEntityId.toLowerCase());
  const visited = new Set<string>();
  const targetLower = targetEntityId.toLowerCase();
  while (cur && !visited.has(cur.id.toLowerCase())) {
    if (cur.id.toLowerCase() === targetLower) return true;
    visited.add(cur.id.toLowerCase());
    if (!cur.inherits) return false;
    if (cur.inherits.includes("/")) {
      // cross-domain — сравним напрямую с FQID
      return cur.inherits.toLowerCase() === targetLower;
    }
    cur = entities.get(cur.inherits.toLowerCase());
  }
  return false;
}

function resolveAttributeRefInEntities(
  entityId: string,
  ref: string,
  entities: Map<string, LocalEntityInfo>,
): boolean {
  // FQID — кросс-домен, локально не проверить
  if (ref.includes("/")) return true;

  // Системный атрибут доступен на любой сущности, в YAML не объявляется.
  // Проверяем ДО dotted-разбора: `createdAt` не содержит точки и не
  // должен идти в цепочку наследования.
  if (SYSTEM_ATTRIBUTE_IDS.has(ref)) return true;

  const current = entities.get(entityId.toLowerCase());
  if (!current) return true; // сущность не из этого файла — не ругаемся

  // `Entity.attr` — атрибут предка
  const dot = ref.indexOf(".");
  if (dot > 0) {
    const targetEntityId = ref.slice(0, dot);
    const attrId = ref.slice(dot + 1);

    // `Entity.createdAt` — системный атрибут родителя тоже валиден.
    if (SYSTEM_ATTRIBUTE_IDS.has(attrId)) {
      // Проверим только, что Entity вообще предок (иначе опечатка в Entity).
      return isInInheritanceChain(entityId, targetEntityId, entities);
    }

    if (!isInInheritanceChain(entityId, targetEntityId, entities)) {
      return false;
    }
    const target = entities.get(targetEntityId.toLowerCase());
    return !!target && target.attrs.has(attrId);
  }

  // `attrId` — current + ancestors
  let cur: LocalEntityInfo | undefined = current;
  const visited = new Set<string>();
  while (cur && !visited.has(cur.id.toLowerCase())) {
    visited.add(cur.id.toLowerCase());
    if (cur.attrs.has(ref)) return true;
    if (!cur.inherits) break;
    if (cur.inherits.includes("/")) {
      // cross-domain parent: пробуем через modelIndex (может быть stale,
      // но лучше, чем ничего)
      const parentEntity =
        ctx.modelIndex?.entitiesByFqid[cur.inherits.toLowerCase()];
      if (parentEntity) {
        if (parentEntity.attributes.some((a) => a.id === ref)) return true;
      }
      break;
    }
    cur = entities.get(cur.inherits.toLowerCase());
  }
  return false;
}

/**
 * Inline-маркеры для `attribute:` внутри:
 *   - entities[].searching[].attribute
 *   - entities[].sorting[].by[].attribute
 *   - entities[].projection[].attribute
 *
 * Не зависит от `ctx.modelIndex` — резолвит по текущему содержимому YAML
 * (два прохода: собрать entities → проверить ссылки).
 */
export function applyAttributeRefMarkers(
  monaco: any,
  model: any,
  lines: string[],
): void {
  try {
    const entities = new Map<string, LocalEntityInfo>();
    const markers: AttrRefMarker[] = [];

    interface StackEntry {
      indent: number;
      key: string;
    }

    // ============ Pass 1: entities + attributes + inherits ============
    {
      const stack: StackEntry[] = [];
      let section = "";
      let currentEntityId: string | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }

        if (indent === 0) {
          const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
          section = sm?.[1] || "";
          stack.length = 0;
          currentEntityId = null;
          continue;
        }

        if (section !== "entities") continue;

        // `- id: X`
        const idM = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (idM) {
          const idIndent = idM[1].length;
          const id = unquote(idM[2]);
          const parentKey = stack.length > 0 ? stack[stack.length - 1].key : "";

          if (parentKey === "" || parentKey === "entities") {
            // новая сущность
            currentEntityId = id;
            if (!entities.has(id.toLowerCase())) {
              entities.set(id.toLowerCase(), {
                id,
                inherits: null,
                attrs: new Set(),
              });
            }
            stack.push({ indent: idIndent, key: "id" });
            continue;
          }

          if (parentKey === "attributes" && currentEntityId) {
            const info = entities.get(currentEntityId.toLowerCase());
            if (info) info.attrs.add(id);
            stack.push({ indent: idIndent, key: "id" });
            continue;
          }

          // nested — тоже добавляем (не помешает)
          if (currentEntityId) {
            const info = entities.get(currentEntityId.toLowerCase());
            if (info) info.attrs.add(id);
          }
          stack.push({ indent: idIndent, key: "id" });
          continue;
        }

        // `inherits: X`
        const inhM = line.match(/^\s*inherits\s*:\s*([^\s#]+)/);
        if (inhM && currentEntityId) {
          const info = entities.get(currentEntityId.toLowerCase());
          if (info) info.inherits = unquote(inhM[1]);
        }

        // generic key
        const km = line.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
        if (km) {
          stack.push({ indent, key: km[1] });
        }
      }
    }

    // ============ Pass 2: searching / sorting / projection refs ============
    {
      const stack: StackEntry[] = [];
      let section = "";
      let currentEntityId: string | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }

        if (indent === 0) {
          const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
          section = sm?.[1] || "";
          stack.length = 0;
          currentEntityId = null;
          continue;
        }

        if (section !== "entities") continue;

        const idM = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (idM) {
          const idIndent = idM[1].length;
          const parentKey = stack.length > 0 ? stack[stack.length - 1].key : "";
          if (parentKey === "" || parentKey === "entities") {
            currentEntityId = unquote(idM[2]);
          }
          stack.push({ indent: idIndent, key: "id" });
          continue;
        }

        // `attribute: X` или `- attribute: X`
        const attrRefM = line.match(
          /^(\s*)(?:-\s+)?attribute\s*:\s*(["']?)([^\s#"']+)\2\s*(?:#.*)?$/,
        );
        if (attrRefM && currentEntityId) {
          const value = attrRefM[3];

          // определим контейнер по стеку
          const stackKeys = stack.map((s) => s.key);
          let kind: AttrRefMarker["kind"] | null = null;
          if (stackKeys.includes("searching")) kind = "searching";
          else if (stackKeys.includes("sorting")) kind = "sorting";
          else if (stackKeys.includes("projection")) kind = "projection";

          if (kind) {
            const ok = resolveAttributeRefInEntities(
              currentEntityId,
              value,
              entities,
            );
            if (!ok) {
              const valueStart = line.indexOf(
                value,
                attrRefM[1].length + (attrRefM[0].includes("- ") ? 2 : 0),
              );
              const start = Math.max(0, valueStart);
              markers.push({
                line: i + 1,
                col: start + 1,
                end: start + 1 + value.length,
                value,
                kind,
                entityId: currentEntityId,
              });
            }
          }

          stack.push({ indent, key: "attribute" });
          continue;
        }

        // generic key
        const km = line.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
        if (km) {
          stack.push({ indent, key: km[1] });
        }
      }
    }

    // ============ Emit ============
    const monacoMarkers = markers.map((mk) => ({
      severity: monaco.MarkerSeverity.Warning,
      message: `Атрибут «${mk.value}» не найден в сущности «${mk.entityId}» (${mk.kind})`,
      startLineNumber: mk.line,
      startColumn: mk.col,
      endLineNumber: mk.line,
      endColumn: mk.end,
      source: "attribute-ref-validator",
    }));

    monaco.editor.setModelMarkers(
      model,
      "attribute-ref-validator",
      monacoMarkers,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[attribute-ref-validator]", err);
  }
}

const BASE_DATA_TYPES_SET = new Set<string>([
  "String",
  "Integer",
  "Decimal",
  "Float",
  "Bool",
  "Uuid",
  "Timestamp",
  "Date",
  "Time",
  "TimestampRange",
  "Text",
  "MAC",
  "IpAddress",
  "CIDR",
  "URL",
  "Attachment",
  "Identifier",
  "Counter",
  "Calculation",
  "Configuration",
  "Variable",
  "RQL",
  "Automation",
  "Reference",
  "Array",
  "Table",
  "Enum",
  "Workflow",
]);

const TYPE_ENUM_BY_CTX: Record<string, string[]> = {
  // ===== views =====
  "views|view": [
    "entity",
    "list",
    "tree",
    "tabs_list",
    "dashboard",
    "dashboard_tree",
  ],
  "views|viewNested": ["panel", "modal", "page"],
  "views|widget": [
    "attribute",
    "action",
    "linkage",
    "linkage_list",
    "linked_objects_groups",
    "join",
    "history",
    "runs_history",
    "comments",
    "card",
    "conversation",
    "visualization",
    "calculation",
    "template_editor",
    "addressBook",
  ],
  "views|group": ["block", "form", "tab", "tabs", "resizable_block_pair"],

  // ===== control внутри widget =====
  "views|viewWidgetControl": [
    "uuid",
    "text",
    "text_area",
    "date",
    "time",
    "timestamp",
    "timestamp_range",
    "integer",
    "decimal",
    "float",
    "integer_slider",
    "decimal_slider",
    "float_slider",
    "bool_text",
    "checkbox",
    "switch",
    "select",
    "level",
    "radio",
    "multi_select",
    "mitre_multi_select",
    "tag_list",
    "tag",
    "ip",
    "mac",
    "cidr",
    "file",
    "link",
    "url",
    "counter",
    "tree_path",
    "drag_drop_area",
    "rql",
    "external",
  ],
  "views|viewWidgetLinkageControl": [
    "select",
    "tag",
    "link",
    "text",
    "multi_select",
    "mitre_multi_select",
    "table",
    "list",
    "tree",
  ],
  "views|viewWidgetActionControl": [
    "regular_button",
    "dropdown",
    "drag_drop_area",
  ],
  "views|viewButtonControl": ["regular_button"],

  // ===== прочие type-поля views =====
  "views|viewSourceType": ["operational"],
  "views|viewTableActionType": [
    "row_click",
    "row_double_click",
    "row_context_menu",
  ],
  "views|viewButtonType": ["submit", "close"],
  "views|viewFilterAttributesType": ["specific", "all"],
  "views|viewFilterLinkagesType": ["specific", "all"],

  // ===== другие секции =====
  "actions|action": [
    "open_panel",
    "open_modal",
    "open_page",
    "open_graph_view",
    "open_board_view",
    "open_list",
    "open_tree",
    "open_view",
    "remove",
    "bulk",
    "tree_bulk",
    "set_attribute_value",
    "automation",
    "scenario",
    "generate_qr_code",
    "copy_entity_link",
    "open_external_widget_modal",
  ],
  "linkages|linkage": ["1_1", "1_n", "n_n"],
  "dataTypes|dataType": ["Enum", "Table", "Workflow"],
  "trees|tree": ["ordinary", "orderable", "multiparent"],
  "entities|attributeConstraint": [
    "required",
    "range",
    "length",
    "regexp",
    "size",
    "mime_types",
    "unique",
  ],
  "linkages|attributeConstraint": [
    "required",
    "range",
    "length",
    "regexp",
    "size",
    "mime_types",
    "unique",
  ],
  // ===== entities =====
  "entities|reconciliationMergeStrategy": [
    "replace",
    "array_merge",
    "array_concat",
    "earliest_date",
    "latest_date",
  ],
  dataRules: ["entity", "entityAttribute"],
  "menus|menu": ["root_group", "root_menu"],
  "menus|menuItem": ["menu"],
  "medias|media": ["icon_name", "data"],
  "views|viewTableColumnControl": [
    "uuid",
    "text",
    "text_area",
    "date",
    "time",
    "timestamp",
    "timestamp_range",
    "integer",
    "decimal",
    "float",
    "integer_slider",
    "decimal_slider",
    "float_slider",
    "bool_text",
    "checkbox",
    "switch",
    "select",
    "level",
    "radio",
    "multi_select",
    "mitre_multi_select",
    "tag_list",
    "tag",
    "ip",
    "mac",
    "cidr",
    "file",
    "link",
    "url",
    "counter",
    "tree_path",
    "drag_drop_area",
    "rql",
    "external",
  ],
  "entities|treeNodeType": ["root", "branch", "leaf"],
  "views|viewDashboardLayout": ["grid"],
  "views|viewWidgetDragDropContext": ["Array", "Attachment", "Table"],
  "actions|actionBulkSettingsAttributes": ["all", "specific"],
  "actions|actionBulkSettingsLinkages": ["all", "specific"],
  "actions|actionAttributes": ["specific"],
  "actions|actionLinkages": ["specific"],
};

const EFFECT_ENUM_BY_CTX: Record<string, string[]> = {
  dataRuleRule: ["hidden", "readonly", "required", "default", "allowed"],
  uiRuleRule: [
    "hidden",
    "show",
    "hiddenEmpty",
    "readonly",
    "editable",
    "inherit",
    "variant",
  ],
};

const TARGET_ENUM_BY_CTX: Record<string, string[]> = {
  dataRule: ["entity", "entityAttribute"],
  uiRule: ["list_view", "entity_view", "entity_attribute"],
};

const OPERATION_ENUM_BY_ACTION_TYPE: Record<string, string[]> = {
  open_modal: ["create", "edit"],
  open_page: ["create", "edit", "view"],
  bulk: ["remove", "edit", "edit_attribute", "import", "export"],
  tree_bulk: ["edit", "remove"],
};

export function applyEnumFieldMarkers(
  monaco: any,
  model: any,
  lines: string[],
): void {
  try {
    // ============ Pre-pass: line → ValueCtx (один forward проход) ============
    const ctxByLine: Array<ValueCtx | null> = new Array(
      model.getLineCount() + 1,
    ).fill(null);
    let curSection = "";
    const stack: Array<{ indent: number; key: string; line: number }> = [];

    for (let i = 0; i < model.getLineCount(); i++) {
      const line = model.getLineContent(i + 1);
      if (!line.trim() || line.trim().startsWith("#")) {
        ctxByLine[i + 1] = i > 0 ? ctxByLine[i] : null;
        continue;
      }
      const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      if (indent === 0) {
        const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (sm) {
          curSection = sm[1];
          stack.length = 0;
          ctxByLine[i + 1] = {
            section: curSection,
            container: "",
            itemType: "",
          };
        }
        continue;
      }

      const km = line.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
      if (!km) {
        ctxByLine[i + 1] = i > 0 ? ctxByLine[i] : null;
        continue;
      }

      const key = km[1];

      // Контейнер — ближайший не-`id` ключ с меньшим отступом.
      // Для секции views сканируем ТЕКСТ (надёжнее стека),
      // для остальных — используем стек.
      let container = "";
      let containerIndent = -1;
      let containerIdx = -1;
      let containerLine = -1;

      if (curSection === "views") {
        const dc = determineViewContainer(model, i + 1, indent);
        container = dc.container;
        containerLine = dc.containerLine;
        containerIndent = dc.containerIndent;
      } else {
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].key !== "id" && stack[s].indent < indent) {
            container = stack[s].key;
            containerIndent = stack[s].indent;
            containerLine = (stack[s] as any).line ?? -1;
            containerIdx = s;
            break;
          }
        }
      }

      const itemType = computeItemTypeFast(
        model,
        curSection,
        container,
        containerLine, // без + 1
        containerIndent,
        stack,
      );

      ctxByLine[i + 1] = { section: curSection, container, itemType };
      stack.push({ indent, key, line: i + 1 });
    }

    // ============ Scan: O(N) маркеров ============
    const markers: any[] = [];

    for (let i = 0; i < model.getLineCount(); i++) {
      const line = model.getLineContent(i + 1);
      const fm = line.match(
        /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*["']?([\w.-]+)["']?\s*(?:#.*)?$/,
      );
      if (!fm) continue;
      const fieldName = fm[2];
      const value = fm[3];
      if (!value) continue;

      const vctx = ctxByLine[i + 1];
      if (!vctx) continue;

      const fieldStart = line.indexOf(fieldName);
      const valueStart = line.indexOf(value, fieldStart + fieldName.length);
      if (valueStart < 0) continue;
      const startCol = valueStart + 1;
      const endCol = startCol + value.length;

      // ---- boolean ----
      if (BOOLEAN_FIELD_NAMES.has(fieldName)) {
        if (!["true", "false"].includes(value)) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Поле "${fieldName}" ожидает boolean: true или false`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: endCol,
            source: "enum-validator",
          });
        }
        continue;
      }

      let expected: string[] | null = null;
      let label = "";

      if (fieldName === "type") {
        expected = TYPE_ENUM_BY_CTX[`${vctx.section}|${vctx.itemType}`] || null;
        label = "тип";
      } else if (fieldName === "effect") {
        expected = EFFECT_ENUM_BY_CTX[vctx.itemType] || null;
        label = "эффект";
      } else if (fieldName === "target") {
        expected = TARGET_ENUM_BY_CTX[vctx.itemType] || null;
        label = "target";
      } else if (fieldName === "direction") {
        if (vctx.container === "layout") expected = ["column"];
        else if (
          vctx.itemType === "sortingByItem" ||
          vctx.container === "by" ||
          vctx.container === "defaults"
        )
          expected = ["asc", "desc"];
        label = "направление";
      } else if (fieldName === "mode" && vctx.container === "search") {
        expected = ["entity", "linkage", "both"];
        label = "режим поиска";
      } else if (fieldName === "placement") {
        expected = ["top", "settings"];
        label = "расположение";
      } else if (fieldName === "operation") {
        const actionType = findActionTypeForModel(model, i + 1);
        if (actionType && OPERATION_ENUM_BY_ACTION_TYPE[actionType]) {
          expected = OPERATION_ENUM_BY_ACTION_TYPE[actionType];
          label = `operation для type: ${actionType}`;
        }
      } else if (fieldName === "page") {
        const actionType = findActionTypeForModel(model, i + 1);
        if (
          actionType &&
          ["open_list", "open_tree", "open_view"].includes(actionType)
        ) {
          expected = ["blank", "current"];
          label = `page для type: ${actionType}`;
        }
      } else if (fieldName === "iconColor") {
        if (vctx.container === "graphView") {
          expected = GRAPH_VIEW_COLORS.map(([c]) => c);
          label = "цвет иконки";
        }
      }

      if (!expected || expected.includes(value)) continue;

      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message:
          `Недопустимое значение ${label} "${value}". ` +
          `Ожидается: ${expected.join(", ")}`,
        startLineNumber: i + 1,
        startColumn: startCol,
        endLineNumber: i + 1,
        endColumn: endCol,
        source: "enum-validator",
      });
    }

    monaco.editor.setModelMarkers(model, "enum-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[enum-validator]", err);
  }
}

export function applyWorkflowStatusRefMarkers(
  monaco: any,
  model: any,
  lines: string[],
): void {
  try {
    const text = model.getValue();
    const markers: any[] = [];
    const parsed = parseDataTypesFromText(text);

    if (parsed.workflows.size === 0) {
      monaco.editor.setModelMarkers(model, "workflow-status-validator", []);
      return;
    }

    // Быстро находим границы dataTypes-секции (нужны для item-обхода)
    let sectionStart = -1;
    let sectionEnd = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind !== 0) continue;
      const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (!sm) continue;
      if (sm[1] === "dataTypes") sectionStart = i;
      else if (sectionStart >= 0) {
        sectionEnd = i;
        break;
      }
    }
    if (sectionStart < 0) {
      monaco.editor.setModelMarkers(model, "workflow-status-validator", []);
      return;
    }

    let itemIndent = -1;
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const dashM = line.match(/^(\s*)-\s+\S/);
      if (dashM) {
        itemIndent = dashM[1].length;
        break;
      }
    }
    if (itemIndent < 0) {
      monaco.editor.setModelMarkers(model, "workflow-status-validator", []);
      return;
    }
    const fieldIndent = itemIndent + 2;

    let i = sectionStart + 1;
    while (i < sectionEnd) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) {
        i++;
        continue;
      }
      const dashM = line.match(/^(\s*)-\s+\S/);
      if (!dashM || dashM[1].length !== itemIndent) {
        i++;
        continue;
      }

      let itemEnd = sectionEnd;
      for (let j = i + 1; j < sectionEnd; j++) {
        const jLine = lines[j];
        if (!jLine.trim()) continue;
        const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
        const jDash = jLine.match(/^(\s*)-\s+\S/);
        if (jDash && jInd === itemIndent) {
          itemEnd = j;
          break;
        }
      }

      // id этого item
      let itemId: string | null = null;
      for (let j = i; j < itemEnd; j++) {
        const jLine = lines[j];
        if (!jLine.trim() || jLine.trim().startsWith("#")) continue;
        const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
        if (jInd !== itemIndent && jInd !== fieldIndent) continue;
        const im = jLine.match(/^\s*(?:-\s+)?id\s*:\s*["']?([^\s"'#]+)["']?/);
        if (im) {
          itemId = im[1];
          break;
        }
      }

      if (itemId && parsed.workflows.has(itemId)) {
        const statuses = new Set(parsed.workflows.get(itemId)!);
        if (statuses.size > 0) {
          // ── initial: ──
          for (let j = i + 1; j < itemEnd; j++) {
            const jLine = lines[j];
            if (!jLine.trim() || jLine.trim().startsWith("#")) continue;
            const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
            if (jInd !== fieldIndent) continue;
            const im = jLine.match(/^\s*initial\s*:\s*["']?([^\s"'#]+)["']?/);
            if (!im) continue;
            const value = im[1];
            if (!statuses.has(value)) {
              const col = jLine.indexOf(value) + 1;
              markers.push({
                severity: monaco.MarkerSeverity.Warning,
                message: `Начальный статус "${value}" не объявлен в statuses[]`,
                startLineNumber: j + 1,
                startColumn: col,
                endLineNumber: j + 1,
                endColumn: col + value.length,
                source: "workflow-status-validator",
                code: "workflow/initial-unknown-status",
              });
            }
          }

          // ── transitions[].from / .to ──
          let transStart = -1;
          for (let j = i + 1; j < itemEnd; j++) {
            const jLine = lines[j];
            if (!jLine.trim() || jLine.trim().startsWith("#")) continue;
            const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
            if (jInd !== fieldIndent) continue;
            if (/^\s*transitions\s*:\s*$/.test(jLine)) {
              transStart = j;
              break;
            }
          }
          if (transStart >= 0) {
            for (let j = transStart + 1; j < itemEnd; j++) {
              const jLine = lines[j];
              if (!jLine.trim()) continue;
              const jInd = (jLine.match(/^(\s*)/) || ["", ""])[1].length;
              if (jInd <= fieldIndent) break;
              const m = jLine.match(
                /^\s*-\s+(from|to)\s*:\s*["']?([^\s"'#]+)["']?/,
              );
              if (!m) continue;
              const field = m[1];
              const value = m[2];
              if (value === "*") continue;
              if (!statuses.has(value)) {
                const col = jLine.indexOf(value) + 1;
                markers.push({
                  severity: monaco.MarkerSeverity.Warning,
                  message: `${field === "from" ? "Исходный" : "Целевой"} статус "${value}" не объявлен в statuses[]`,
                  startLineNumber: j + 1,
                  startColumn: col,
                  endLineNumber: j + 1,
                  endColumn: col + value.length,
                  source: "workflow-status-validator",
                  code: "workflow/transition-unknown-status",
                });
              }
            }
          }
        }
      }

      i = itemEnd;
    }

    monaco.editor.setModelMarkers(model, "workflow-status-validator", markers);
  } catch (err) {
    console.warn("[workflow-status-validator]", err);
  }
}

export function applyDataTypeMarkers(
  monaco: any,
  model: any,
  lines: string[],
  index: any,
  currentDomainId: string,
): void {
  try {
    const text = model.getValue();
    const markers: any[] = [];

    // Кастомные типы домена — для кросс-доменных ссылок можно дополнить
    const customTypes = new Set<string>();
    (index?.dataTypes || []).forEach((dt: any) => {
      if (dt?.id && dt.domainId === currentDomainId) {
        customTypes.add(String(dt.id));
      }
    });

    parseDataTypesFromText(text).ids.forEach((id) => customTypes.add(id));

    let inDataTypesSection = false;
    let dashIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Секция верхнего уровня — только indent 0 (без "  - attributes:")
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        inDataTypesSection = sectionM[1] === "dataTypes";
        dashIndent = -1;
        continue;
      }

      // Базовый indent "- " для элементов dataTypes[] (запоминаем по первому " - ")
      if (dashIndent === -1) {
        const dashM = line.match(/^(\s*)-\s+\S/);
        if (dashM) dashIndent = dashM[1].length;
      }

      const dtMatch = line.match(
        /^(\s*)(?:-\s+)?dataType\s*:\s*["']?([\w./-]+)["']?\s*(?:#.*)?$/,
      );
      if (!dtMatch) continue;

      const dtIndent = dtMatch[1].length;
      const value = dtMatch[2];
      const valueStartInLine = line.indexOf(value, dtIndent);
      if (valueStartInLine < 0) continue;
      const startCol = valueStartInLine + 1;
      const endCol = startCol + value.length;

      // Верхний уровень элемента dataTypes[]?
      // "  - dataType: Table"  → dtIndent === dashIndent
      // "    dataType: Table"  → dtIndent === dashIndent + 2
      // "        dataType: String" (внутри attributes) → глубже → не top-level
      const isTopLevel =
        inDataTypesSection &&
        dashIndent !== -1 &&
        (dtIndent === dashIndent || dtIndent === dashIndent + 2);

      if (isTopLevel) {
        if (!["Enum", "Table", "Workflow"].includes(value)) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message:
              `Недопустимый тип данных "${value}" в секции dataTypes[]. ` +
              `Ожидается Enum, Table или Workflow.`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: endCol,
            source: "dataType-validator",
          });
        }
        continue;
      }

      // Везде остальное (атрибуты, вложенные item, linkage-атрибуты, таблицы):
      // базовый, кастомный или FQID кастомного типа из другого домена.
      if (value.includes("/")) {
        // FQID — проверить формат, но не резолвить (кросс-домен)
        if (!/^[a-z0-9.-]+\/[\w-]+$/i.test(value)) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Некорректный FQID типа данных "${value}". Ожидается <domain>/<DataTypeId>`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: endCol,
            source: "dataType-validator",
          });
        }
        continue;
      }

      if (!BASE_DATA_TYPES_SET.has(value) && !customTypes.has(value)) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message:
            `Неизвестный тип данных "${value}". ` +
            (customTypes.size > 0
              ? `Ожидается базовый тип или один из: ` +
                [...customTypes].slice(0, 8).join(", ") +
                (customTypes.size > 8 ? "…" : "")
              : `Ожидается базовый тип.`),
          startLineNumber: i + 1,
          startColumn: startCol,
          endLineNumber: i + 1,
          endColumn: endCol,
          source: "dataType-validator",
        });
      }
    }

    monaco.editor.setModelMarkers(model, "dataType-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[dataType-validator]", err);
  }
}

/**
 * Возвращает имя ближайшего родительского контейнера для строки lineIdx0
 * (0-based): ключ последней строки выше с меньшим indent — либо контейнер
 * (`key:` без значения), либо item-opener (`- key: value`).
 *
 * Пример:
 *   nameFrom:               ← indent 4
 *     side1: Message        ← indent 6, currentIndent=6 → вернёт "nameFrom"
 */
function getParentContainerKey(lines: string[], lineIdx0: number): string {
  const currentLine = lines[lineIdx0];
  if (!currentLine) return "";
  const currentIndent = (currentLine.match(/^(\s*)/) || ["", ""])[1].length;

  for (let j = lineIdx0 - 1; j >= 0; j--) {
    const l = lines[j];
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= currentIndent) continue;

    // Контейнер: `key:` без значения
    const cm = l.match(/^\s*([a-zA-Z_][\w]*)\s*:\s*(?:#.*)?$/);
    if (cm) return cm[1];

    // Или item-opener: `- key: value` / `- key:`
    const im = l.match(/^\s*-\s+([a-zA-Z_][\w]*)\s*:/);
    if (im) return im[1];

    if (ind === 0) break;
  }
  return "";
}

/**
 * Подсветка невалидных FQID-ссылок в YAML.
 * Работает только для полей, где ожидается FQID:
 *   inherits, entity, side1, side2, linkage, view, modal, panel,
 *   form, tab, list, page, attribute, item, source.
 *
 * Ошибка — домен не существует.
 * Warning — домен есть, сущности нет.
 */
export function applyFqidMarkers(
  monaco: any,
  model: any,
  lines: string[],
  index: any,
  currentDomainId: string,
): void {
  try {
    const markers: any[] = [];

    const domainIds = new Set<string>();
    (index?.domains || []).forEach((d: any) =>
      domainIds.add(String(d.id).toLowerCase()),
    );
    const entityFqids = new Set<string>();
    const entityIdsByDomain = new Map<string, Set<string>>();
    (index?.entities || []).forEach((e: any) => {
      const fqid = String(e.fqid).toLowerCase();
      entityFqids.add(fqid);
      const domLower = String(e.domainId).toLowerCase();
      if (!entityIdsByDomain.has(domLower)) {
        entityIdsByDomain.set(domLower, new Set());
      }
      entityIdsByDomain.get(domLower)!.add(String(e.entityId).toLowerCase());
    });

    // Field regex — только реальные FQID-поля на сущность.
    // `attribute`, `item`, `source`, `linkedEntity` намеренно убраны: это
    // атрибуты / объекты / массивы, а не ссылки на сущности.
    const REF_FIELD_PATTERN =
      /^\s*(?:-\s+)?(inherits|entity|side1|side2)\s*:\s*(.+)$/;

    const FQID_IN_VALUE = /([a-z0-9][\w.\-]*\.[a-z0-9][\w.\-]*)\/([\w\-]+)/gi;
    const LOCAL_ENTITY_VALUE = /^([A-Z][\w]*)$/; // CamelCase локальный id

    const currentLower = (currentDomainId || "").toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fieldMatch = line.match(REF_FIELD_PATTERN);
      if (!fieldMatch) continue;

      const fieldName = fieldMatch[1];

      // nameFrom.side1 / nameFrom.side2 — это глагольные формы связи
      // ("Содержит", "Связан с"), а не ссылки на сущности. Проверять их
      // по entityFqids некорректно.
      if (
        (fieldName === "side1" || fieldName === "side2") &&
        getParentContainerKey(lines, i) === "nameFrom"
      ) {
        continue;
      }

      const rawValue = fieldMatch[2];
      const valueWithoutComment = rawValue.split(" #")[0].trim();

      // Убираем кавычки
      let normalizedValue = valueWithoutComment;
      if (
        (normalizedValue.startsWith('"') && normalizedValue.endsWith('"')) ||
        (normalizedValue.startsWith("'") && normalizedValue.endsWith("'"))
      ) {
        normalizedValue = normalizedValue.slice(1, -1);
      }

      const valueStartInLine = line.indexOf(rawValue);
      const quoteOffset =
        valueWithoutComment.length !== normalizedValue.length ? 1 : 0;

      // ===== Сценарий 1: FQID с доменом =====
      FQID_IN_VALUE.lastIndex = 0;
      let fqidFound = false;
      let m: RegExpExecArray | null;
      while ((m = FQID_IN_VALUE.exec(normalizedValue)) !== null) {
        fqidFound = true;
        const full = m[0];
        const domainPart = m[1];
        const entityPart = m[2];
        const colInValue = m.index + 1;
        const startColumn = valueStartInLine + quoteOffset + colInValue;

        const domainLower = domainPart.toLowerCase();
        const fullLower = full.toLowerCase();

        if (!domainIds.has(domainLower)) {
          markers.push({
            severity: monaco.MarkerSeverity.Info,
            message:
              `Домен «${domainPart}» не загружен в кэш — проверьте ссылку на сервере ` +
              `(возможно, опечатка в FQDN)`,
            startLineNumber: i + 1,
            startColumn,
            endLineNumber: i + 1,
            endColumn: startColumn + full.length,
            source: "fqid-validator",
          });
        } else if (!entityFqids.has(fullLower)) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Сущность «${entityPart}» не найдена в домене ${domainPart}`,
            startLineNumber: i + 1,
            startColumn,
            endLineNumber: i + 1,
            endColumn: startColumn + full.length,
            source: "fqid-validator",
          });
        }
      }

      // ===== Сценарий 2: локальная сущность (без домена) =====
      // Для inherits/entity — проверяем существование в текущем домене
      if (!fqidFound && currentLower) {
        const field = fieldName;
        // Только для полей, где значение — это entity id
        if (
          field === "inherits" ||
          field === "entity" ||
          field === "side1" ||
          field === "side2"
        ) {
          // Может быть как чистый id, так и CamelCase
          if (LOCAL_ENTITY_VALUE.test(normalizedValue)) {
            const localSet = entityIdsByDomain.get(currentLower);
            if (localSet && !localSet.has(normalizedValue.toLowerCase())) {
              const startColumn = valueStartInLine + quoteOffset + 1;
              markers.push({
                severity: monaco.MarkerSeverity.Warning,
                message: `Сущность «${normalizedValue}» не найдена в домене ${currentDomainId}`,
                startLineNumber: i + 1,
                startColumn,
                endLineNumber: i + 1,
                endColumn: startColumn + normalizedValue.length,
                source: "fqid-validator",
              });
            }
          }
        }
      }
    }

    // ============ Проверка linkage-ссылок ============
    // Источники: views[].widgets[].linkage, mixins[].linkage, trees[].children[].linkage,
    // transitiveLinkages[].joins[].linkage, actions[].linkage, dataRules[].linkage.
    //
    // Значение — либо `<linkageId>` (текущий домен), либо `<domain>/<linkageId>` (FQID).
    // Резолвим в домене-владельце, а НЕ в домене, где написана строка.
    const knownLinkagesByDomain = new Map<string, Set<string>>();
    const ensureLinkageSet = (domId: string): Set<string> => {
      let set = knownLinkagesByDomain.get(domId);
      if (!set) {
        set = new Set();
        knownLinkagesByDomain.set(domId, set);
      }
      return set;
    };
    (index as any)?.entityLinkages?.forEach((l: any) => {
      if (!l?.domainId || !l?.id) return;
      ensureLinkageSet(String(l.domainId).toLowerCase()).add(
        String(l.id).toLowerCase(),
      );
    });
    if (index?.schemasByDomain) {
      for (const [domId, s] of Object.entries(index.schemasByDomain)) {
        const items = (s as any)?.sections?.linkages?.items || [];
        for (const l of items) {
          if (l?.id) {
            ensureLinkageSet(domId.toLowerCase()).add(
              String(l.id).toLowerCase(),
            );
          }
        }
      }
    }

    // Дополняем knownLinkagesByDomain из текущего YAML (секция linkages:)
    {
      let inLinkagesSection = false;
      const idRegex = /^\s*-\s+id\s*:\s*["']?([^\s"'#]+)["']?/;
      for (const line of lines) {
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
        if (ind === 0) {
          const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
          if (sm) inLinkagesSection = sm[1] === "linkages";
          continue;
        }
        if (!inLinkagesSection) continue;
        const m = line.match(idRegex);
        if (m) {
          ensureLinkageSet((currentDomainId || "").toLowerCase()).add(
            m[1].toLowerCase(),
          );
        }
      }
    }

    // Поддержка и `linkage: x`, и `- linkage: x`.
    const linkageRegex = /^\s*(?:-\s+)?linkage\s*:\s*([^\s#]+)/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(linkageRegex);
      if (!m) continue;

      const rawLinkageId = m[1].replace(/["']/g, "");
      const slash = rawLinkageId.indexOf("/");
      let idToCheck = rawLinkageId;
      let targetDomain = (currentDomainId || "").toLowerCase();

      if (slash > 0) {
        targetDomain = rawLinkageId.slice(0, slash).toLowerCase();
        idToCheck = rawLinkageId.slice(slash + 1);
      }

      const startCol = line.indexOf(rawLinkageId) + 1;
      const endCol = startCol + rawLinkageId.length;

      // Домен FQID не существует
      if (!domainIds.has(targetDomain)) {
        markers.push({
          severity: monaco.MarkerSeverity.Info,
          message: `Домен «${targetDomain}» не загружен в кэш — проверьте ссылку на сервере`,
          startLineNumber: i + 1,
          startColumn: startCol,
          endLineNumber: i + 1,
          endColumn: endCol,
          source: "fqid-validator",
        });
        continue;
      }

      // Связь не найдена в целевом домене
      const set = knownLinkagesByDomain.get(targetDomain);
      if (!set || !set.has(idToCheck.toLowerCase())) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Связь «${idToCheck}» не найдена в домене ${targetDomain}`,
          startLineNumber: i + 1,
          startColumn: startCol,
          endLineNumber: i + 1,
          endColumn: endCol,
          source: "fqid-validator",
        });
      }
    }

    // ============ Валидация actions ============

    let inActionsSection = false;
    let actionEntity: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        inActionsSection = sectionM[1] === "actions";
        actionEntity = null;
        continue;
      }
      if (!inActionsSection) continue;

      // Текущий action entity
      const idm = line.match(/^\s*-\s+id\s*:/);
      if (idm) {
        actionEntity = null;
      }
      const entityM = line.match(/^\s*entity\s*:\s*([^\s#]+)/);
      if (entityM) {
        actionEntity = entityM[1].replace(/["']/g, "");
      }

      // automation.id — должен быть UUID
      const automationIdM = line.match(/^\s*id\s*:\s*([^\s#]+)/);
      if (automationIdM) {
        // Проверяем только внутри automation блока
        let insideAutomation = false;
        for (let j = i - 1; j >= 1; j--) {
          const pl = model.getLineContent(j);
          if (/^\s*automation\s*:/.test(pl)) {
            insideAutomation = true;
            break;
          }
          if (/^\s*-\s*id\s*:/.test(pl)) break;
          if (
            /^\s*[a-zA-Z_]\w*\s*:/.test(pl) &&
            !/^\s*(automation|name|description)\s*:/.test(pl)
          )
            break;
        }
        if (insideAutomation) {
          const uuid = automationIdM[1].replace(/["']/g, "");
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              uuid,
            )
          ) {
            const startCol = line.indexOf(uuid) + 1;
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Ожидается UUID автоматизации (вида xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)`,
              startLineNumber: i + 1,
              startColumn: startCol,
              endLineNumber: i + 1,
              endColumn: startCol + uuid.length,
              source: "fqid-validator",
            });
          }
        }
      }

      // values[].attribute — существующий атрибут сущности действия?
      const valueAttrM = line.match(/^\s*-\s+attribute\s*:\s*([^\s#]+)/);
      if (valueAttrM && actionEntity && index) {
        const attrId = valueAttrM[1].replace(/["']/g, "");
        const domainPrefix = (currentDomainId || "").toLowerCase() + "/";
        let entityFqid = actionEntity.includes("/")
          ? actionEntity.toLowerCase()
          : (domainPrefix + actionEntity).toLowerCase();
        const entity = index.entitiesByFqid?.[entityFqid];
        if (entity) {
          const known = entity.attributes.some(
            (a: any) => a.id.toLowerCase() === attrId.toLowerCase(),
          );
          if (!known) {
            const startCol = line.indexOf(attrId) + 1;
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Атрибут «${attrId}» не найден в сущности ${actionEntity}`,
              startLineNumber: i + 1,
              startColumn: startCol,
              endLineNumber: i + 1,
              endColumn: startCol + attrId.length,
              source: "fqid-validator",
            });
          }
        }
      }

      // operation: должен соответствовать type
      const opM = line.match(/^\s*operation\s*:\s*([^\s#]+)/);
      if (opM) {
        const opValue = opM[1].replace(/["']/g, "");

        let idLine = -1;
        let idIndent = -1;
        for (let j = i - 1; j >= 0; j--) {
          const l = lines[j];
          if (!l.trim() || l.trim().startsWith("#")) continue;
          const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
          if (lInd === 0) break;
          const idm = l.match(/^(\s*)-\s+id\s*:/);
          if (idm) {
            idLine = j;
            idIndent = idm[1].length;
            break;
          }
        }
        if (idLine === -1) continue;

        let typeVal: string | null = null;
        for (let j = idLine + 1; j < i; j++) {
          const l = lines[j];
          const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
          if (lInd <= idIndent) break;
          const tm = l.match(/^\s*type\s*:\s*([^\s#]+)/);
          if (tm) {
            typeVal = tm[1].replace(/["']/g, "");
            break;
          }
        }
        if (!typeVal) continue;

        const opsByType: Record<string, string[]> = {
          open_modal: ["create", "edit"],
          open_page: ["create", "edit", "view"],
          bulk: ["remove", "edit", "edit_attribute"],
        };
        const allowed = opsByType[typeVal] || [];

        if (allowed.length > 0 && !allowed.includes(opValue)) {
          const startCol = line.indexOf(opValue) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Недопустимое operation для type: ${typeVal}. Ожидается: ${allowed.join(" | ")}`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + opValue.length,
            source: "fqid-validator",
          });
        }
      }
    }

    // ============ Валидация list-view ============
    {
      // Извлекаем все id колонок внутри views.table.columns
      const columnIds = new Set<string>();
      const sortingIds = new Set<string>();
      const actionIds = new Set<string>();
      const viewIds = new Set<string>();

      // Из текущего YAML
      let inViews = false;
      let inColumns = false;
      let inSortingBy = false;
      let inActions = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (sectionM) {
          inViews = sectionM[1] === "views";
          inColumns = false;
          inSortingBy = false;
          inActions = false;
          continue;
        }
        if (!inViews) continue;

        if (/^\s*columns\s*:\s*$/.test(line)) inColumns = true;
        else if (/^\s*sortingBy\s*:\s*$/.test(line)) inSortingBy = true;
        else if (/^\s*actions\s*:\s*$/.test(line)) inActions = true;
        else if (
          /^\s*[a-zA-Z_]\w*\s*:\s*$/.test(line) &&
          !/^\s*(filter|paging|refresh|empty)\s*:/.test(line)
        ) {
          // Другой контейнер — закрываем предыдущий
        }

        const idM = line.match(/^\s*-\s+id\s*:\s*([^\s#]+)/);
        if (idM) {
          const id = idM[1].replace(/["']/g, "").toLowerCase();
          viewIds.add(id);
          if (inColumns) columnIds.add(id);
        }
        const sortingM = line.match(/^\s*-\s+id\s*:\s*([^\s#]+)/);
      }

      // Из ModelIndex (sorting IDs)
      if (index?.entities) {
        // sorting идёт из entities[].sorting[].id, но сейчас не собираем — пропускаем
      }

      // Проверяем ссылки column: / sorting: / action: / widget: в views
      let currentSortingSection = false;
      inViews = false;
      inSortingBy = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (sectionM) {
          inViews = sectionM[1] === "views";
          inSortingBy = false;
          continue;
        }
        if (!inViews) continue;

        if (/^\s*sortingBy\s*:\s*$/.test(line)) inSortingBy = true;

        // column: <colId> внутри sortingBy
        const colM = line.match(/^\s*column\s*:\s*([^\s#]+)/);
        if (colM && inSortingBy) {
          const id = colM[1].replace(/["']/g, "");
          if (!columnIds.has(id.toLowerCase())) {
            const startCol = line.indexOf(id) + 1;
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Столбец «${id}» не найден среди columns[].id`,
              startLineNumber: i + 1,
              startColumn: startCol,
              endLineNumber: i + 1,
              endColumn: startCol + id.length,
              source: "fqid-validator",
            });
          }
        }

        // sorting: <sortingId>
        const sortM = line.match(/^\s*sorting\s*:\s*([^\s#]+)/);
        if (sortM) {
          const id = sortM[1].replace(/["']/g, "");
          const startCol = line.indexOf(id) + 1;
          // sortingID должен быть в entities[].sorting[].id — пропускаем без проверки
          // (это вне views, лень тащить)
        }
      }
    }

    // ============ Валидация mixins ============
    let inMixins = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        inMixins = sectionM[1] === "mixins";
        continue;
      }
      if (!inMixins) continue;

      // linkage: <ref> — должен быть в известных linkage
      const linkageM = line.match(/^\s*linkage\s*:\s*([^\s#]+)/);
      if (linkageM) {
        const id = linkageM[1].replace(/["']/g, "");
        const knownLinkageIds = new Set<string>();
        (index as any)?.entityLinkages?.forEach((l: any) => {
          knownLinkageIds.add(String(l.id).toLowerCase());
        });
        if (index?.schemasByDomain) {
          Object.values(index.schemasByDomain).forEach((s: any) => {
            s?.sections?.linkages?.items?.forEach((l: any) => {
              if (l?.id) knownLinkageIds.add(String(l.id).toLowerCase());
            });
          });
        }
        if (!knownLinkageIds.has(id.toLowerCase())) {
          const startCol = line.indexOf(id) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Связь «${id}» не найдена в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }

      // fromView: <viewId> — должен быть в views
      const fromViewM = line.match(/^\s*fromView\s*:\s*([^\s#]+)/);
      if (fromViewM) {
        const id = fromViewM[1].replace(/["']/g, "");
        const knownViews = new Set<string>();
        if (index?.schemasByDomain) {
          Object.values(index.schemasByDomain).forEach((s: any) => {
            s?.sections?.views?.items?.forEach((v: any) => {
              if (v?.id) knownViews.add(String(v.id).toLowerCase());
            });
          });
        }
        // Также из текущего YAML
        let currentViewsSection = false;
        for (let j = 0; j < lines.length; j++) {
          const l = lines[j];
          const sm = l.match(/^([a-zA-Z_][\w]*)\s*:/);
          if (sm) {
            currentViewsSection = sm[1] === "views";
            continue;
          }
          if (!currentViewsSection) continue;
          const idm = l.match(/^\s*-\s+id\s*:\s*([^\s#]+)/);
          if (idm) knownViews.add(idm[1].replace(/["']/g, "").toLowerCase());
        }
        if (!knownViews.has(id.toLowerCase())) {
          const startCol = line.indexOf(id) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `View «${id}» не найден в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }
    }

    // ============ Валидация сценариев (actions) ============
    {
      let inActions = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (sectionM) {
          inActions = sectionM[1] === "actions";
          continue;
        }
        if (!inActions) continue;

        // Внутри одного action собираем type и scenario
        const idM = line.match(/^\s*-\s+id\s*:/);
        if (idM) {
          // Новый экшен — ищем пару type/scenario в блоке до следующего - id:
          let actionType: string | null = null;
          let scenarioLine: number = -1;
          let scenarioValue: string | null = null;
          let typeLine: number = -1;

          for (let j = i + 1; j < lines.length; j++) {
            const l = lines[j];
            if (!l.trim() || l.trim().startsWith("#")) continue;
            const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
            if (/^\s*-\s+id\s*:/.test(l) && lInd <= 2) break;
            if (lInd === 0) break;

            const tm = l.match(/^\s*type\s*:\s*([^\s#]+)/);
            if (tm && actionType === null) {
              actionType = tm[1].replace(/["']/g, "");
              typeLine = j;
            }
            const sm = l.match(/^\s*scenario\s*:\s*([^\s#]+)/);
            if (sm && scenarioValue === null) {
              scenarioValue = sm[1].replace(/["']/g, "");
              scenarioLine = j;
            }
          }

          if (actionType === "scenario" && !scenarioValue && typeLine >= 0) {
            const tLine = lines[typeLine];
            const startCol =
              tLine.indexOf("scenario") !== -1
                ? tLine.indexOf("scenario") + 1
                : 1;
            markers.push({
              severity: monaco.MarkerSeverity.Error,
              message: `Для type: scenario обязательно поле scenario: <id>`,
              startLineNumber: typeLine + 1,
              startColumn: Math.max(1, startCol),
              endLineNumber: typeLine + 1,
              endColumn: tLine.length + 1,
              source: "fqid-validator",
            });
          }

          if (
            actionType &&
            actionType !== "scenario" &&
            scenarioValue &&
            scenarioLine >= 0
          ) {
            const sLine = lines[scenarioLine];
            const startCol = sLine.indexOf(scenarioValue) + 1;
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Поле scenario не имеет смысла при type: ${actionType} (ожидается type: scenario)`,
              startLineNumber: scenarioLine + 1,
              startColumn: startCol,
              endLineNumber: scenarioLine + 1,
              endColumn: startCol + scenarioValue.length,
              source: "fqid-validator",
            });
          }
        }
      }
    }

    monaco.editor.setModelMarkers(model, "fqid-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[fqid-validator]", err);
  }
}

/**
 * Возвращает имя top-level YAML-секции, в которой находится строка lineIdx0
 * (0-based). Секция — первый ключ с indent 0 над строкой.
 */
function getSectionAtLine(lines: string[], lineIdx0: number): string {
  for (let j = lineIdx0; j >= 0; j--) {
    const l = lines[j];
    if (!l) continue;
    // top-level ключ — только если нет ведущих пробелов
    if (/^\S/.test(l) && !l.trim().startsWith("#")) {
      const m = l.match(/^([a-zA-Z_][\w]*)\s*:/);
      return m ? m[1] : "";
    }
  }
  return "";
}

/**
 * Валидатор view-ссылок (view, modal, panel, form, tab, list, page,
 * fromView, addLinksView). В отличие от applyFqidMarkers, проверяет
 * по набору view-id текущего домена, а FQID на чужие домены пропускает.
 * Корректно работает с view-id, содержащими точку (lists.documents).
 */
export function applyViewRefMarkers(
  monaco: any,
  model: any,
  lines: string[],
  index: any,
  currentDomainId: string,
): void {
  try {
    const markers: any[] = [];

    const localDomain = (currentDomainId || "").toLowerCase();
    const schema = index?.schemasByDomain?.[currentDomainId];

    // ============ localViewIds: top-level views + nested views ============
    const localViewIds = new Set<string>();
    if (Array.isArray(schema?.allViews)) {
      for (const v of schema.allViews) {
        if (v?.id) localViewIds.add(String(v.id).toLowerCase());
      }
    }
    if (schema?.sections?.views?.items) {
      for (const v of schema.sections.views.items) {
        if (v?.id) localViewIds.add(String(v.id).toLowerCase());
      }
    }
    const els = index?.viewElementsByDomain?.[currentDomainId];
    if (els && typeof els === "object") {
      for (const vId of Object.keys(els)) localViewIds.add(vId.toLowerCase());
    }

    // ============ localGroupIds: все группы из всех top-level views ============
    // viewElementsByDomain[v].groups содержит группы всех уровней вложенности
    // (collectFromView рекурсирует по view.views и пишет в тот же набор).
    const localGroupIds = new Set<string>();
    if (els && typeof els === "object") {
      for (const view of Object.values(els) as Array<any>) {
        if (Array.isArray(view?.groups)) {
          for (const gid of view.groups)
            localGroupIds.add(String(gid).toLowerCase());
        }
        if (Array.isArray(view?.groupsWithType)) {
          for (const g of view.groupsWithType) {
            if (g?.id) localGroupIds.add(String(g.id).toLowerCase());
          }
        }
      }
    }

    // ============ Поля view-уровня и group-уровня ============
    const VIEW_REF_PATTERN =
      /^\s*(?:-\s+)?(view|modal|panel|list|fromView|addLinksView)\s*:\s*(.+)$/;
    const GROUP_REF_PATTERN = /^\s*(?:-\s+)?(tab|form|block)\s*:\s*(.+)$/;

    const checkRef = (
      i: number,
      line: string,
      rawValue: string,
      pool: Set<string>,
      kind: "view" | "group",
    ): void => {
      let value = rawValue.split(" #")[0].trim();
      if (!value) return;

      // `view: # todo` — после поля идёт только комментарий. Не ссылка.
      // Проверяем ДО снятия кавычек: `view: "#fix"` — легальный View ID,
      // там `#` внутри строки, а не комментарий.
      if (value.startsWith("#")) return;

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!value) return;
      if (value.startsWith("external:")) return;

      const slashIdx = value.indexOf("/");
      let domain: string | null = null;
      let localId = value;
      if (slashIdx > 0) {
        domain = value.slice(0, slashIdx).toLowerCase();
        localId = value.slice(slashIdx + 1);
      }
      if (domain && domain !== localDomain) return; // чужой домен — не наша зона

      if (!pool.has(localId.toLowerCase())) {
        const startCol = line.indexOf(value) + 1;
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message:
            kind === "view"
              ? `View «${localId}» не найден в домене ${currentDomainId}`
              : `Group «${localId}» не найдена в домене ${currentDomainId}`,
          startLineNumber: i + 1,
          startColumn: startCol,
          endLineNumber: i + 1,
          endColumn: startCol + value.length,
          source: "view-ref-validator",
        });
      }
    };

    // ============ Дополняем пулы из ТЕКУЩЕГО содержимого редактора ============
    // Критично после генерации: executeEdits вставляет новые views/groups в
    // Monaco, но ModelIndex на сервере остаётся старым (файл не сохранён,
    // /api/model возвращает кэш). Без этого все только что сгенерированные
    // view-id ловят false-positive «не найден в домене». То же — для ручных
    // правок до сохранения.
    //
    // Мы не различаем view-id и group-id по тексту YAML (для этого нужен
    // контекстный парсер), поэтому добавляем id в оба пула. Это ослабляет
    // валидацию (опечатка, совпавшая с чужим id, не будет поймана), но
    // полностью исключает ложные маркеры на свежих данных. Реальная
    // проверка всё равно произойдёт после сохранения → ребилд индекса →
    // повторный прогон валидатора.
    {
      const idRegex = /^\s*-\s+id\s*:\s*["']?([^\s"'#]+)["']?/;
      let inViewsSection = false;
      for (const line of lines) {
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
        if (ind === 0) {
          const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
          if (sm) inViewsSection = sm[1] === "views";
          continue;
        }
        if (!inViewsSection) continue;
        const m = line.match(idRegex);
        if (!m) continue;
        const id = m[1].toLowerCase();
        localViewIds.add(id);
        localGroupIds.add(id);
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const vm = line.match(VIEW_REF_PATTERN);
      if (vm) {
        const fieldName = vm[1];
        // В `mixins[].views[].to.*` поле `panel` / `list` резолвится в домене
        // целевой сущности (`entity.to` для linkage, `entity` для view),
        // который может быть ДРУГИМ доменом. Без полного контекста миксина
        // Monaco не может корректно проверить — оставляем это линтеру.
        const lineCtx = ctx.lineMap?.lineContexts.get(i + 1);
        const inMixins = lineCtx?.section === "mixins";
        if (inMixins && (fieldName === "panel" || fieldName === "list")) {
          continue;
        }
        // `dataTypes[].view` — конфиг представления Enum/Workflow/Table
        // (массив `{status,color}` / `{value,color}` / `{columns,paging,…}`),
        // не ссылка на view-id. Проверять по пулу view-id некорректно.
        if (
          fieldName === "view" &&
          getSectionAtLine(lines, i) === "dataTypes"
        ) {
          continue;
        }
        checkRef(i, line, vm[2], localViewIds, "view");
        continue;
      }
      const gm = line.match(GROUP_REF_PATTERN);
      if (gm) {
        checkRef(i, line, gm[2], localGroupIds, "group");
      }
    }

    // Проверка iconName на известность
    {
      const known = new Set(COMMON_ICON_NAMES.map(([n]) => n.toLowerCase()));
      let inMedias = false;
      let mediasIndent = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
        if (ind === 0) {
          const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
          inMedias = sm?.[1] === "medias";
          mediasIndent = -1;
          continue;
        }
        if (!inMedias) continue;
        const m = line.match(/^\s*iconName\s*:\s*["']?([^\s"'#]+)["']?/);
        if (!m) continue;
        const v = m[1];
        if (!known.has(v.toLowerCase())) {
          const startCol = line.indexOf(v) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Info,
            message: `iconName «${v}» не из стандартного набора Material Symbols (возможно, опечатка)`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + v.length,
            source: "view-ref-validator",
          });
        }
      }
    }

    monaco.editor.setModelMarkers(model, "view-ref-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[view-ref-validator]", err);
  }
}

// ============ Attribute-markers: уникальность id + системные имена ============

export function applyAttributeMarkers(
  monaco: any,
  model: any,
  lines: string[],
): void {
  try {
    const markers: any[] = [];

    // ============ Проходим только секцию entities ============
    let section = "";
    let sectionStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        section = sectionM[1];
        sectionStart = i;
        if (section !== "entities") continue;
        // Нашли entities — идём до конца или до следующей секции
        let j = i + 1;
        while (j < lines.length) {
          if (/^[a-zA-Z_][\w]*\s*:/.test(lines[j])) break;
          j++;
        }
        scanEntities(lines, i + 1, j, markers, monaco);
        i = j - 1;
      }
    }

    // ============ Финальный дедуп ============
    // Один маркер на (line, column, severity, message). Закрывает все
    // случаи, когда `scanEntities`/другие места положили несколько
    // одинаковых маркеров на одну и ту же позицию:
    //   - `attrIdList` содержит дубликаты (парсер засчитал `- id:` из
    //     вложенного `prefixRules`/`constraints` за атрибут);
    //   - `entityBlocks` содержит несколько блоков с одинаковым id,
    //     ссылающихся на одну и ту же строку;
    //   - любой будущий `markers.push`, добавленный без дедупа.
    // Визуально 4 одинаковых сообщения в тултипе — это один и тот же
    // маркер Monaco, отрисованный в одном gutter'е; пользователь видит
    // 4 строки в тултипе. Дедуп даёт ровно одну.
    const seenFinal = new Set<string>();
    const deduped: typeof markers = [];
    for (const mk of markers) {
      const key = [
        mk.startLineNumber,
        mk.startColumn,
        mk.endLineNumber,
        mk.endColumn,
        mk.severity,
        mk.message || "",
      ].join("\u0000");
      if (seenFinal.has(key)) continue;
      seenFinal.add(key);
      deduped.push(mk);
    }

    monaco.editor.setModelMarkers(model, "attribute-validator", deduped);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[attribute-validator]", err);
  }
}

function scanEntities(
  lines: string[],
  startIdx: number,
  endIdx: number,
  markers: any[],
  monaco: any,
): void {
  // ============ 1. Определяем indent "- " верхнего уровня (сущностей) ============
  let entityDashIndent = -1;
  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const dashM = line.match(/^(\s*)-\s+\S/);
    if (!dashM) continue;
    const indent = dashM[1].length;
    if (entityDashIndent === -1 || indent < entityDashIndent) {
      entityDashIndent = indent;
    }
  }
  if (entityDashIndent === -1) return;

  // Поля сущности идут либо как "- id: X" на entityDashIndent,
  // либо как "id: X" на entityDashIndent + 2.
  const fieldIndent = entityDashIndent + 2;

  interface EntityBlock {
    id: string;
    idLine: number;
    labelLine: number;
    descriptionLine: number;
    attrIdList: Array<{
      id: string;
      idLine: number;
      idIndent: number;
      description: string | null;
    }>;
  }
  const entityBlocks: EntityBlock[] = [];

  let i = startIdx;
  while (i < endIdx) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const dashM = line.match(/^(\s*)-\s+\S/);
    if (!dashM || dashM[1].length !== entityDashIndent) {
      i++;
      continue;
    }

    // Границы сущности — до следующего "- " с тем же indent
    let entityEnd = endIdx;
    for (let k = i + 1; k < endIdx; k++) {
      const l = lines[k];
      if (!l.trim() || l.trim().startsWith("#")) continue;
      const d = l.match(/^(\s*)-\s+\S/);
      if (d && d[1].length === entityDashIndent) {
        entityEnd = k;
        break;
      }
    }

    // id сущности: "- id: X" на entityDashIndent или "id: X" на fieldIndent
    let entityId: string | null = null;
    let entityIdLine = -1;
    for (let k = i; k < entityEnd; k++) {
      const l = lines[k];
      if (!l.trim() || l.trim().startsWith("#")) continue;

      const dashIdM = l.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
      if (dashIdM && dashIdM[1].length === entityDashIndent) {
        entityId = dashIdM[2].replace(/["']/g, "");
        entityIdLine = k + 1;
        break;
      }
      const idM = l.match(/^(\s*)id\s*:\s*([^\s#]+)/);
      if (idM && idM[1].length === fieldIndent) {
        entityId = idM[2].replace(/["']/g, "");
        entityIdLine = k + 1;
        break;
      }
    }
    if (!entityId) {
      i = entityEnd;
      continue;
    }

    // id сущности уже найден (entityId, entityIdLine).
    // Сканируем label: и description: на уровне полей сущности.
    let entityLabelLine = -1;
    let entityDescriptionLine = -1;
    for (let k = i + 1; k < entityEnd; k++) {
      const l = lines[k];
      if (!l.trim() || l.trim().startsWith("#")) continue;
      const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind !== fieldIndent) continue;

      if (entityLabelLine < 0 && /^\s*label\s*:/.test(l)) {
        entityLabelLine = k + 1;
        continue;
      }
      if (entityDescriptionLine < 0 && /^\s*description\s*:/.test(l)) {
        entityDescriptionLine = k + 1;
        continue;
      }
      if (entityLabelLine >= 0 && entityDescriptionLine >= 0) break;
    }

    // attributes: на fieldIndent (или "- attributes:" на entityDashIndent)
    let attributesLine = -1;
    let attributesEnd = entityEnd;
    for (let k = i + 1; k < entityEnd; k++) {
      const l = lines[k];
      const am = l.match(/^(\s*)(-\s+)?attributes\s*:\s*$/);
      if (!am) continue;
      const beforeIndent = am[1].length;
      const hasDash = !!am[2];
      const ok = hasDash
        ? beforeIndent === entityDashIndent
        : beforeIndent === fieldIndent;
      if (!ok) continue;
      attributesLine = k;
      for (let n = k + 1; n < entityEnd; n++) {
        const nl = lines[n];
        if (!nl.trim()) continue;
        const nIndent = (nl.match(/^(\s*)/) || ["", ""])[1].length;
        if (nIndent <= fieldIndent) {
          attributesEnd = n;
          break;
        }
      }
      break;
    }

    // Собираем "- " элементы внутри attributes[]
    const attrIdList: Array<{
      id: string;
      idLine: number;
      idIndent: number;
      description: string | null;
    }> = [];
    if (attributesLine >= 0) {
      let attrDashIndent = -1;
      for (let k = attributesLine + 1; k < attributesEnd; k++) {
        const l = lines[k];
        if (!l.trim() || l.trim().startsWith("#")) continue;
        const d = l.match(/^(\s*)-\s+\S/);
        if (d) {
          attrDashIndent = d[1].length;
          break;
        }
      }

      if (attrDashIndent > fieldIndent) {
        const attrFieldIndent = attrDashIndent + 2;
        for (let k = attributesLine + 1; k < attributesEnd; k++) {
          const l = lines[k];
          if (!l.trim() || l.trim().startsWith("#")) continue;
          const d = l.match(/^(\s*)-\s+\S/);
          if (!d || d[1].length !== attrDashIndent) continue;

          // Границы атрибута — до следующего "- " на attrDashIndent
          let attrEnd = attributesEnd;
          for (let n = k + 1; n < attributesEnd; n++) {
            const nl = lines[n];
            if (!nl.trim() || nl.trim().startsWith("#")) continue;
            const nd = nl.match(/^(\s*)-\s+\S/);
            if (nd && nd[1].length === attrDashIndent) {
              attrEnd = n;
              break;
            }
          }

          // id: "- id: X" на attrDashIndent или "id: X" на attrFieldIndent
          let attrId: string | null = null;
          let attrIdLine = -1;
          for (let n = k; n < attrEnd; n++) {
            const nl = lines[n];
            const dashIdM = nl.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
            if (dashIdM && dashIdM[1].length === attrDashIndent) {
              attrId = dashIdM[2].replace(/["']/g, "");
              attrIdLine = n + 1;
              break;
            }
            const idM = nl.match(/^(\s*)id\s*:\s*([^\s#]+)/);
            if (idM && idM[1].length === attrFieldIndent) {
              attrId = idM[2].replace(/["']/g, "");
              attrIdLine = n + 1;
              break;
            }
          }
          if (attrId) {
            // description на уровне полей атрибута (attrFieldIndent).
            // Собираем даже пустую строку — она эквивалентна отсутствию
            // (линтер тоже ругается на пустой description, см.
            // checkAttributeRecommended в linter.ts: `if (!a.description)`).
            let description: string | null = null;
            for (let n = k + 1; n < attrEnd; n++) {
              const nl = lines[n];
              if (!nl.trim() || nl.trim().startsWith("#")) continue;
              const nInd = (nl.match(/^(\s*)/) || ["", ""])[1].length;
              if (nInd !== attrFieldIndent) continue;
              const dm = nl.match(/^\s*description\s*:\s*(.*?)\s*(?:#.*)?$/);
              if (dm) {
                let v = dm[1].trim();
                if (
                  (v.startsWith('"') && v.endsWith('"')) ||
                  (v.startsWith("'") && v.endsWith("'"))
                ) {
                  v = v.slice(1, -1);
                }
                description = v;
                break;
              }
            }
            attrIdList.push({
              id: attrId,
              idLine: attrIdLine,
              idIndent: attrDashIndent,
              description,
            });
          }
          k = attrEnd - 1;
        }
      }
    }

    entityBlocks.push({
      id: entityId,
      idLine: entityIdLine,
      labelLine: entityLabelLine,
      descriptionLine: entityDescriptionLine,
      attrIdList,
    });
    i = entityEnd;
  }

  // ============ 2.0. Уникальность entity.id в домене ============
  const seenEntities = new Map<string, number[]>();
  for (const eb of entityBlocks) {
    if (!seenEntities.has(eb.id)) seenEntities.set(eb.id, []);
    seenEntities.get(eb.id)!.push(eb.idLine);
  }
  for (const [entityId, idLines] of seenEntities) {
    if (idLines.length < 2) continue;
    for (const line of idLines) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Дубликат entity.id «${entityId}» в домене (строки ${idLines.join(", ")})`,
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1_000_000,
        source: "attribute-validator",
        code: "duplicate-id/entities",
      });
    }
  }

  // ============ 2.1. Уникальность attribute.id ВНУТРИ сущности ============
  for (const eb of entityBlocks) {
    const seen = new Map<string, number[]>();
    for (const a of eb.attrIdList) {
      if (!seen.has(a.id)) seen.set(a.id, []);
      seen.get(a.id)!.push(a.idLine);
    }
    for (const [attrId, idLines] of seen) {
      if (idLines.length < 2) continue;
      for (const line of idLines) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: `Дубликат attribute.id «${attrId}» в сущности «${eb.id}» (строки ${idLines.join(", ")})`,
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1_000_000,
          source: "attribute-validator",
          code: "semantic/duplicate-attribute",
        });
      }
    }
  }

  // ============ 2.2. Системные имена ============
  const seenForSystemId = new Set<string>();
  for (const eb of entityBlocks) {
    for (const a of eb.attrIdList) {
      if (!SYSTEM_ATTRIBUTE_IDS.has(a.id)) continue;
      const key = `${eb.id.toLowerCase()}:${a.id.toLowerCase()}`;
      if (seenForSystemId.has(key)) continue;
      seenForSystemId.add(key);
      const line = lines[a.idLine - 1];
      const startCol = line.indexOf(a.id) + 1;
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Идентификатор «${eb.id}.${a.id}» зарезервирован системным атрибутом. Выберите другое имя.`,
        startLineNumber: a.idLine,
        startColumn: startCol > 0 ? startCol : 1,
        endLineNumber: a.idLine,
        endColumn: startCol > 0 ? startCol + a.id.length : 1_000_000,
        source: "attribute-validator",
        code: "naming/system-id-attribute",
      });
    }
  }

  // ============ 2.3. camelCase ============
  const RE_ATTRIBUTE_CAMEL = /^[a-z][a-zA-Z0-9]*$/;
  const seenForCamel = new Set<string>();
  for (const eb of entityBlocks) {
    for (const a of eb.attrIdList) {
      if (RE_ATTRIBUTE_CAMEL.test(a.id)) continue;
      const key = `${eb.id.toLowerCase()}:${a.id.toLowerCase()}`;
      if (seenForCamel.has(key)) continue;
      seenForCamel.add(key);
      const lineText = lines[a.idLine - 1] || "";
      const startCol = lineText.indexOf(a.id) + 1;
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `attribute.id «${eb.id}.${a.id}» не в camelCase (первая буква строчная, разделителей нет)`,
        startLineNumber: a.idLine,
        startColumn: startCol > 0 ? startCol : 1,
        endLineNumber: a.idLine,
        endColumn: startCol > 0 ? startCol + a.id.length : 1_000_000,
        source: "attribute-validator",
        code: "naming/attribute-camelcase",
      });
    }
  }

  // ============ 2.4. description ============
  const seenForDescription = new Set<string>();
  for (const eb of entityBlocks) {
    for (const a of eb.attrIdList) {
      if (a.description !== null) continue;
      const key = `${eb.id.toLowerCase()}:${a.id.toLowerCase()}`;
      if (seenForDescription.has(key)) continue;
      seenForDescription.add(key);
      markers.push({
        severity: monaco.MarkerSeverity.Info,
        message: `у атрибута «${eb.id}.${a.id}» нет description`,
        startLineNumber: a.idLine,
        startColumn: 1,
        endLineNumber: a.idLine,
        endColumn: 1_000_000,
        source: "attribute-validator",
        code: "recommended/attribute-description",
      });
    }
  }

  // ============ 2.5. camelCase для entity.id (PascalCase) ============
  const RE_ENTITY_CAMEL = /^[A-Z][a-zA-Z0-9]*$/;
  const seenForEntityCamel = new Set<string>();
  for (const eb of entityBlocks) {
    if (RE_ENTITY_CAMEL.test(eb.id)) continue;
    const key = eb.id.toLowerCase();
    if (seenForEntityCamel.has(key)) continue;
    seenForEntityCamel.add(key);

    const lineText = lines[eb.idLine - 1] || "";
    // Ищем позицию именно значения после `id:`, а не подстроку в `- id:`
    const colon = lineText.indexOf(":");
    const valueStart = colon >= 0 ? lineText.indexOf(eb.id, colon + 1) : -1;
    const startCol = valueStart >= 0 ? valueStart + 1 : 1;

    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      message: `entity.id «${eb.id}» не в PascalCase (первая буква заглавная, разделителей нет)`,
      startLineNumber: eb.idLine,
      startColumn: startCol,
      endLineNumber: eb.idLine,
      endColumn: valueStart >= 0 ? startCol + eb.id.length : 1_000_000,
      source: "attribute-validator",
      code: "naming/entity-camelcase",
    });
  }

  // ============ 2.6. description у сущности ============
  const seenForEntityDescription = new Set<string>();
  for (const eb of entityBlocks) {
    if (eb.descriptionLine >= 0) continue;
    const key = eb.id.toLowerCase();
    if (seenForEntityDescription.has(key)) continue;
    seenForEntityDescription.add(key);
    markers.push({
      severity: monaco.MarkerSeverity.Info,
      message: `у сущности «${eb.id}» нет description`,
      startLineNumber: eb.idLine,
      startColumn: 1,
      endLineNumber: eb.idLine,
      endColumn: 1_000_000,
      source: "attribute-validator",
      code: "recommended/entity-description",
    });
  }

  // ============ 2.7. label у сущности ============
  const seenForEntityLabel = new Set<string>();
  for (const eb of entityBlocks) {
    if (eb.labelLine >= 0) continue;
    const key = eb.id.toLowerCase();
    if (seenForEntityLabel.has(key)) continue;
    seenForEntityLabel.add(key);
    markers.push({
      severity: monaco.MarkerSeverity.Info,
      message: `у сущности «${eb.id}» нет label`,
      startLineNumber: eb.idLine,
      startColumn: 1,
      endLineNumber: eb.idLine,
      endColumn: 1_000_000,
      source: "attribute-validator",
      code: "recommended/entity-label",
    });
  }
}
/**
 * Валидатор ссылок внутри uiRules:
 *   - widget  → widget или view-id текущего домена
 *   - group   → group-id текущего домена
 *   - column  → column-id текущего домена
 *   - preset  → preset-id текущего домена
 *
 * Поле `view:` НЕ проверяется — оно уже покрыто applyViewRefMarkers
 * (по allViews текущего домена, корректно обрабатывает cross-domain).
 */
export function applyUiRuleRefMarkers(
  monaco: any,
  model: any,
  lines: string[],
  index: any,
  currentDomainId: string,
): void {
  try {
    const markers: any[] = [];

    const knownWidgets = new Set<string>();
    const knownGroups = new Set<string>();
    const knownColumns = new Set<string>();
    const knownPresets = new Set<string>();
    const knownViews = new Set<string>();

    // Из ModelIndex — предпочтительный источник
    if (index?.viewElementsByDomain?.[currentDomainId]) {
      const els = index.viewElementsByDomain[currentDomainId];
      for (const byView of Object.values(els) as any[]) {
        for (const w of byView.widgets || []) {
          knownWidgets.add(String(w).toLowerCase());
        }
        for (const g of byView.groups || []) {
          knownGroups.add(String(g).toLowerCase());
        }
        for (const c of byView.columns || []) {
          knownColumns.add(String(c).toLowerCase());
        }
      }
    }
    if (index?.uiPresetsByDomain?.[currentDomainId]) {
      for (const p of index.uiPresetsByDomain[currentDomainId]) {
        knownPresets.add(String(p).toLowerCase());
      }
    }
    if (index?.schemasByDomain?.[currentDomainId]?.sections?.views?.items) {
      for (const v of index.schemasByDomain[currentDomainId].sections.views
        .items) {
        if (v?.id) knownViews.add(String(v.id).toLowerCase());
      }
    }
    if (index?.schemasByDomain?.[currentDomainId]?.allViews) {
      for (const v of index.schemasByDomain[currentDomainId].allViews) {
        if (v?.id) knownViews.add(String(v.id).toLowerCase());
      }
    }

    // Из текущего YAML — всё, что объявлено в секции views (грубо, но
    // работает ещё до сохранения / ребилда индекса)
    const widgetDefRegex = /^\s*-\s+id\s*:\s*([^\s#]+)\s*$/;
    let lastSection = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) lastSection = sectionM[1];
      const idm = line.match(widgetDefRegex);
      if (!idm) continue;
      const id = idm[1].toLowerCase();
      if (lastSection === "uiPresets") knownPresets.add(id);
      if (lastSection === "views") {
        knownWidgets.add(id);
        knownGroups.add(id);
        knownColumns.add(id);
      }
    }

    // Проходим только по uiRules
    let inUiRules = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        inUiRules = sectionM[1] === "uiRules";
        continue;
      }
      if (!inUiRules) continue;

      const checkRef = (
        fieldName: string,
        known: Set<string>,
        humanName: string,
      ): void => {
        const m = line.match(
          new RegExp(`^\\s*-\\s*${fieldName}\\s*:\\s*([^\\s#]+)`),
        );
        if (!m) return;
        const id = m[1].replace(/["']/g, "");
        if (!id) return;
        if (id.includes("/")) return; // cross-domain — не проверяем локально
        if (id.startsWith("external:")) return;

        if (!known.has(id.toLowerCase())) {
          const startCol = line.indexOf(id) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `${humanName} «${id}» не найден в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "ui-rule-validator",
          });
        }
      };

      // widget может быть как id виджета, так и id view (для action-виджетов,
      // объявленных на уровне представления)
      const widgetCheckLine = line.match(/^\s*-\s*widget\s*:\s*([^\s#]+)/);
      if (widgetCheckLine) {
        const id = widgetCheckLine[1].replace(/["']/g, "");
        if (
          id &&
          !id.includes("/") &&
          !id.startsWith("external:") &&
          !knownWidgets.has(id.toLowerCase()) &&
          !knownViews.has(id.toLowerCase())
        ) {
          const startCol = line.indexOf(id) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Виджет «${id}» не найден в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "ui-rule-validator",
          });
        }
      }

      checkRef("group", knownGroups, "Группа");
      checkRef("column", knownColumns, "Колонка");
      checkRef("preset", knownPresets, "Пресет");
    }

    monaco.editor.setModelMarkers(model, "ui-rule-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ui-rule-validator]", err);
  }
}

/**
 * true, если текущий контейнер (`attributes:` / `linkages:`) находится
 * внутри `bulkSettings:` ближайшего action-блока.
 *
 * Работает по текстовому walk-up (без стека): идём вверх от startLine1Based-1,
 * ищем первое совпадение `bulkSettings:`, `- id:` (начался другой action)
 * или `indent === 0` (вышли из actions).
 */
function isInsideBulkSettings(
  getLine: (lineNumber1Based: number) => string,
  startLine1Based: number,
  minIndent: number,
): boolean {
  for (let i = startLine1Based - 1; i >= 1; i--) {
    const l = getLine(i);
    if (!l || !l.trim() || l.trim().startsWith("#")) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= minIndent) continue;

    if (/^\s*(?:-\s+)?bulkSettings\s*:\s*$/.test(l)) return true;
    if (/^\s*-\s+id\s*:\s*\S/.test(l)) return false;
    if (ind === 0) return false;
  }
  return false;
}

/**
 * Резолвит path по PATH_TO_CONTEXT, поддерживая префиксные правила:
 *   - exchangeSettings.entities.<X>              → exchangeEntitySettings
 *   - exchangeSettings.entities.<X>.attributeFormats → ??? (не поддерживается схемой)
 *   - mixins.views.<idx>.<change|replace>.add.*  → зеркалит mixins.views.change.add.*
 *   - mixins.views.<idx>.<change|replace>.delete.* → зеркалит mixins.views.change.delete.*
 *
 * Порядок: сначала прямой lookup, потом префиксные правила.
 */
function resolvePathToContext(path: string[]): string | null {
  if (path.length === 0) return null;
  const direct = PATH_TO_CONTEXT[path.join(".")];
  if (direct !== undefined) return direct;

  // exchangeSettings.entities.<X>
  if (
    path.length === 3 &&
    path[0] === "exchangeSettings" &&
    path[1] === "entities"
  ) {
    return "exchangeEntitySettings";
  }

  // mixins.views.<idx>.<change|replace>.add[.components|.tabs.tabs|.menu.menu|.position]
  // mixins.views уже отбрасывает индексы массивов (findContainerPath
  // не пушит `-`), но на всякий случай нормализуем:
  //   ["mixins","views","change","add","components"]
  //   ["mixins","views","replace","components"]  ← тоже возможно
  if (path[0] === "mixins" && path[1] === "views") {
    if (path[2] === "change" && path[3] === "add") {
      const tail = path.slice(4).join(".");
      if (tail === "components") return "viewGroupComponent";
      if (tail === "tabs.tabs") return "mixinTabRef";
      if (tail === "menu.menu") return "mixinActionRef";
      if (tail === "position") return "mixinPosition";
      return "mixinChangeAdd";
    }
    if (path[2] === "change" && path[3] === "delete") {
      const tail = path.slice(4).join(".");
      if (tail === "components") return "viewGroupComponent";
      if (tail === "tabs") return "mixinTabRef";
      if (tail === "menu") return "mixinActionRef";
      if (tail === "columns") return "mixinColumnRef";
      return null;
    }
    if (path[2] === "replace") {
      const tail = path.slice(3).join(".");
      if (tail === "components") return "viewGroupComponent";
      if (tail === "tabs") return "mixinTabRef";
      if (tail === "menu") return "mixinActionRef";
      if (tail === "actionPanel") return "mixinActionRef";
      return null;
    }
    if (path.length === 3) return "mixinView";
    if (path[2] === "to") return "mixinViewTo";
  }

  return null;
}

// ============ Quick fix builder (для "Fix all in file") ============

export interface QuickFixEdit {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  text: string;
}

export interface QuickFix {
  kind: "camelcase" | "label" | "description";
  edits: QuickFixEdit[];
}

const QUICKFIX_SOURCES = new Set<string>(["dg-linter", "attribute-validator"]);

/**
 * Возвращает готовые правки для маркера линтера. Используется:
 *   - CodeActionProvider (по одной правке на клик),
 *   - "Fix all in file" (batch-применение).
 *
 * Держим в одном месте, чтобы не дублировать логику camelCase / label /
 * description в двух местах.
 */
export function buildQuickFix(marker: any, model: any): QuickFix | null {
  if (!marker) return null;
  const source = String(marker.source || "");
  if (source && !QUICKFIX_SOURCES.has(source)) return null;

  const kind = classifyQuickFix(marker.code, marker.message);

  const code = String(marker.code || "").toLowerCase();
  const msg = String(marker.message || "");
  const msgLower = msg.toLowerCase();

  // ═══════════════════════════════════════════════════════════
  // 1. Переименование (camelCase / PascalCase / snake_case / kebab-case)
  // ═══════════════════════════════════════════════════════════
  if (kind === "camelcase") {
    // Определяем: entity или attribute. Приоритет — code.
    const isAttribute = code.includes("attribute") || /атрибут/i.test(msg);

    const lineText = model.getLineContent(marker.startLineNumber);
    // Ищем именно `id:` (не `- id:` не имеет значения — `- ` уже в начале строки)
    const idMatch = lineText.match(/\bid\s*:\s*([a-zA-Z0-9_\-]+)/);
    if (!idMatch || !idMatch[1]) {
      return null;
    }

    const oldId = idMatch[1];
    const parts = oldId.split(/[_\-]+/).filter(Boolean);
    if (parts.length === 0) return null;

    const pascal = parts
      .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("");

    const newId = isAttribute
      ? pascal.charAt(0).toLowerCase() + pascal.slice(1)
      : pascal;

    if (newId === oldId) {
      return null;
    }

    const startCol = lineText.indexOf(oldId) + 1;
    if (startCol <= 0) return null;

    const oldIdStart = (idMatch.index ?? 0) + idMatch[0].length - oldId.length;

    return {
      kind: "camelcase",
      edits: [
        {
          startLineNumber: marker.startLineNumber,
          startColumn: oldIdStart + 1,
          endLineNumber: marker.startLineNumber,
          endColumn: oldIdStart + 1 + oldId.length,
          text: newId,
        },
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 2. label
  // ═══════════════════════════════════════════════════════════

  if (kind === "label") {
    const lineContent = model.getLineContent(marker.startLineNumber);
    const indentMatch = lineContent.match(/^(\s*)/);
    const rawIndent = indentMatch ? indentMatch[1].length : 0;
    const startsWithDash = /^\s*-/.test(lineContent);
    // Если строка `- id:` — реальный field-indent на 2 больше;
    // если `id:` без dash (форма `- attributes:` first) — indent уже правильный.
    const fieldIndent = rawIndent + (startsWithDash ? 2 : 0);
    const indent = " ".repeat(fieldIndent);
    const insertCol = lineContent.length + 1;
    return {
      kind: "label",
      edits: [
        {
          startLineNumber: marker.startLineNumber,
          startColumn: insertCol,
          endLineNumber: marker.startLineNumber,
          endColumn: insertCol,
          text: `\n${indent}label: "{id}"`,
        },
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 3. description
  // ═══════════════════════════════════════════════════════════
  if (kind === "description") {
    const lineContent = model.getLineContent(marker.startLineNumber);
    const indentMatch = lineContent.match(/^(\s*)/);
    const rawIndent = indentMatch ? indentMatch[1].length : 0;
    const startsWithDash = /^\s*-/.test(lineContent);
    const fieldIndent = rawIndent + (startsWithDash ? 2 : 0);
    const indent = " ".repeat(fieldIndent);
    const insertCol = lineContent.length + 1;
    return {
      kind: "label",
      edits: [
        {
          startLineNumber: marker.startLineNumber,
          startColumn: insertCol,
          endLineNumber: marker.startLineNumber,
          endColumn: insertCol,
          text: `\n${indent}description: ""`,
        },
      ],
    };
  }

  return null;
}

/**
 * Резолвит AttributeRecord по id в цепочке наследования сущности.
 * Возвращает null, если атрибут не найден ни у самой сущности, ни у предков.
 */
function findAttrInEntityChain(
  entity: any,
  attrId: string,
  index: any,
): any | null {
  if (!entity || !attrId || !index) return null;
  const seen = new Set<string>();
  let cur: any = entity;
  while (cur && !seen.has(cur.fqid)) {
    seen.add(cur.fqid);
    const found = (cur.attributes || []).find((a: any) => a.id === attrId);
    if (found) return found;
    cur = cur.inherits ? index.entitiesByFqid[cur.inherits] : undefined;
  }
  return null;
}

/**
 * Возвращает true, если `prefix` (то, что уже набрал пользователь)
 * имеет хотя бы одно совпадение среди suggestions (прямое или fuzzy).
 * Нужно, чтобы Monaco не открывал widget с "No suggestions", который
 * потом перехватывает стрелки.
 */
function hasPrefixMatch(suggestions: any[], prefix: string): boolean {
  if (!prefix) return true;
  const p = prefix.toLowerCase();
  for (const s of suggestions) {
    const label = String(s.label || "").toLowerCase();
    if (!label) continue;
    if (label.startsWith(p) || label.includes(p)) return true;
    // fuzzy: p — подпоследовательность label
    let pi = 0;
    for (let i = 0; i < label.length && pi < p.length; i++) {
      if (label[i] === p[pi]) pi++;
    }
    if (pi === p.length) return true;
  }
  return false;
}

interface TransitiveJoinContext {
  parentEntityFqid: string | null;
  currentDomain: string;
}

/**
 * Возвращает контекст join-блока внутри transitiveLinkages[].joins[].
 * parent — target предыдущего sibling-join или entity корня transitiveLinkage.
 */
function detectTransitiveJoinContext(
  model: any,
  position: any,
  currentDomain: string,
  index: ModelIndex | null,
): TransitiveJoinContext | null {
  if (!index) return null;

  // 1. Секция?
  let sectionName = "";
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) {
      const m = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) sectionName = m[1];
      break;
    }
  }
  if (sectionName !== "transitiveLinkages") return null;

  // 2. Наш dash-line
  const currentLine = model.getLineContent(position.lineNumber);
  const currentIndent = (currentLine.match(/^(\s*)/) || ["", ""])[1].length;

  let dashLine = -1;
  let dashIndent = -1;
  const curDashM = currentLine.match(/^(\s*)-\s+\S?/);
  if (curDashM) {
    dashLine = position.lineNumber;
    dashIndent = curDashM[1].length;
  } else {
    for (let i = position.lineNumber - 1; i >= 1; i--) {
      const line = model.getLineContent(i);
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind < currentIndent) {
        const m = line.match(/^(\s*)-\s+\S/);
        if (m) {
          dashLine = i;
          dashIndent = m[1].length;
        }
        break;
      }
    }
  }
  if (dashLine < 0) return null;

  // 3. Убеждаемся, что мы внутри joins[] (а не в корне)
  let joinsAboveLine = -1;
  let joinsAboveIndent = -1;
  for (let i = dashLine - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) break;
    const jm = line.match(/^(\s*)joins\s*:\s*$/);
    if (jm && jm[1].length < dashIndent) {
      joinsAboveLine = i;
      joinsAboveIndent = jm[1].length;
      break;
    }
  }
  if (joinsAboveLine < 0) return null;

  // 4. Корень transitiveLinkages — `- id:` с меньшим indent, чем joinsAboveIndent
  let tlStart = -1;
  let tlIndent = -1;
  for (let i = joinsAboveLine - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) break;
    const m = line.match(/^(\s*)-\s+id\s*:/);
    if (m) {
      tlStart = i;
      tlIndent = m[1].length;
      break;
    }
  }
  if (tlStart < 0) return null;

  // 5. entity: корня
  let rootEntityId: string | null = null;
  for (let i = tlStart + 1; i <= model.getLineCount(); i++) {
    const line = model.getLineContent(i);
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind <= tlIndent) break;
    if (ind === tlIndent + 2) {
      const m = line.match(/^\s*entity\s*:\s*([^\s#]+)/);
      if (m) {
        rootEntityId = m[1].replace(/["']/g, "");
        break;
      }
    }
  }
  if (!rootEntityId) {
    return { parentEntityFqid: null, currentDomain };
  }

  // 6. Пройти по sibling-join выше текущего, последовательно резолвя target
  //    Начинаем от targetJoinsLine (это joinsAboveLine) и идём до dashLine.
  const targetJoinsLine = joinsAboveLine;
  const targetJoinsIndent = joinsAboveIndent;

  let joinItemIndent = -1;
  for (let i = targetJoinsLine + 1; i <= model.getLineCount(); i++) {
    const line = model.getLineContent(i);
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind <= targetJoinsIndent) break;
    const dm = line.match(/^(\s*)-\s+\S/);
    if (dm) {
      joinItemIndent = dm[1].length;
      break;
    }
  }
  if (joinItemIndent < 0) {
    return { parentEntityFqid: null, currentDomain };
  }

  let currentParent = `${currentDomain}/${rootEntityId}`.toLowerCase();

  let cur = targetJoinsLine + 1;
  while (cur < dashLine) {
    const line = model.getLineContent(cur);
    if (!line.trim()) {
      cur++;
      continue;
    }
    const dm = line.match(/^(\s*)-\s+\S/);
    if (!dm || dm[1].length !== joinItemIndent) {
      cur++;
      continue;
    }

    let joinEnd = dashLine;
    for (let k = cur + 1; k < dashLine; k++) {
      const lk = model.getLineContent(k);
      if (!lk.trim()) continue;
      const ik = (lk.match(/^(\s*)/) || ["", ""])[1].length;
      if (ik < joinItemIndent) {
        joinEnd = k;
        break;
      }
      const dk = lk.match(/^(\s*)-\s+\S/);
      if (dk && dk[1].length === joinItemIndent) {
        joinEnd = k;
        break;
      }
    }

    let linkageRef: string | null = null;
    let side: 1 | 2 | undefined;
    for (let k = cur; k < joinEnd; k++) {
      const l = model.getLineContent(k);
      const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (lInd !== joinItemIndent && lInd !== joinItemIndent + 2) continue;
      if (!linkageRef) {
        const lm = l.match(/^\s*(?:-\s+)?linkage\s*:\s*([^\s#]+)/);
        if (lm) linkageRef = lm[1].replace(/["']/g, "");
      }
      if (side === undefined) {
        const sm = l.match(/^\s*side\s*:\s*([12])/);
        if (sm) side = parseInt(sm[1], 10) as 1 | 2;
      }
    }

    if (linkageRef && currentParent) {
      const linkage = resolveLinkageForMonaco(linkageRef, currentDomain, index);
      if (linkage) {
        const parentLower = currentParent.toLowerCase();
        const isSymmetric = linkage.side1Fqid === linkage.side2Fqid;
        let target: string | null = null;
        if (isSymmetric) {
          target = linkage.side1Fqid === parentLower ? linkage.side2Fqid : null;
        } else {
          const eff = side === 2 ? 2 : 1;
          const parentSide = eff === 1 ? linkage.side1Fqid : linkage.side2Fqid;
          const childSide = eff === 1 ? linkage.side2Fqid : linkage.side1Fqid;
          if (parentSide === parentLower) target = childSide;
          else if (linkage.side1Fqid === parentLower)
            target = linkage.side2Fqid;
          else if (linkage.side2Fqid === parentLower)
            target = linkage.side1Fqid;
        }
        if (target) currentParent = target;
      }
    }
    cur = joinEnd;
  }

  return { parentEntityFqid: currentParent, currentDomain };
}

function buildTransitiveLinkageCandidates(
  parentFqid: string | null,
  currentDomain: string,
  Kind: any,
): RefSuggestion[] {
  const index = ctx.modelIndex;
  if (!index) return [];

  interface C {
    l: any;
    score: number;
    detail: string;
  }
  const candidates: C[] = [];

  for (const l of index.entityLinkages) {
    if ((l.domainId || "").toLowerCase() !== currentDomain) continue;

    const side1Rel = parentFqid
      ? relationOf(parentFqid, l.side1Fqid, index)
      : null;
    const side2Rel = parentFqid
      ? relationOf(parentFqid, l.side2Fqid, index)
      : null;
    const isUndirected = l.type === "n_n" && l.undirected === true;
    const peer1 = l.side1Fqid.split("/").pop() || l.side1Fqid;
    const peer2 = l.side2Fqid.split("/").pop() || l.side2Fqid;

    let score = 10;
    let detail = l.type;

    if (l.type === "1_n") {
      if (side1Rel === "same") {
        score = 1000;
        detail = `1_n · parent → ${peer2}`;
      } else if (side1Rel === "ancestor") {
        score = 900;
        detail = `1_n · parent наследует side1 · → ${peer2}`;
      } else if (side2Rel === "same") {
        score = 300;
        detail = `1_n · inverted (parent на many-стороне)`;
      } else {
        score = 100;
        detail = `1_n · не связан с parent`;
      }
    } else if (l.type === "n_n") {
      if (isUndirected) {
        score = 200;
        detail = `n_n undirected`;
      } else if (side1Rel === "same" || side2Rel === "same") {
        score = 500;
        detail = `n_n · ${peer1} ↔ ${peer2}`;
      } else {
        score = 200;
        detail = `n_n · не связан с parent`;
      }
    } else if (l.type === "1_1") {
      score = 30;
      detail = `1_1 · не подходит для цепочки`;
    } else {
      detail = l.type;
    }

    candidates.push({ l, score, detail });
  }

  candidates.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.l.id.localeCompare(b.l.id),
  );

  return candidates.map(({ l, score, detail }) => ({
    label: l.id,
    insertText: " " + l.id,
    kind: Kind.Reference,
    sortText: (2000 - score).toString().padStart(4, "0") + "_" + l.id,
    detail,
    documentation: `${l.type} · ${l.side1Fqid} → ${l.side2Fqid}`,
  }));
}
export function applyTransitiveMarkers(
    monaco: any,
    model: any,
    lines: string[],
    index: ModelIndex | null,
    currentDomainId: string,
): void {
    if (!index) {
        monaco.editor.setModelMarkers(model, "transitive-validator", []);
        return;
    }

    const markers: any[] = [];
    const cur = currentDomainId.toLowerCase();

    // ── Секция transitiveLinkages ──
    let sectionStart = -1;
    let sectionEnd = lines.length;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
        if (ind === 0) {
            const m = line.match(/^([a-zA-Z_][\w]*)\s*:/);
            if (m) {
                if (m[1] === "transitiveLinkages") sectionStart = i;
                else if (sectionStart >= 0) {
                    sectionEnd = i;
                    break;
                }
            }
        }
    }
    if (sectionStart < 0) {
        monaco.editor.setModelMarkers(model, "transitive-validator", []);
        return;
    }

    let itemIndent = -1;
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
        const m = lines[i].match(/^(\s*)-\s+id\s*:/);
        if (m) {
            itemIndent = m[1].length;
            break;
        }
    }
    if (itemIndent < 0) {
        monaco.editor.setModelMarkers(model, "transitive-validator", []);
        return;
    }

    const entityLookup = (entityId: string | null): EntityRecord | null => {
        if (!entityId) return null;
        if (entityId.includes("/"))
            return index.entitiesByFqid[entityId.toLowerCase()] || null;
        return index.entitiesByFqid[`${cur}/${entityId}`.toLowerCase()] || null;
    };

    // Inheritance-aware: ancestorFqid — сам descFqid или его предок
    const isSameOrAncestor = (
        ancestorFqid: string,
        descFqid: string,
    ): boolean => {
        if (!ancestorFqid || !descFqid) return false;
        const ancL = ancestorFqid.toLowerCase();
        let walkCur: string | undefined = descFqid.toLowerCase();
        const seen = new Set<string>();
        while (walkCur && !seen.has(walkCur)) {
            seen.add(walkCur);
            if (walkCur === ancL) return true;
            const e = index.entitiesByFqid[walkCur];
            if (!e || !e.inherits) return false;
            walkCur = e.inherits.toLowerCase();
        }
        return false;
    };

    const emit = (
        line: number,
        col: number,
        len: number,
        sev: any,
        msg: string,
        code: string,
    ) => {
        markers.push({
            severity: sev,
            message: msg,
            startLineNumber: line,
            startColumn: col,
            endLineNumber: line,
            endColumn: col + len,
            source: "transitive-validator",
            code,
        });
    };

    for (let i = sectionStart + 1; i < sectionEnd; i++) {
        const idM = lines[i].match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (!idM || idM[1].length !== itemIndent) continue;

        const tlEnd = (() => {
            for (let j = i + 1; j < sectionEnd; j++) {
                if (!lines[j].trim()) continue;
                const ind = (lines[j].match(/^(\s*)/) || ["", ""])[1].length;
                if (ind < itemIndent) return j;
                const d = lines[j].match(/^(\s*)-\s+\S/);
                if (d && d[1].length === itemIndent) return j;
            }
            return sectionEnd;
        })();

        // ── entity: корня ──
        let rootEntityId: string | null = null;
        let rootEntityLine = -1;
        let rootEntityCol = 1;
        for (let j = i + 1; j < tlEnd; j++) {
            const line = lines[j];
            if (!line.trim()) continue;
            const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
            if (ind !== itemIndent + 2) continue;
            const m = line.match(/^\s*entity\s*:\s*([^\s#]+)/);
            if (m) {
                rootEntityId = m[1].replace(/["']/g, "");
                rootEntityLine = j;
                rootEntityCol = line.indexOf(rootEntityId) + 1;
                break;
            }
        }

        const rootEntity = entityLookup(rootEntityId);
        if (rootEntityId && !rootEntity && rootEntityLine >= 0) {
            const missingDomain = isForeignDomainNotLoaded(
                rootEntityId,
                index,
            );
            if (missingDomain) {
                emit(
                    rootEntityLine + 1,
                    rootEntityCol,
                    rootEntityId.length,
                    monaco.MarkerSeverity.Info,
                    `Сущность «${rootEntityId}» — домен «${missingDomain}» не загружен в кэш`,
                    "transitiveLinkage/entity-domain-not-loaded",
                );
            } else {
                emit(
                    rootEntityLine + 1,
                    rootEntityCol,
                    rootEntityId.length,
                    monaco.MarkerSeverity.Error,
                    `Сущность «${rootEntityId}» не найдена в домене ${cur}`,
                    "transitiveLinkage/entity-unknown",
                );
            }
        }

        let currentParent: string | null = rootEntity
            ? rootEntity.fqid.toLowerCase()
            : rootEntityId
              ? `${cur}/${rootEntityId}`.toLowerCase()
              : null;

        // ── joins: ──
        let joinsLine = -1;
        let joinsIndent = -1;
        for (let j = i + 1; j < tlEnd; j++) {
            const m = lines[j].match(/^(\s*)joins\s*:\s*$/);
            if (m) {
                joinsLine = j;
                joinsIndent = m[1].length;
                break;
            }
        }
        if (joinsLine < 0) continue;

        const walk = (
            parentFqid: string | null,
            containerLine: number,
            containerIndent: number,
            containerEnd: number,
        ): string | null => {
            let joinIndent = -1;
            for (let j = containerLine + 1; j < containerEnd; j++) {
                if (!lines[j].trim()) continue;
                const d = lines[j].match(/^(\s*)-\s+\S/);
                if (d && d[1].length > containerIndent) {
                    joinIndent = d[1].length;
                    break;
                }
            }
            if (joinIndent < 0) return parentFqid;

            let currentParentLocal = parentFqid;
            let j = containerLine + 1;
            while (j < containerEnd) {
                if (!lines[j].trim()) {
                    j++;
                    continue;
                }
                const ind = (lines[j].match(/^(\s*)/) || ["", ""])[1].length;
                if (ind <= containerIndent) break;
                const d = lines[j].match(/^(\s*)-\s+\S/);
                if (!d || d[1].length !== joinIndent) {
                    j++;
                    continue;
                }

                const childStart = j;
                let childEnd = containerEnd;
                for (let k = j + 1; k < containerEnd; k++) {
                    if (!lines[k].trim()) continue;
                    const kInd = (lines[k].match(/^(\s*)/) || ["", ""])[1]
                        .length;
                    if (kInd < joinIndent) {
                        childEnd = k;
                        break;
                    }
                    const kd = lines[k].match(/^(\s*)-\s+\S/);
                    if (kd && kd[1].length === joinIndent) {
                        childEnd = k;
                        break;
                    }
                }

                let linkageId: string | null = null;
                let linkageLine = -1;
                let linkageCol = 1;
                let side: 1 | 2 | undefined;

                for (let k = childStart; k < childEnd; k++) {
                    const l = lines[k];
                    if (!l.trim()) continue;
                    const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
                    if (lInd !== joinIndent && lInd !== joinIndent + 2)
                        continue;

                    if (linkageId === null) {
                        const m = l.match(
                            /^\s*(?:-\s+)?linkage\s*:\s*([^\s#]+)/,
                        );
                        if (m) {
                            linkageId = m[1].replace(/["']/g, "");
                            linkageLine = k;
                            linkageCol = l.indexOf(linkageId) + 1;
                        }
                    }
                    if (side === undefined) {
                        const m = l.match(/^\s*side\s*:\s*([12])/);
                        if (m) side = parseInt(m[1], 10) as 1 | 2;
                    }
                }

                // ── Резолв linkage (FQID-aware) ──
                const linkageRec = linkageId
                    ? resolveLinkageForMonaco(linkageId, cur, index)
                    : null;

                if (linkageId && !linkageRec && linkageLine >= 0) {
                    const missingDomain = isForeignDomainNotLoaded(
                        linkageId,
                        index,
                    );
                    if (missingDomain) {
                        emit(
                            linkageLine + 1,
                            linkageCol,
                            linkageId.length,
                            monaco.MarkerSeverity.Info,
                            `Связь «${linkageId}» — домен «${missingDomain}» не загружен в кэш`,
                            "transitiveLinkage/linkage-domain-not-loaded",
                        );
                    } else {
                        emit(
                            linkageLine + 1,
                            linkageCol,
                            linkageId.length,
                            monaco.MarkerSeverity.Error,
                            `Связь «${linkageId}» не найдена в домене ${cur}`,
                            "transitiveLinkage/linkage-unknown",
                        );
                    }
                }

                if (linkageRec && currentParentLocal && linkageLine >= 0) {
                    const isSymmetric =
                        linkageRec.side1Fqid === linkageRec.side2Fqid;
                    const isDirected = !(
                        linkageRec.type === "n_n" && linkageRec.undirected
                    );

                    if (isSymmetric && isDirected && !side) {
                        emit(
                            linkageLine + 1,
                            linkageCol,
                            linkageId!.length,
                            monaco.MarkerSeverity.Warning,
                            `Связь "${linkageId}" симметричная направленная — укажите side: 1 или 2`,
                            "transitiveLinkage/side-required",
                        );
                    }

                    const parentLower = currentParentLocal.toLowerCase();

                    // ── Inheritance-aware достижимость ──
                    const reachableForward = isSameOrAncestor(
                        linkageRec.side1Fqid,
                        parentLower,
                    );
                    const reachableBackward = isSameOrAncestor(
                        linkageRec.side2Fqid,
                        parentLower,
                    );

                    if (!reachableForward && !reachableBackward) {
                        emit(
                            linkageLine + 1,
                            linkageCol,
                            linkageId!.length,
                            monaco.MarkerSeverity.Error,
                            `linkage "${linkageId}" (${linkageRec.side1Fqid.split("/").pop()} → ${linkageRec.side2Fqid.split("/").pop()}) не соединяет parent «${currentParentLocal.split("/").pop()}»`,
                            "transitiveLinkage/not-reachable",
                        );
                    }
                    // inverted-1n удалён — для транзитивной цепочки
                    // ориентация 1_n не критична, хопы могут идти в любом
                    // направлении.

                    // ── Резолв target для следующего хопа ──
                    let target: string | null = null;
                    if (isSymmetric) {
                        if (reachableForward) target = linkageRec.side2Fqid;
                    } else {
                        const eff = side === 2 ? 2 : 1;
                        const parentSide =
                            eff === 1
                                ? linkageRec.side1Fqid
                                : linkageRec.side2Fqid;
                        const childSide =
                            eff === 1
                                ? linkageRec.side2Fqid
                                : linkageRec.side1Fqid;

                        if (isSameOrAncestor(parentSide, parentLower)) {
                            target = childSide;
                        } else if (reachableForward) {
                            target = linkageRec.side2Fqid;
                        } else if (reachableBackward) {
                            target = linkageRec.side1Fqid;
                        }
                    }
                    if (target) currentParentLocal = target;
                }

                // ── Вложенные joins ──
                let nestedJoinsLine = -1;
                let nestedJoinsIndent = -1;
                for (let k = childStart + 1; k < childEnd; k++) {
                    const m = lines[k].match(/^(\s*)joins\s*:\s*$/);
                    if (m) {
                        nestedJoinsLine = k;
                        nestedJoinsIndent = m[1].length;
                        break;
                    }
                }
                if (nestedJoinsLine >= 0) {
                    walk(
                        currentParentLocal,
                        nestedJoinsLine,
                        nestedJoinsIndent,
                        childEnd,
                    );
                }

                j = childEnd;
            }

            return currentParentLocal;
        };

        walk(currentParent, joinsLine, joinsIndent, tlEnd);
        i = tlEnd - 1;
    }

    monaco.editor.setModelMarkers(model, "transitive-validator", markers);
}

/**
 * Резолвит ссылку на linkage с учётом FQID.
 *   - `id`                          → текущий домен
 *   - `<domain>/<id>`               → указанный домен
 * Ведёт себя как линтер в `checkTransitiveLinkages`, т.е. работает
 * с linkages из всех доменов кэша, а не только из текущего.
 */
function resolveLinkageForMonaco(
    ref: string | null | undefined,
    currentDomain: string,
    index: ModelIndex | null,
): EntityLinkage | null {
    if (!index || !ref) return null;
    const trimmed = String(ref).trim();
    if (!trimmed) return null;

    const slash = trimmed.indexOf("/");
    const targetDomain =
        slash > 0
            ? trimmed.slice(0, slash).toLowerCase()
            : currentDomain.toLowerCase();
    const id = slash > 0 ? trimmed.slice(slash + 1) : trimmed;
    const idLower = id.toLowerCase();

    return (
        (index.entityLinkages || []).find(
            (l) =>
                (l.domainId || "").toLowerCase() === targetDomain &&
                l.id.toLowerCase() === idLower,
        ) || null
    );
}

/**
 * true, если `refFqid` — это FQID <domain>/<Entity>, где домен
 * отсутствует в текущем кэше. Используется, чтобы отличать
 * «связь не найдена» (Error) от «домен не загружен» (Info).
 */
function isForeignDomainNotLoaded(
    ref: string,
    index: ModelIndex | null,
): string | null {
    if (!index || !ref) return null;
    const slash = ref.indexOf("/");
    if (slash <= 0) return null;
    const domain = ref.slice(0, slash).toLowerCase();
    if (!domain) return null;
    const loaded = (index.domains || []).some(
        (d) => String(d.id).toLowerCase() === domain,
    );
    return loaded ? null : domain;
}
