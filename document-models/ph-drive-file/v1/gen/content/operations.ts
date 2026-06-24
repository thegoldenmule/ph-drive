/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PhDriveFileGlobalState } from "../types.js";
import type { SetFileContentAction } from "./actions.js";

export interface PhDriveFileContentOperations {
  setFileContentOperation: (
    state: PhDriveFileGlobalState,
    action: SetFileContentAction,
    dispatch?: SignalDispatch,
  ) => void;
}
