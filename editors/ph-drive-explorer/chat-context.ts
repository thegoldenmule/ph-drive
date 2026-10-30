/**
 * The chat sheet's wiring, from the explorer's own state (no reactor-browser
 * hook). The tag shows the current folder's path, else the drive name. The
 * explorer has no selection, so "this folder" is the current folder and
 * "this file" has no referent (ph-drive-integration plan, §2).
 */
import { phDrive } from "nl-drive/ph-drive";
import {
  assertArtifactManifest,
  chatContextValue,
  type ArtifactManifest,
  type ChatContextValue,
  type ChatDriveLayer,
  type ChatExecutors,
  type ChatLabels,
  type ChatManifest,
  type DocumentTarget,
  type RefSource,
} from "nl-runtime";
import { useMemo } from "react";
import {
  folderPaths,
  type DriveFile,
  type DriveFolder,
  type DriveGql,
} from "../../lib/drive-client.js";
import rawArtifacts from "./artifact-manifest.json" with { type: "json" };

/**
 * The drive LoRA m2bb and Kev-FT, as `nl export` wrote them (powerhouse-nl
 * `.artifacts/drive/runs/LFM2.5-350M-drive-m2bb-20261029/export/`). Each
 * `devPath` is `/models/<file>`: the gitignored `models/` directory, served
 * by Studio from this origin.
 */
export const DRIVE_CHAT_ARTIFACTS: ArtifactManifest = assertArtifactManifest(
  rawArtifacts as unknown as ArtifactManifest,
);

/** localStorage and IndexedDB prefix for the chat (settings, history). */
export const CHAT_STORAGE_PREFIX = "phdrive.chat";

export const CHAT_LABELS: Partial<ChatLabels> = {
  placeholder: "Ask a question, or describe a change to this drive",
  answerSystemPrompt: "You are a concise assistant for a file drive.",
};

/** The tag's name: "My Drive / Reports / Q3" in a folder, else the drive name. */
export function explorerTargetName(
  driveName: string,
  cwd: string | null,
  folders: readonly DriveFolder[],
): string {
  const path = cwd ? folderPaths([...folders]).get(cwd) : undefined;
  if (!path) return driveName;
  return [driveName, ...path.split("/").filter(Boolean)].join(" / ");
}

export interface ExplorerChatState {
  driveId: string;
  driveName: string;
  /** The current folder; null at the top level. */
  cwd: string | null;
  folders: readonly DriveFolder[];
  files: readonly DriveFile[];
  /** The session's recent ring. */
  recent: DocumentTarget[];
}

/** The chat's context: the drive as target, the current folder, what is in view. */
export function explorerChatContext(s: ExplorerChatState): ChatContextValue {
  const here = (n: { parentFolder: string | null }) =>
    (n.parentFolder ?? null) === s.cwd;
  return chatContextValue({
    driveId: s.driveId,
    target: {
      kind: "drive",
      id: s.driveId,
      name: explorerTargetName(s.driveName, s.cwd, s.folders),
    },
    folderId: s.cwd ?? undefined,
    // Files and folders reach the chat as drive nodes (the layer's RefSource),
    // not as documents to retarget to.
    documents: [],
    recent: s.recent,
    visibleIds: [...s.folders.filter(here), ...s.files.filter(here)].map(
      (n) => n.id,
    ),
  });
}

export function useExplorerChatContext(s: ExplorerChatState): ChatContextValue {
  const { driveId, driveName, cwd, folders, files, recent } = s;
  return useMemo(
    () =>
      explorerChatContext({ driveId, driveName, cwd, folders, files, recent }),
    [driveId, driveName, cwd, folders, files, recent],
  );
}

export interface DriveChat {
  chatManifest: ChatManifest;
  refSource: RefSource;
  executors: ChatExecutors;
  layer: ChatDriveLayer;
}

/**
 * The ref binder after step 2, in `override` mode: refs the request settles
 * (a verbatim name, a path, "this folder", "top level") replace step 2's
 * value. This is the condition the drive's blind selection chose and the
 * confirmatory run measured (powerhouse-nl docs/notes/m4/ref-binding.md,
 * selection-2-results.md, confirmatory-results.md).
 */
export const CHAT_BIND_REFS = "override" as const;

/** ph-drive's install of nl-drive, bound to one `DriveGql`, with the binder on. */
export function explorerDrive(gql: DriveGql) {
  return phDrive(gql, undefined, { bindRefs: CHAT_BIND_REFS });
}

/**
 * The reactor-drive adapter over this editor's `DriveGql`: its `graphql`
 * executor, its RefSource over `listTree()` (read fresh each turn), the
 * merged manifest with ph-drive's file intents, and the drive layer with
 * the ref binder in override mode. Copy, file create and file move are not
 * among its ops, so they are never offered.
 *
 * The chat's target is always the drive (`explorerChatContext`, with no
 * documents), and a drive target with a layer is filled by the layer, not
 * by the document resolver, so nl-runtime's "always ask on another
 * document's exact title" default does not apply here.
 */
export function useDriveChat(
  gql: DriveGql,
  driveId: string,
  onChanged: () => void,
): DriveChat {
  const drive = useMemo(() => explorerDrive(gql), [gql]);
  const layer = useMemo(
    () => drive.layer({ driveId, onChanged }),
    [drive, driveId, onChanged],
  );
  const executors = useMemo(
    (): ChatExecutors =>
      drive.adapter.executor.kind === "graphql"
        ? { graphql: drive.adapter.executor }
        : {},
    [drive],
  );
  return {
    chatManifest: drive.chatManifest,
    refSource: drive.adapter.refSource,
    executors,
    layer,
  };
}
