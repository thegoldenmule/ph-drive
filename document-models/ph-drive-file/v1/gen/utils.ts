/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils, PHBaseState, Reducer } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  defaultBaseState,
} from "document-model";
import { phDriveFileUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsPhDriveFileDocument,
  assertIsPhDriveFileState,
  isPhDriveFileDocument,
  isPhDriveFileState,
} from "./document-schema.js";
import { phDriveFileDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  PhDriveFileGlobalState,
  PhDriveFileLocalState,
  PhDriveFilePHState,
} from "./types.js";

export const initialGlobalState: PhDriveFileGlobalState = {
  content: null,
  mimeType: null,
  size: null,
  sha256: null,
  parentFolder: null,
};
export const initialLocalState: PhDriveFileLocalState = {};

export const utils: DocumentModelUtils<PhDriveFilePHState> = {
  fileExtension: ".phdf",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      phDriveFileDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: phDriveFileUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isPhDriveFileState(state);
  },
  assertIsStateOfType(state) {
    return assertIsPhDriveFileState(state);
  },
  isDocumentOfType(document) {
    return isPhDriveFileDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsPhDriveFileDocument(document);
  },
};
