import type { RemoteCredentials, DomainPublishInfo } from "../shared/types";
import type { ValidationContext } from "../core/validation/validate";

export interface ServerState {
  credentials: RemoteCredentials | null;
  validation: ValidationContext | null;
  /** sourceId → publish-info. Заполняется только в remote-режиме. */
  domainIndex: Map<string, DomainPublishInfo> | null;
}

export const state: ServerState = {
  credentials: null,
  validation: null,
  domainIndex: null,
};
