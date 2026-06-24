/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { PhDriveFileAction } from "./actions.js";
import type { PhDriveFileState as PhDriveFileGlobalState } from "./schema/types.js";

type PhDriveFileLocalState = Record<PropertyKey, never>;

type PhDriveFilePHState = PHBaseState & {
  global: PhDriveFileGlobalState;
  local: PhDriveFileLocalState;
};
type PhDriveFileDocument = PHDocument<PhDriveFilePHState>;

export * from "./schema/types.js";

export type {
  PhDriveFileAction,
  PhDriveFileDocument,
  PhDriveFileGlobalState,
  PhDriveFileLocalState,
  PhDriveFilePHState,
};
