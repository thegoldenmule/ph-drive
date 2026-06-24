import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "phdrive/file",
  name: "PhDriveFile",
  extension: ".phdf",
  description:
    "A file node's content: an attachment reference plus metadata, used by the ph-drive Google-Drive-style sync.",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type PhDriveFileState {\n  content: String\n  mimeType: String\n  size: Int\n  sha256: String\n  parentFolder: String\n}",
          initialValue:
            '{\n  "content": null,\n  "mimeType": null,\n  "size": null,\n  "sha256": null,\n  "parentFolder": null\n}',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: "",
          examples: [],
        },
      },
      modules: [
        {
          id: "ph-drive-file-content",
          name: "content",
          description: "Set the attachment reference and metadata for a file.",
          operations: [
            {
              id: "ph-drive-file-set-content",
              name: "SET_FILE_CONTENT",
              description:
                "Attach (or replace) the file's content via an attachment ref.",
              schema:
                "input SetFileContentInput {\n  content: String!\n  mimeType: String!\n  size: Int!\n  sha256: String!\n  parentFolder: String\n}",
              template: "",
              reducer:
                "state.content = action.input.content;\nstate.mimeType = action.input.mimeType;\nstate.size = action.input.size;\nstate.sha256 = action.input.sha256;\nstate.parentFolder = action.input.parentFolder ?? null;",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};
