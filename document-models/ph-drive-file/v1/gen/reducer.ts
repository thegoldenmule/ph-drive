/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { PhDriveFilePHState } from "document-models/ph-drive-file/v1";

import { phDriveFileContentOperations } from "../src/reducers/content.js";

import { SetFileContentInputSchema } from "./schema/zod.js";

const stateReducer: StateReducer<PhDriveFilePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_FILE_CONTENT": {
      SetFileContentInputSchema().parse(action.input);

      phDriveFileContentOperations.setFileContentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<PhDriveFilePHState> = createReducer(stateReducer);
