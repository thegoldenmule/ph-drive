/**
 * DriveGql — dependency-free client for a reactor-drive, talking to a switchboard
 * over its reactor GraphQL API (`/graphql/r`). Folders are identity ops on the
 * drive; files are separate `phdrive/file` docs linked via a "drive/child"
 * relationship. The tree is read from the raw op log + relationships because the
 * reactor-drive subgraph collides by name with the auto doc-model subgraph.
 */

export const REACTOR_DRIVE_DOCUMENT_TYPE = "powerhouse/reactor-drive";
export const PHDRIVE_FILE_DOCUMENT_TYPE = "phdrive/file";
export const DRIVE_CHILD_RELATIONSHIP_TYPE = "drive/child";

export type DriveFolder = {
  kind: "folder";
  id: string;
  name: string;
  parentFolder: string | null;
};

export type DriveFile = {
  kind: "file";
  id: string;
  name: string;
  parentFolder: string | null;
  content: string | null;
  mimeType: string | null;
  size: number | null;
  sha256: string | null;
};

export type DriveNode = DriveFolder | DriveFile;

export type DriveTree = { folders: DriveFolder[]; files: DriveFile[] };

type ActionScope = "global" | "document" | "local";

function newId(): string {
  return crypto.randomUUID();
}

function action(type: string, input: unknown, scope: ActionScope) {
  return {
    id: newId(),
    type,
    scope,
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

export class DriveGql {
  readonly endpoint: string;

  constructor(switchboardUrl: string) {
    const base = switchboardUrl.replace(/\/+$/, "");
    this.endpoint = base.endsWith("/graphql/r") ? base : `${base}/graphql/r`;
  }

  async gql<T = any>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    if (!json.data) throw new Error(`No data from ${this.endpoint}`);
    return json.data;
  }

  async createDrive(name = "ph-drive", preferredEditor?: string): Promise<string> {
    const d = await this.gql<{ createEmptyDocument: { id: string } }>(
      `mutation($t:String!){createEmptyDocument(documentType:$t){id}}`,
      { t: REACTOR_DRIVE_DOCUMENT_TYPE },
    );
    const id = d.createEmptyDocument.id;
    if (name) {
      await this.mutate(id, [action("SET_DRIVE_NAME", { name }, "global")]);
    }
    if (preferredEditor) {
      await this.setPreferredEditor(id, preferredEditor);
    }
    return id;
  }

  /** Set the drive's preferred editor (Connect renders the drive app by this id). */
  async setPreferredEditor(driveId: string, editorId: string): Promise<void> {
    await this.gql(
      `mutation($id:String!,$e:String!){setPreferredEditor(documentIdentifier:$id,preferredEditor:$e){id}}`,
      { id: driveId, e: editorId },
    );
  }

  async addFolder(
    driveId: string,
    name: string,
    parentFolder: string | null = null,
  ): Promise<string> {
    const folderId = newId();
    await this.mutate(driveId, [
      action("ADD_FOLDER", { folderId, parentFolderId: parentFolder, name }, "document"),
    ]);
    return folderId;
  }

  async renameFolder(driveId: string, folderId: string, name: string): Promise<void> {
    await this.mutate(driveId, [
      action("UPDATE_FOLDER", { folderId, name }, "document"),
    ]);
  }

  async moveFolder(
    driveId: string,
    folderId: string,
    parentFolder: string | null,
  ): Promise<void> {
    await this.mutate(driveId, [
      action("UPDATE_FOLDER", { folderId, parentFolderId: parentFolder }, "document"),
    ]);
  }

  async removeFolder(driveId: string, folderId: string): Promise<void> {
    await this.mutate(driveId, [
      action("REMOVE_FOLDER", { folderId }, "document"),
    ]);
  }

  async createFile(
    driveId: string,
    file: {
      name: string;
      parentFolder: string | null;
      content: string;
      mimeType: string;
      size: number;
      sha256: string;
    },
  ): Promise<string> {
    const created = await this.gql<{ createEmptyDocument: { id: string } }>(
      `mutation($t:String!){createEmptyDocument(documentType:$t){id}}`,
      { t: PHDRIVE_FILE_DOCUMENT_TYPE },
    );
    const fileId = created.createEmptyDocument.id;

    await this.mutate(fileId, [
      action(
        "SET_FILE_CONTENT",
        {
          content: file.content,
          mimeType: file.mimeType,
          size: file.size,
          sha256: file.sha256,
          parentFolder: file.parentFolder,
        },
        "global",
      ),
    ]);

    await this.gql(
      `mutation($id:String!,$n:String!){renameDocument(documentIdentifier:$id,name:$n){id}}`,
      { id: fileId, n: file.name },
    );

    await this.mutate(driveId, [
      action(
        "ADD_RELATIONSHIP",
        {
          sourceId: driveId,
          targetId: fileId,
          relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
          metadata: {
            kind: "file",
            parentFolderId: file.parentFolder,
            documentType: PHDRIVE_FILE_DOCUMENT_TYPE,
          },
        },
        "document",
      ),
    ]);

    return fileId;
  }

  /** Replace a file's content/metadata in place (same fileId). */
  async setFileContent(
    fileId: string,
    file: {
      content: string;
      mimeType: string;
      size: number;
      sha256: string;
      parentFolder: string | null;
    },
  ): Promise<void> {
    await this.mutate(fileId, [
      action("SET_FILE_CONTENT", { ...file }, "global"),
    ]);
  }

  async renameFile(fileId: string, name: string): Promise<void> {
    await this.gql(
      `mutation($id:String!,$n:String!){renameDocument(documentIdentifier:$id,name:$n){id}}`,
      { id: fileId, n: name },
    );
  }

  async removeFile(driveId: string, fileId: string): Promise<void> {
    await this.mutate(driveId, [
      action(
        "REMOVE_RELATIONSHIP",
        {
          sourceId: driveId,
          targetId: fileId,
          relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
        },
        "document",
      ),
    ]);
    await this.gql(`mutation($id:String!){deleteDocument(identifier:$id)}`, {
      id: fileId,
    });
  }

  async listFiles(driveId: string): Promise<DriveFile[]> {
    const d = await this.gql<{
      documentOutgoingRelationships: {
        items: { id: string; name: string; documentType: string; state: any }[];
      };
    }>(
      `query($s:String!,$rt:String!){documentOutgoingRelationships(sourceIdentifier:$s,relationshipType:$rt){items{id name documentType state}}}`,
      { s: driveId, rt: DRIVE_CHILD_RELATIONSHIP_TYPE },
    );
    return d.documentOutgoingRelationships.items
      .filter((it) => it.documentType === PHDRIVE_FILE_DOCUMENT_TYPE)
      .map((it) => {
        const g = (it.state?.global ?? {}) as Record<string, unknown>;
        return {
          kind: "file" as const,
          id: it.id,
          name: it.name,
          parentFolder: (g.parentFolder as string | null) ?? null,
          content: (g.content as string | null) ?? null,
          mimeType: (g.mimeType as string | null) ?? null,
          size: (g.size as number | null) ?? null,
          sha256: (g.sha256 as string | null) ?? null,
        };
      });
  }

  async listFolders(driveId: string): Promise<DriveFolder[]> {
    const d = await this.gql<{
      document: {
        document: {
          operations: { items: { index: number; action: { type: string; input: any } }[] };
        };
      } | null;
    }>(
      `query($id:String!){document(identifier:$id){document{operations{items{index action{type input}}}}}}`,
      { id: driveId },
    );
    const items = d.document?.document?.operations?.items ?? [];
    items.sort((a, b) => a.index - b.index);
    const folders = new Map<string, DriveFolder>();
    for (const { action: a } of items) {
      const input = a.input ?? {};
      if (a.type === "ADD_FOLDER") {
        folders.set(input.folderId, {
          kind: "folder",
          id: input.folderId,
          name: input.name,
          parentFolder: input.parentFolderId ?? null,
        });
      } else if (a.type === "UPDATE_FOLDER") {
        const f = folders.get(input.folderId);
        if (f) {
          if (typeof input.name === "string") f.name = input.name;
          if (input.parentFolderId !== undefined)
            f.parentFolder = input.parentFolderId ?? null;
        }
      } else if (a.type === "REMOVE_FOLDER") {
        folders.delete(input.folderId);
      }
    }
    return [...folders.values()];
  }

  async listTree(driveId: string): Promise<DriveTree> {
    const [folders, files] = await Promise.all([
      this.listFolders(driveId),
      this.listFiles(driveId),
    ]);
    return { folders, files };
  }

  async getFile(fileId: string): Promise<DriveFile | null> {
    const d = await this.gql<{
      document: { document: { id: string; name: string; state: any } } | null;
    }>(
      `query($id:String!){document(identifier:$id){document{id name state}}}`,
      { id: fileId },
    );
    const doc = d.document?.document;
    if (!doc) return null;
    const g = (doc.state?.global ?? {}) as Record<string, unknown>;
    return {
      kind: "file",
      id: doc.id,
      name: doc.name,
      parentFolder: (g.parentFolder as string | null) ?? null,
      content: (g.content as string | null) ?? null,
      mimeType: (g.mimeType as string | null) ?? null,
      size: (g.size as number | null) ?? null,
      sha256: (g.sha256 as string | null) ?? null,
    };
  }

  private async mutate(
    documentIdentifier: string,
    actions: ReturnType<typeof action>[],
  ): Promise<void> {
    await this.gql(
      `mutation($id:String!,$a:[JSONObject!]!){mutateDocument(documentIdentifier:$id,actions:$a){id}}`,
      { id: documentIdentifier, a: actions },
    );
  }
}

/** Build a path map: folderId -> "/a/b/c" (root folders are "/<name>"). */
export function folderPaths(folders: DriveFolder[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const cache = new Map<string, string>();
  const resolve = (id: string | null, seen = new Set<string>()): string => {
    if (id === null) return "";
    if (cache.has(id)) return cache.get(id)!;
    if (seen.has(id)) return ""; // cycle guard
    seen.add(id);
    const f = byId.get(id);
    if (!f) return "";
    const p = `${resolve(f.parentFolder, seen)}/${f.name}`;
    cache.set(id, p);
    return p;
  };
  for (const f of folders) resolve(f.id);
  return cache;
}
