import type { ModelIndex } from "../../../../shared/model-types";
import type { LineMap } from "../../yaml/line-map";

export interface WidgetContext {
  model: any;
  position: any;
  lineMap: LineMap | null;
  index: ModelIndex | null;
  currentDomain: string;
  section: string;
  context: string | null;
  currentIndent: string; // от `- ` до первой буквы
  currentLine: number;
  blockLines: number[]; // 1-based строки текущего элемента
  fieldName: string | null;
  fieldValue: string | null;
  entity: any | null;
  attribute: any | null;
}

export interface WidgetAction {
  id: string;
  label: string;
  icon?: string;
  hint?: string;
  run(ctx: WidgetContext, editor: any, monaco: any): void;
}

export interface WidgetDef {
  id: string;
  title: string;
  priority: number;
  getActions(ctx: WidgetContext): WidgetAction[];
}
