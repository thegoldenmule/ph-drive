/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { SetFileContentInputSchema } from "../schema/zod.js";
import type { SetFileContentInput } from "../types.js";
import type { SetFileContentAction } from "./actions.js";

export const setFileContent = (input: SetFileContentInput) =>
  createAction<SetFileContentAction>(
    "SET_FILE_CONTENT",
    { ...input },
    undefined,
    SetFileContentInputSchema,
    "global",
  );
