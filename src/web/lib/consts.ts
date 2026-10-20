import { SectionKey } from "../../shared/model-types";

export const SECTION_LABELS: Record<SectionKey, { label: string; icon: string }> = {
  entities: { label: "Сущности", icon: "category" },
  linkages: { label: "Связи", icon: "link" },
  dataTypes: { label: "Типы данных", icon: "data_object" },
  sequences: { label: "Последовательности", icon: "linear_scale" },
  actions: { label: "Действия", icon: "bolt" },
  views: { label: "Представления", icon: "visibility" },
  menus: { label: "Меню", icon: "menu" },
  mixins: { label: "Миксины", icon: "merge" },
  dataRules: { label: "Правила данных", icon: "rule" },
  medias: { label: "Иконки", icon: "image" },
  trees: { label: "Деревья", icon: "account_tree" },
  transitiveLinkages: { label: "Транзитивные связи", icon: "link" },
  uiRules: { label: "UI Rules", icon: "rule_folder" },
  uiPresets: { label: "UI Presets", icon: "palette" },
  counterColorPattern: { label: "Цветовые схемы", icon: "timelapse" },
  scenarios: { label: "Сценарии", icon: "movie" },
};
