import type { Action } from "document-model";
import { generateMock } from "document-model/mock";
import {
  isPhDriveFileDocument,
  reducer,
  setFileContent,
  SetFileContentInputSchema,
  utils,
} from "document-models/ph-drive-file/v1";
import type { SetFileContentInput } from "document-models/ph-drive-file/v1";
import { describe, expect, it } from "vitest";

const REF_A = `attachment://v1:${"a".repeat(64)}` as const;
const REF_B = `attachment://v1:${"b".repeat(64)}` as const;

function input(overrides: Partial<SetFileContentInput> = {}) {
  return {
    content: REF_A,
    mimeType: "text/plain",
    size: 11,
    sha256: "a".repeat(64),
    ...overrides,
  } satisfies SetFileContentInput;
}

describe("ContentOperations", () => {
  it("should handle setFileContent operation", () => {
    const document = utils.createDocument();
    // AttachmentRef compiles to z.custom(), which zocker cannot invent; supply it.
    const mock = generateMock(SetFileContentInputSchema(), { content: REF_A });

    const updatedDocument = reducer(document, setFileContent(mock));

    expect(isPhDriveFileDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_FILE_CONTENT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      mock,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
    expect(updatedDocument.state.global.content).toBe(REF_A);
  });

  it("sets, then replaces, the content and metadata of a file", () => {
    let doc = utils.createDocument();

    doc = reducer(doc, setFileContent(input({ parentFolder: "folder-1" })));
    expect(doc.state.global).toStrictEqual({
      content: REF_A,
      mimeType: "text/plain",
      size: 11,
      sha256: "a".repeat(64),
      parentFolder: "folder-1",
    });

    // Replace in place, moving the file to the drive root (no parentFolder).
    doc = reducer(
      doc,
      setFileContent(
        input({
          content: REF_B,
          mimeType: "application/pdf",
          size: 0,
          sha256: "b".repeat(64),
        }),
      ),
    );
    expect(doc.operations.global).toHaveLength(2);
    expect(doc.operations.global.every((op) => !op.error)).toBe(true);
    expect(doc.state.global).toStrictEqual({
      content: REF_B,
      mimeType: "application/pdf",
      size: 0,
      sha256: "b".repeat(64),
      parentFolder: null,
    });
    expect(isPhDriveFileDocument(doc)).toBe(true);
  });

  it("rejects content that is not an AttachmentRef when creating the action", () => {
    for (const content of [
      "",
      "https://example.com/file.txt",
      "attachment://v1:",
    ]) {
      expect(() =>
        setFileContent(
          input({ content: content as SetFileContentInput["content"] }),
        ),
      ).toThrow();
    }
  });

  it("records an error and leaves state unchanged for a non-AttachmentRef content", () => {
    let doc = reducer(utils.createDocument(), setFileContent(input()));
    const before = doc.state.global;

    // Bypass the creator's validation to exercise the reducer's own input check.
    const bad: Action = {
      ...setFileContent(input()),
      input: { ...input(), content: "not-a-ref" },
    };
    doc = reducer(doc, bad);

    expect(doc.operations.global).toHaveLength(2);
    // The zod issue list is stored as the operation's error string.
    expect(doc.operations.global[1].error).toContain('"content"');
    expect(doc.state.global).toStrictEqual(before);
  });
});
