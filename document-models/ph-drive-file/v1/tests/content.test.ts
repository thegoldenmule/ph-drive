import { generateMock } from "document-model";
import {
  isPhDriveFileDocument,
  reducer,
  setFileContent,
  SetFileContentInputSchema,
  utils,
} from "document-models/ph-drive-file/v1";
import { describe, expect, it } from "vitest";

describe("ContentOperations", () => {
  it("should handle setFileContent operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetFileContentInputSchema());

    const updatedDocument = reducer(document, setFileContent(input));

    expect(isPhDriveFileDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_FILE_CONTENT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
