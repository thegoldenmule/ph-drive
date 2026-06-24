/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { phDriveFileDocumentType } from "./document-type.js";
import { PhDriveFileStateSchema } from "./schema/zod.js";
import type { PhDriveFileDocument, PhDriveFilePHState } from "./types.js";

/** Schema for validating the header object of a PhDriveFile document */
export const PhDriveFileDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(phDriveFileDocumentType),
});

/** Schema for validating the state object of a PhDriveFile document */
export const PhDriveFilePHStateSchema = BaseDocumentStateSchema.extend({
  global: PhDriveFileStateSchema(),
});

export const PhDriveFileDocumentSchema = z.object({
  header: PhDriveFileDocumentHeaderSchema,
  state: PhDriveFilePHStateSchema,
  initialState: PhDriveFilePHStateSchema,
});

/** Simple helper function to check if a state object is a PhDriveFile document state object */
export function isPhDriveFileState(
  state: unknown,
): state is PhDriveFilePHState {
  return PhDriveFilePHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a PhDriveFile document state object */
export function assertIsPhDriveFileState(
  state: unknown,
): asserts state is PhDriveFilePHState {
  PhDriveFilePHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a PhDriveFile document */
export function isPhDriveFileDocument(
  document: unknown,
): document is PhDriveFileDocument {
  return PhDriveFileDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a PhDriveFile document */
export function assertIsPhDriveFileDocument(
  document: unknown,
): asserts document is PhDriveFileDocument {
  PhDriveFileDocumentSchema.parse(document);
}
