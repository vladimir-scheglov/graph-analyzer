// src/core/analyzer/schema-generator/builders/enum-skeletons.ts
import type { ModelIndex } from "../../../../shared/model-types";
import type { GeneratedBlock } from "../types";

const DEFAULT_SUFFIXES = [
  "Type",
  "Kind",
  "Status",
  "Category",
  "Severity",
  "State",
  "Mode",
  "Level",
];
const DEFAULT_VALUES = ["unknown", "other"];

function matchesSuffix(attrId: string, suffixes: string[]): string | null {
  for (const s of suffixes) {
    // `endsWith` уже включает требование к регистру суффикса:
    // "Type" ≠ "type", "TYPE". Никаких доп. проверок не нужно.
    if (attrId.length > s.length && attrId.endsWith(s)) return s;
  }
  return null;
}

function toPascal(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export interface EnumSkeletonsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "dataTypes";
    id: string;
    reason: string;
    hint?: string;
  }>;
}

/**
 * Генерирует скелеты Enum (и опционально Workflow) для String-атрибутов,
 * чьи id оканчиваются на один из суффиксов.
 *
 * ⚠️ Тип самого атрибута НЕ переключается — только создаётся dataTypes[].
 * Пользователь переключает a.dataType вручную после ревью.
 */
export function buildEnumSkeletons(
  domainId: string,
  index: ModelIndex,
  options: {
    suffixes?: string[];
    defaultValues?: string[];
    enableWorkflow?: boolean;
    skipExisting: boolean;
  },
): EnumSkeletonsResult {
  const suffixes =
    options.suffixes && options.suffixes.length > 0
      ? options.suffixes
      : DEFAULT_SUFFIXES;
  const values =
    options.defaultValues && options.defaultValues.length > 0
      ? options.defaultValues
      : DEFAULT_VALUES;
  const enableWorkflow = options.enableWorkflow === true;

  const blocks: GeneratedBlock[] = [];
  const skipped: EnumSkeletonsResult["skipped"] = [];

  const existingTypeIds = new Set<string>(
    index.dataTypes.filter((dt) => dt.domainId === domainId).map((dt) => dt.id),
  );

  // Дедупликация: одинаковое имя Enum на несколько атрибутов — один dataType.
  const planned = new Set<string>();

  for (const e of index.entities) {
    if (e.domainId !== domainId) continue;

    for (const a of e.attributes) {
      if (a.dataType !== "String") continue;
      if (a.dataTypeKind === "custom") continue;

      const suffix = matchesSuffix(a.id, suffixes);
      if (!suffix) continue;

      // id Enum: <EntityId><AttrIdPascal> — например Device.deviceType → DeviceDeviceType
      const typeId = `${e.entityId}${toPascal(a.id)}`;
      const blockId = `dataType:${typeId}`;

      if (existingTypeIds.has(typeId) || planned.has(typeId)) {
        if (options.skipExisting) {
          skipped.push({
            blockId,
            section: "dataTypes",
            id: typeId,
            reason: "already-exists",
          });
        }
        continue;
      }

      const isWorkflow = enableWorkflow && suffix === "Status";

      if (isWorkflow) {
        blocks.push({
          blockId,
          section: "dataTypes",
          groupPath: ["dataTypes"],
          payload: {
            id: typeId,
            name: `${e.entityId} ${a.name || a.id}`,
            dataType: "Workflow",
            initial: values[0] ?? "unknown",
            statuses: values.map((v) => ({ id: v, name: v })),
            transitions: values.flatMap((from) =>
              values.filter((to) => to !== from).map((to) => ({ from, to })),
            ),
          },
          dependsOn: [],
          dependents: [],
          title: `Workflow ${typeId} (${values.join(", ")})`,
        });
      } else {
        blocks.push({
          blockId,
          section: "dataTypes",
          groupPath: ["dataTypes"],
          payload: {
            id: typeId,
            name: `${e.entityId} ${a.name || a.id}`,
            dataType: "Enum",
            values: values.map((v) => ({ id: v, name: v })),
          },
          dependsOn: [],
          dependents: [],
          title: `Enum ${typeId} (${values.join(", ")})`,
        });
      }
      planned.add(typeId);
    }
  }

  return { blocks, skipped };
}
