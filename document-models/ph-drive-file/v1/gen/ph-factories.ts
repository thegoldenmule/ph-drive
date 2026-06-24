/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating PhDriveFileDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  PhDriveFileDocument,
  PhDriveFileGlobalState,
  PhDriveFileLocalState,
  PhDriveFilePHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): PhDriveFileGlobalState {
  return {
    content: null,
    mimeType: null,
    size: null,
    sha256: null,
    parentFolder: null,
  };
}

export function defaultLocalState(): PhDriveFileLocalState {
  return {};
}

export function defaultPHState(): PhDriveFilePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<PhDriveFileGlobalState>,
): PhDriveFileGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<PhDriveFileLocalState>,
): PhDriveFileLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as PhDriveFileLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<PhDriveFileGlobalState>,
  localState?: Partial<PhDriveFileLocalState>,
): PhDriveFilePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a PhDriveFileDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createPhDriveFileDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<PhDriveFileGlobalState>;
    local?: Partial<PhDriveFileLocalState>;
  }>,
): PhDriveFileDocument {
  const document = utils.createDocument(
    state
      ? createState(
          createBaseState(state.auth, state.document),
          state.global,
          state.local,
        )
      : undefined,
  );

  return document;
}
