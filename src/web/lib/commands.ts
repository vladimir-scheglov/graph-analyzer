import type { LayoutType } from "./layout";
import type { HeatmapKey } from "../state/useGraphStore";

export interface Command {
  section: string;
  icon: string;
  label: string;
  hotkey?: string;
  keywords?: string;
  iconName?: string;
  run: () => void;
}

export interface BuildCommandsContext {
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  compact: boolean;
  setCompact: (v: boolean | ((p: boolean) => boolean)) => void;
  showGroups: boolean;
  setShowGroups: (v: boolean) => void;
  bidirectional: boolean;
  setBidirectional: (v: boolean) => void;
  showEdgeLabels: boolean;
  setShowEdgeLabels: (v: boolean) => void;
  tooltipsEnabled: boolean;
  setTooltipsEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
  heatmap: HeatmapKey;
  setHeatmap: (h: HeatmapKey) => void;
  isolatedOnly: boolean;
  setIsolatedOnly: (v: boolean | ((p: boolean) => boolean)) => void;
  nsMode: boolean;
  setNsMode: (v: boolean | ((p: boolean) => boolean)) => void;
  focusNode: string | null;
  setFocusNode: (id: string | null) => void;
  selectedNodeId: string | null;
  bookmarksOnly: boolean;
  setBookmarksOnly: (v: boolean) => void;
  onlyInvalid: boolean;
  setOnlyInvalid: (v: boolean) => void;
  validationAvailable: boolean;
  setLayoutType: (t: LayoutType) => void;
  setTopoOpen: (v: boolean) => void;
  setLearningPathOpen: (v: boolean) => void;
  setEntityHierarchyOpen: (v: boolean) => void;
  setHelpOpen: (v: boolean) => void;
  setHotkeysOpen: (v: boolean) => void;
  setValidationOpen: (v: boolean) => void;
  tour: any | null;
  tourStop: () => void;
  rfInstance: any;
  navBack: () => void;
  navForward: () => void;
  handleFindCycles: () => void;
  handleRunPath: () => void;
  handleExportJSON: () => void;
  handleExportMarkdown: () => void;
  handleExportPNG: () => void;
  resetAll: () => void;
  setFilters: (f: any) => void;
  setNamespaceFilter: (s: string) => void;
  setTagFilters: (s: Set<string>) => void;
  resetHiddenNodes: () => void;
  setEntityHierarchyInitialKey: (k: string | null) => void;
}

export function buildCommands(ctx: BuildCommandsContext): Command[] {
  const commands: Array<Command | null> = [
    // Навигация
    {
      section: "Навигация",
      icon: "⛶",
      label: "Вписать в экран",
      hotkey: "F",
      keywords: "fit zoom",
      run: () => ctx.rfInstance?.fitView({ duration: 500 }),
    },
    {
      section: "Навигация",
      icon: "←",
      label: "Назад по истории",
      hotkey: "Alt+←",
      keywords: "back",
      run: ctx.navBack,
    },
    {
      section: "Навигация",
      icon: "→",
      label: "Вперёд по истории",
      hotkey: "Alt+→",
      keywords: "forward",
      run: ctx.navForward,
    },

    // Раскладка
    {
      section: "Раскладка",
      icon: "📐",
      label: "Горизонтальная (LR)",
      keywords: "layout",
      run: () => ctx.setLayoutType("LR"),
    },
    {
      section: "Раскладка",
      icon: "📐",
      label: "Вертикальная (TB)",
      keywords: "layout vertical",
      run: () => ctx.setLayoutType("TB"),
    },
    {
      section: "Раскладка",
      icon: "📐",
      label: "Force-directed",
      keywords: "layout force physics",
      run: () => ctx.setLayoutType("force"),
    },
    {
      section: "Раскладка",
      icon: "📐",
      label: "Круговая",
      keywords: "layout circular",
      run: () => ctx.setLayoutType("circular"),
    },
    {
      section: "Раскладка",
      icon: "🗂",
      label: "По семействам",
      keywords: "cluster namespace",
      run: () => ctx.setLayoutType("cluster"),
    },
    {
      section: "Раскладка",
      icon: "📁",
      label: "По каталогам",
      keywords: "folder directory",
      run: () => ctx.setLayoutType("folder"),
    },

    // Вид
    {
      section: "Вид",
      icon: ctx.theme === "dark" ? "☀️" : "🌙",
      label: "Переключить тему",
      keywords: "theme dark light",
      run: () => ctx.setTheme(ctx.theme === "dark" ? "light" : "dark"),
    },
    {
      section: "Вид",
      icon: "⚫",
      label: ctx.compact
        ? "Выключить компактный режим"
        : "Включить компактный режим",
      keywords: "compact small",
      run: () => ctx.setCompact((v) => !v),
    },
    {
      section: "Вид",
      icon: "🗂",
      label: ctx.showGroups ? "Скрыть группировку" : "Показать группировку",
      keywords: "groups boxes",
      run: () => ctx.setShowGroups(!ctx.showGroups),
    },
    {
      section: "Вид",
      icon: "⇄",
      label: ctx.bidirectional ? "Разъединить A↔B" : "Объединять A↔B",
      keywords: "bidirectional",
      run: () => ctx.setBidirectional(!ctx.bidirectional),
    },
    {
      section: "Вид",
      icon: "🏷",
      label: ctx.showEdgeLabels
        ? "Скрыть подписи связей"
        : "Показать подписи связей",
      keywords: "labels edges",
      run: () => ctx.setShowEdgeLabels(!ctx.showEdgeLabels),
    },
    {
      section: "Вид",
      icon: ctx.tooltipsEnabled ? "🚫" : "💬",
      label: ctx.tooltipsEnabled ? "Скрыть тултипы" : "Показать тултипы",
      hotkey: "T",
      keywords: "tooltip",
      run: () => ctx.setTooltipsEnabled((v) => !v),
    },

    // Heatmap
    {
      section: "Heatmap",
      icon: "🔥",
      label:
        ctx.heatmap === "health"
          ? "Выключить heatmap"
          : "Heatmap: Health score",
      keywords: "heatmap",
      run: () => ctx.setHeatmap(ctx.heatmap === "health" ? "none" : "health"),
    },
    {
      section: "Heatmap",
      icon: "🔥",
      label:
        ctx.heatmap === "degree"
          ? "Выключить heatmap"
          : "Heatmap: Количество связей",
      keywords: "heatmap degree",
      run: () => ctx.setHeatmap(ctx.heatmap === "degree" ? "none" : "degree"),
    },
    {
      section: "Heatmap",
      icon: "🔥",
      label:
        ctx.heatmap === "entities" ? "Выключить heatmap" : "Heatmap: Entities",
      keywords: "heatmap entities",
      run: () =>
        ctx.setHeatmap(ctx.heatmap === "entities" ? "none" : "entities"),
    },
    {
      section: "Heatmap",
      icon: "🔥",
      label:
        ctx.heatmap === "fqid" ? "Выключить heatmap" : "Heatmap: FQID-ссылки",
      keywords: "heatmap fqid",
      run: () => ctx.setHeatmap(ctx.heatmap === "fqid" ? "none" : "fqid"),
    },

    // Анализ
    {
      section: "Анализ",
      icon: "🔁",
      label: "Найти циклы",
      hotkey: "C",
      keywords: "cycles scc",
      run: ctx.handleFindCycles,
    },
    {
      section: "Анализ",
      icon: "◯",
      label: ctx.isolatedOnly ? "Показать все домены" : "Только изолированные",
      hotkey: "I",
      keywords: "isolated",
      run: () => ctx.setIsolatedOnly((v) => !v),
    },
    {
      section: "Анализ",
      icon: "🗂",
      label: ctx.nsMode ? "Выключить агрегацию" : "Агрегация по семействам",
      hotkey: "S",
      keywords: "namespace aggregate",
      run: () => ctx.setNsMode((v) => !v),
    },
    {
      section: "Анализ",
      icon: "📦",
      label: "Порядок установки (топосорт)",
      keywords: "topo install order",
      run: () => ctx.setTopoOpen(true),
    },
    {
      section: "Анализ",
      icon: "🎯",
      label: ctx.focusNode ? "Сбросить фокус" : "Фокус на выделенном",
      keywords: "focus",
      run: () => {
        if (ctx.focusNode) ctx.setFocusNode(null);
        else if (ctx.selectedNodeId) ctx.setFocusNode(ctx.selectedNodeId);
      },
    },
    {
      section: "Анализ",
      icon: "🛤️",
      label: "Найти путь между двумя узлами",
      hotkey: "P",
      keywords: "path",
      run: ctx.handleRunPath,
    },
    {
      section: "Анализ",
      icon: "📖",
      label: ctx.tour ? "Остановить экскурсию" : "Путь изучения архитектуры",
      keywords: "learning path tour",
      run: () => {
        if (ctx.tour) ctx.tourStop();
        else ctx.setLearningPathOpen(true);
      },
    },
    {
      section: "Анализ",
      icon: "🧬",
      label: "Иерархия сущностей",
      keywords: "entity hierarchy inherits",
      run: () => {
        ctx.setEntityHierarchyInitialKey(null);
        ctx.setEntityHierarchyOpen(true);
      },
    },

    // Фильтры
    {
      section: "Фильтры",
      icon: "★",
      label: ctx.bookmarksOnly ? "Показать все домены" : "Только избранные",
      keywords: "bookmarks",
      run: () => ctx.setBookmarksOnly(!ctx.bookmarksOnly),
    },
    {
      section: "Фильтры",
      icon: "❌",
      label: ctx.onlyInvalid ? "Показать все домены" : "Только невалидные",
      keywords: "invalid validation",
      run: () => ctx.setOnlyInvalid(!ctx.onlyInvalid),
    },
    {
      section: "Фильтры",
      icon: "🗑",
      label: "Сбросить все фильтры",
      keywords: "reset clear filters",
      run: ctx.resetAll,
    },

    // Данные
    {
      section: "Данные",
      icon: "💾",
      label: "Экспорт графа в JSON",
      keywords: "export json",
      run: ctx.handleExportJSON,
    },
    {
      section: "Данные",
      icon: "📝",
      label: "Отчёт в Markdown",
      keywords: "export markdown report",
      run: ctx.handleExportMarkdown,
    },
    {
      section: "Данные",
      icon: "🖼️",
      label: "Экспорт графа в PNG",
      keywords: "export png",
      run: ctx.handleExportPNG,
    },
    ctx.validationAvailable ? {
      section: "Данные",
      icon: "🔍",
      label: "Массовая валидация доменов",
      keywords: "validate check",
      run: () => ctx.setValidationOpen(true),
    } : null,

    // Справка
    {
      section: "Справка",
      icon: "📖",
      label: "Руководство пользователя",
      hotkey: "F1",
      keywords: "guide help",
      run: () => ctx.setHelpOpen(true),
    },
    {
      section: "Справка",
      icon: "⌨️",
      label: "Список горячих клавиш",
      keywords: "hotkeys",
      run: () => ctx.setHotkeysOpen(true),
    },
  ];

  return commands.filter((c): c is Command => c !== null);
}
