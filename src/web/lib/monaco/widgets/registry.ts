import type { WidgetDef } from "./types";
import { missingRequiredWidget } from "./defs/missing-required";
import { controlPickerWidget } from "./defs/control-picker";
import { actionSkeletonWidget } from "./defs/action-skeleton";
import { constraintTemplatesWidget } from "./defs/constraint-templates";
import { fixMissingFqidWidget } from "./defs/fix-missing-fqid";
import { identifierPreviewWidget } from "./defs/identifier-preview";
import { dataruleGeneratorWidget } from "./defs/datarule-generator";
import { entityviewSkeletonWidget } from "./defs/entityview-skeleton";
import { bulkWizardWidget } from "./defs/bulk-wizard";
import { missingMenuWidget } from "./defs/missing-menu";
import { widgetGeneratorWidget } from "./defs/widget-generator";
import { copyAttributeWidget } from "./defs/copy-attribute";
import { templateBuilderWidget } from "./defs/template-builder";
import { entityFieldPickerWidget } from "./defs/entity-field-picker";

export const ALL_WIDGETS: WidgetDef[] = [
  //missingRequiredWidget, // 100
  fixMissingFqidWidget, // 95
  //controlPickerWidget, // 90
  //identifierPreviewWidget, // 88
  templateBuilderWidget, // 87
  actionSkeletonWidget, // 85
  bulkWizardWidget, // 84
  entityviewSkeletonWidget, // 82
  //constraintTemplatesWidget, // 80
  //dataruleGeneratorWidget, // 78
  //widgetGeneratorWidget, // 75
  //missingMenuWidget, // 72
  //entityFieldPickerWidget, // 70
  //copyAttributeWidget, // 50
];
