/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  PhDriveFileAction,
  PhDriveFileDocument,
} from "document-models/ph-drive-file/v1";
import {
  assertIsPhDriveFileDocument,
  isPhDriveFileDocument,
} from "./gen/document-schema.js";

/** Hook to get a PhDriveFile document by its id */
export function usePhDriveFileDocumentById(
  documentId: string | null | undefined,
):
  | [PhDriveFileDocument, DocumentDispatch<PhDriveFileAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isPhDriveFileDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected PhDriveFile document */
export function useSelectedPhDriveFileDocument(): [
  PhDriveFileDocument,
  DocumentDispatch<PhDriveFileAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsPhDriveFileDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all PhDriveFile documents in the selected drive */
export function usePhDriveFileDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isPhDriveFileDocument);
}

/** Hook to get all PhDriveFile documents in the selected folder */
export function usePhDriveFileDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isPhDriveFileDocument);
}
