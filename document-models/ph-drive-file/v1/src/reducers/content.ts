import type { PhDriveFileContentOperations } from "document-models/ph-drive-file/v1";

export const phDriveFileContentOperations: PhDriveFileContentOperations = {
  setFileContentOperation(state, action) {
    state.content = action.input.content;
    state.mimeType = action.input.mimeType;
    state.size = action.input.size;
    state.sha256 = action.input.sha256;
    state.parentFolder = action.input.parentFolder ?? null;
  },
};
