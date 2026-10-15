import type { RemoteCredentials } from "../shared/types";
import type { ValidationContext } from "../core/validation/validate";

export interface ServerState {
  credentials: RemoteCredentials | null;
  validation: ValidationContext | null;
}

export const state: ServerState = {
  credentials: null,
  validation: null,
};
