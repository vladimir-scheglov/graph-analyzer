import { SectionKey } from "../../shared/model-types";

export const SECTION_LABELS: Record<
    SectionKey,
    { label: string; icon: string }
> = {
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
};
