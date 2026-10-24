import type {
  RemoteCredentials,
  DomainPublishInfo,
  RemoteInfo,
} from "../shared/types";
import type { ValidationContext } from "../core/validation/validate";
import type { DomainAnalyzer } from "../core/analyzer/DomainAnalyzer";

export interface ServerState {
  credentials: RemoteCredentials | null;
  validation: ValidationContext | null;
  domainIndex: Map<string, DomainPublishInfo> | null;
  /** Текущий remoteInfo — обновляется при POST /api/refresh-cache. */
  remoteInfo: RemoteInfo | null;
  /** Текущая refresh-команда — отображается в toast. */
  refreshCommand: string | null;
  /** Текущий режим (используется при refresh). */
  mode: "local" | "hybrid" | "remote";
  /** Анализатор — нужен для пересборки после refresh. */
  analyzer: DomainAnalyzer | null;
}

export const state: ServerState = {
  credentials: null,
  validation: null,
  domainIndex: null,
  remoteInfo: null,
  refreshCommand: null,
  mode: "local",
  analyzer: null,
};
