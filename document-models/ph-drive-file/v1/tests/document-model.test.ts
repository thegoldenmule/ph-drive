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

function expectInvalidDocument(document: unknown) {
  expect(isPhDriveFileDocument(document)).toBe(false);
  expect(() => assertIsPhDriveFileDocument(document)).toThrow(ZodError);
}

function expectInvalidState(state: unknown) {
  expect(isPhDriveFileState(state)).toBe(false);
  expect(() => assertIsPhDriveFileState(state)).toThrow(ZodError);
}

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
    expect(() => assertIsPhDriveFileDocument(document)).not.toThrow();
    expect(() => assertIsPhDriveFileState(document.state)).not.toThrow();
  });

  it("should reject a document that is not a PhDriveFile document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    expectInvalidDocument(wrongDocumentType);
  });

  it("accepts unknown keys in global state (every field is nullable)", () => {
    const document = utils.createDocument();
    // @ts-expect-error - we are testing an unexpected state shape
    document.state.global = { notWhat: "you want" };
    expect(isPhDriveFileState(document.state)).toBe(true);
    expect(isPhDriveFileDocument(document)).toBe(true);
  });

  it("should reject a state whose content is not an AttachmentRef", () => {
    const document = utils.createDocument();
    // @ts-expect-error - we are testing the error case
    document.state.global.content = "https://example.com/file.txt";
    expectInvalidState(document.state);
    expectInvalidDocument(document);

    // @ts-expect-error - empty string is not a valid AttachmentRef either
    document.state.global.content = "";
    expectInvalidState(document.state);
  });

  it("should reject a state with a wrongly typed field", () => {
    const document = utils.createDocument();
    // @ts-expect-error - we are testing the error case
    document.state.global.size = "large";
    expectInvalidState(document.state);
    expectInvalidDocument(document);
  });

  it("should reject a document with an invalid initial state", () => {
    const document = utils.createDocument();
    // @ts-expect-error - we are testing the error case
    document.initialState.global = { content: "not-a-ref" };
    expectInvalidState(document.initialState);
    expectInvalidDocument(document);
  });

  it.each(["id", "name", "createdAtUtcIso", "lastModifiedAtUtcIso"] as const)(
    "should reject a document missing header.%s",
    (key) => {
      const document = utils.createDocument();
      delete (document.header as Partial<typeof document.header>)[key];
      expectInvalidDocument(document);
    },
  );
});
