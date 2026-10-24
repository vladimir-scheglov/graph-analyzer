export { DomainAnalyzer } from "./DomainAnalyzer";
export { scanDirectory } from "./scanner";
export { loadYaml, parseLenientYaml, cleanYamlContent } from "./yaml-loader";
export { isFQID, resolveEntityRef, entityKey } from "./fqid";
export { findFQIDReferences } from "./references";
export { processLinkages } from "./linkages";
// ============ Schema Generator ============
export { generateForEntity } from "./schema-generator";
export type {
  GenerationRequest,
  GenerationOptions,
  GenerationResult,
  GeneratedBlock,
  GeneratorProfile,
  PreflightResult,
} from "./schema-generator/types";