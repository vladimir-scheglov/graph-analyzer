// src/web/components/modals/GenerateSchemaYaml.ts
import type { GeneratedBlock } from "../../../core/analyzer/schema-generator/types";

export interface YamlSection {
  key: string;
  label: string;
  blocks: Array<{ block: GeneratedBlock; yaml: string }>;
}

const SECTION_LABELS: Record<string, string> = {
  actions: "Действия",
  views: "Представления",
  trees: "Деревья",
  menus: "Меню",
  medias: "Иконки",
  dataRules: "Правила данных",
  dataTypes: "Типы данных",
  linkages: "Связи",
  entities: "Сущности",
  sequences: "Последовательности",
};

const SECTION_ORDER = [
  "actions",
  "views",
  "trees",
  "menus",
  "medias",
  "dataRules",
  "dataTypes",
  "linkages",
  "entities",
  "sequences",
];

export function groupYamlBySection(
  blocks: GeneratedBlock[],
  selected: Set<string>,
  yamlByBlock: Record<string, string>,
): YamlSection[] {
  const grouped = new Map<string, YamlSection>();

  for (const block of blocks) {
    if (!selected.has(block.blockId)) continue;
    const section = block.section;
    if (!grouped.has(section)) {
      grouped.set(section, {
        key: section,
        label: SECTION_LABELS[section] || section,
        blocks: [],
      });
    }
    grouped.get(section)!.blocks.push({
      block,
      yaml: yamlByBlock[block.blockId] || "",
    });
  }

  const result = Array.from(grouped.values());
  result.sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.key);
    const bi = SECTION_ORDER.indexOf(b.key);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  for (const s of result) {
    s.blocks.sort((a, b) => a.block.blockId.localeCompare(b.block.blockId));
  }
  return result;
}
