/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsPhDriveFileDocument,
  assertIsPhDriveFileState,
  initialGlobalState,
  initialLocalState,
  isPhDriveFileDocument,
  isPhDriveFileState,
  phDriveFileDocumentType,
  utils,
} from "document-models/ph-drive-file/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("PhDriveFile Document Model", () => {
  it("should create a new PhDriveFile document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(phDriveFileDocumentType);
  });

  it("should create a new PhDriveFile document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isPhDriveFileDocument(document)).toBe(true);
    expect(isPhDriveFileState(document.state)).toBe(true);
  });
  it("should reject a document that is not a PhDriveFile document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsPhDriveFileDocument(wrongDocumentType)).toThrow();
      expect(isPhDriveFileDocument(wrongDocumentType)).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
    }
  });
  const wrongState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongState.state.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isPhDriveFileState(wrongState.state)).toBe(false);
    expect(assertIsPhDriveFileState(wrongState.state)).toThrow();
    expect(isPhDriveFileDocument(wrongState)).toBe(false);
    expect(assertIsPhDriveFileDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isPhDriveFileState(wrongInitialState.state)).toBe(false);
    expect(assertIsPhDriveFileState(wrongInitialState.state)).toThrow();
    expect(isPhDriveFileDocument(wrongInitialState)).toBe(false);
    expect(assertIsPhDriveFileDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isPhDriveFileDocument(missingIdInHeader)).toBe(false);
    expect(assertIsPhDriveFileDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isPhDriveFileDocument(missingNameInHeader)).toBe(false);
    expect(assertIsPhDriveFileDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isPhDriveFileDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsPhDriveFileDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isPhDriveFileDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsPhDriveFileDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
