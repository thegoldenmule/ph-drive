import { phDrive } from "nl-drive/ph-drive";
import { describe, expect, it } from "vitest";
import { DriveGql, type DriveFolder } from "../../lib/drive-client.js";
import {
  DRIVE_CHAT_ARTIFACTS,
  explorerChatContext,
  explorerTargetName,
} from "./chat-context.js";

const folder = (
  id: string,
  name: string,
  parentFolder: string | null = null,
): DriveFolder => ({ kind: "folder", id, name, parentFolder });
const FOLDERS = [folder("rep", "Reports"), folder("q3", "Q3", "rep")];

describe("explorer chat context", () => {
  it("names the drive at the top level and the folder path inside one", () => {
    expect(explorerTargetName("Team", null, FOLDERS)).toBe("Team");
    expect(explorerTargetName("Team", "q3", FOLDERS)).toBe(
      "Team / Reports / Q3",
    );
  });

  it("targets the drive, with the current folder and what is in view", () => {
    const c = explorerChatContext({
      driveId: "drv",
      driveName: "Team",
      cwd: "rep",
      folders: FOLDERS,
      files: [],
      recent: [],
    });
    expect(c.frame.target).toEqual({
      kind: "drive",
      id: "drv",
      name: "Team / Reports",
    });
    expect(c.frame.folderId).toBe("rep");
    expect(c.frame.visibleIds).toEqual(["q3"]);
  });

  it("offers no copy, file create or file move", () => {
    const keys = phDrive(
      new DriveGql("http://localhost:4001"),
    ).chatManifest.catalog.map((e) => e.key);
    for (const op of ["COPY_NODE", "ADD_FILE", "UPDATE_FILE", "SET_DRIVE_NAME"])
      expect(keys).not.toContain(`document-drive:${op}`);
    expect(DRIVE_CHAT_ARTIFACTS.artifacts.lora.devPath).toMatch(/^\/models\//);
  });
});
