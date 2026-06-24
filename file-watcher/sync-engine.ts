/**
 * Bidirectional sync between a local directory and a reactor-drive drive.
 *
 * Serialized, idempotent 3-way reconcile over (base = last reconciled state,
 * disk, server). One-sided add/delete/modify propagates; modify-on-both is a
 * conflict where server wins. base is then set to the merged state so our own
 * writes don't echo back as new operations on the next reconcile.
 */
import chokidar, { type FSWatcher } from "chokidar";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DriveGql, folderPaths } from "../lib/drive-client.js";
import { Attachments } from "./attachments.js";
import type { WatcherConfig } from "./config.js";
import { subscribeToDrive } from "./subscription.js";

type BaseEntry = { type: "file" | "folder"; hash?: string };

export type SyncStatus = {
  running: boolean;
  switchboardUrl: string;
  driveId: string | null;
  baseDir: string | null;
  lastSyncIso: string | null;
  busy: boolean;
  counts: { folders: number; files: number };
  lastError: string | null;
  skipped: string[];
  conflicts: string[];
  log: string[];
};

const MIME: Record<string, string> = {
  ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".pdf": "application/pdf", ".csv": "text/csv", ".html": "text/html",
  ".js": "text/javascript", ".ts": "text/plain", ".zip": "application/zip",
  ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
};
function mimeOf(name: string): string {
  return MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

function sha256File(abs: string): string {
  return createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

export class SyncEngine {
  private cfg: WatcherConfig;
  private gql: DriveGql;
  private att: Attachments;
  private base = new Map<string, BaseEntry>();
  private watcher: FSWatcher | null = null;
  private poll: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;
  private running = false;
  private busy = false;
  private dirty = false;
  private status: SyncStatus;
  private logLines: string[] = [];

  constructor(cfg: WatcherConfig) {
    this.cfg = cfg;
    this.gql = new DriveGql(cfg.switchboardUrl);
    this.att = new Attachments(cfg.switchboardUrl);
    this.status = {
      running: false,
      switchboardUrl: cfg.switchboardUrl,
      driveId: cfg.driveId,
      baseDir: cfg.baseDir,
      lastSyncIso: null,
      busy: false,
      counts: { folders: 0, files: 0 },
      lastError: null,
      skipped: [],
      conflicts: [],
      log: [],
    };
  }

  getStatus(): SyncStatus {
    return { ...this.status, running: this.running, busy: this.busy, log: this.logLines.slice(-50) };
  }

  private log(msg: string): void {
    const line = `${new Date().toISOString()}  ${msg}`;
    this.logLines.push(line);
    if (this.logLines.length > 200) this.logLines = this.logLines.slice(-200);
    console.log(`[sync] ${msg}`);
  }

  async start(): Promise<void> {
    if (this.running) await this.stop();
    if (!this.cfg.driveId || !this.cfg.baseDir) {
      this.log("not starting: driveId and baseDir are required");
      return;
    }
    fs.mkdirSync(this.cfg.baseDir, { recursive: true });
    this.base.clear();
    this.running = true;
    this.log(`starting sync: drive ${this.cfg.driveId} <-> ${this.cfg.baseDir}`);

    await this.syncNow(); // empty base => union, no deletes

    this.watcher = chokidar.watch(this.cfg.baseDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
    });
    const trigger = this.debounce(() => void this.syncNow(), 300);
    this.watcher.on("all", trigger);

    // Live push from the switchboard is the primary trigger; the poll below is a
    // slower safety net for missed events / dropped connections.
    this.unsubscribe = subscribeToDrive(
      this.cfg.switchboardUrl,
      this.cfg.driveId!,
      trigger,
      (s, detail) => {
        if (s === "connected") this.log("switchboard subscription connected");
        else if (s === "error")
          this.log(
            `subscription error: ${detail instanceof Error ? detail.message : String(detail ?? "")}`,
          );
      },
    );

    this.poll = setInterval(() => void this.syncNow(), this.cfg.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    if (this.watcher) await this.watcher.close();
    this.watcher = null;
    this.log("stopped");
  }

  /** Run one reconcile; coalesces concurrent triggers. */
  async syncNow(): Promise<void> {
    if (!this.running && !this.cfg.driveId) return;
    if (this.busy) {
      this.dirty = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.dirty = false;
        await this.reconcile();
      } while (this.dirty && this.running);
      this.status.lastSyncIso = new Date().toISOString();
      this.status.lastError = null;
    } catch (err: any) {
      this.status.lastError = err?.message ?? String(err);
      this.log(`error: ${this.status.lastError}`);
    } finally {
      this.busy = false;
    }
  }

  private async reconcile(): Promise<void> {
    const driveId = this.cfg.driveId!;
    const baseDir = this.cfg.baseDir!;

    // snapshot disk
    const diskFolders = new Set<string>();
    const diskFiles = new Map<string, { abs: string; hash: string; size: number }>();
    this.walk(baseDir, "", diskFolders, diskFiles);

    // snapshot server
    const tree = await this.gql.listTree(driveId);
    const fpaths = folderPaths(tree.folders); // folderId -> "/a/b"
    const serverFolders = new Map<string, string>(); // path -> folderId
    for (const f of tree.folders) {
      const p = fpaths.get(f.id);
      if (p) serverFolders.set(p, f.id);
    }
    const serverFiles = new Map<
      string,
      { nodeId: string; hash: string | null; ref: string | null; size: number | null; mimeType: string | null }
    >();
    for (const file of tree.files) {
      const parent = file.parentFolder ? (fpaths.get(file.parentFolder) ?? "") : "";
      const p = `${parent}/${file.name}`;
      serverFiles.set(p, {
        nodeId: file.id,
        hash: file.sha256,
        ref: file.content,
        size: file.size,
        mimeType: file.mimeType,
      });
    }

    const newBase = new Map<string, BaseEntry>();
    const conflicts: string[] = [];
    const skipped: string[] = [];

    // reconcile FOLDERS: create parents first, delete deepest first
    const folderPathsAll = new Set<string>([
      ...diskFolders,
      ...serverFolders.keys(),
      ...[...this.base].filter(([, v]) => v.type === "folder").map(([k]) => k),
    ]);
    const byDepthAsc = [...folderPathsAll].sort((a, b) => depth(a) - depth(b));
    const byDepthDesc = [...folderPathsAll].sort((a, b) => depth(b) - depth(a));

    for (const p of byDepthAsc) {
      const dHas = diskFolders.has(p);
      const sHas = serverFolders.has(p);
      const bHas = this.base.get(p)?.type === "folder";
      if (!bHas && dHas && !sHas) {
        const id = await this.ensureServerFolder(driveId, p, serverFolders);
        this.log(`+folder -> server ${p} (${id})`);
      } else if (!bHas && !dHas && sHas) {
        await fsp.mkdir(path.join(baseDir, toFsPath(p)), { recursive: true });
        this.log(`+folder -> disk ${p}`);
      }
    }
    for (const p of byDepthDesc) {
      const dHas = diskFolders.has(p);
      const sHas = serverFolders.has(p);
      const bHas = this.base.get(p)?.type === "folder";
      if (bHas && !dHas && sHas) {
        const id = serverFolders.get(p);
        if (id) {
          await this.gql.removeFolder(driveId, id);
          serverFolders.delete(p);
          this.log(`-folder -> server ${p}`);
        }
      } else if (bHas && dHas && !sHas) {
        await fsp.rm(path.join(baseDir, toFsPath(p)), { recursive: true, force: true });
        diskFolders.delete(p);
        this.log(`-folder -> disk ${p}`);
      }
    }
    for (const p of folderPathsAll) {
      if (serverFolders.has(p) || diskFolders.has(p)) newBase.set(p, { type: "folder" });
    }

    // reconcile FILES
    const filePathsAll = new Set<string>([
      ...diskFiles.keys(),
      ...serverFiles.keys(),
      ...[...this.base].filter(([, v]) => v.type === "file").map(([k]) => k),
    ]);

    for (const p of filePathsAll) {
      const d = diskFiles.get(p);
      const s = serverFiles.get(p);
      const b = this.base.get(p);
      const bHash = b?.type === "file" ? b.hash : undefined;

      if (d && s) {
        if (d.hash === s.hash) {
          newBase.set(p, { type: "file", hash: d.hash });
          continue;
        }
        const localChanged = d.hash !== bHash;
        const remoteChanged = s.hash !== bHash;
        if (localChanged && remoteChanged) {
          conflicts.push(p);
          this.log(`!conflict ${p} -> server wins`);
          if (await this.downloadTo(baseDir, p, s, skipped)) newBase.set(p, { type: "file", hash: s.hash ?? d.hash });
          else newBase.set(p, { type: "file", hash: d.hash });
        } else if (localChanged) {
          await this.uploadUpdate(driveId, p, s.nodeId, d, serverFolders);
          newBase.set(p, { type: "file", hash: d.hash });
          this.log(`~file -> server ${p}`);
        } else {
          if (await this.downloadTo(baseDir, p, s, skipped)) newBase.set(p, { type: "file", hash: s.hash ?? bHash });
          this.log(`~file -> disk ${p}`);
        }
        continue;
      }

      // disk only
      if (d && !s) {
        if (bHash !== undefined) {
          // existed before => deleted on server, mirror the delete locally
          await fsp.rm(path.join(baseDir, toFsPath(p)), { force: true });
          this.log(`-file -> disk ${p}`);
        } else {
          await this.uploadNew(driveId, p, d, serverFolders);
          newBase.set(p, { type: "file", hash: d.hash });
          this.log(`+file -> server ${p}`);
        }
        continue;
      }

      // server only
      if (!d && s) {
        if (bHash !== undefined) {
          // existed before => deleted on disk, mirror the delete on the server
          await this.gql.removeFile(driveId, s.nodeId);
          this.log(`-file -> server ${p}`);
        } else {
          if (await this.downloadTo(baseDir, p, s, skipped)) newBase.set(p, { type: "file", hash: s.hash ?? "" });
          this.log(`+file -> disk ${p}`);
        }
        continue;
      }
    }

    this.base = newBase;
    this.status.counts = {
      folders: [...newBase.values()].filter((v) => v.type === "folder").length,
      files: [...newBase.values()].filter((v) => v.type === "file").length,
    };
    this.status.conflicts = conflicts;
    this.status.skipped = skipped;
    this.status.driveId = driveId;
    this.status.baseDir = baseDir;
  }

  private walk(
    base: string,
    rel: string,
    folders: Set<string>,
    files: Map<string, { abs: string; hash: string; size: number }>,
  ): void {
    const abs = path.join(base, toFsPath(rel));
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (this.excluded(e.name)) continue;
      const childRel = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        folders.add(childRel);
        this.walk(base, childRel, folders, files);
      } else if (e.isFile()) {
        const fileAbs = path.join(base, toFsPath(childRel));
        try {
          const st = fs.statSync(fileAbs);
          files.set(childRel, { abs: fileAbs, hash: sha256File(fileAbs), size: st.size });
        } catch {
          /* file vanished mid-walk */
        }
      }
    }
  }

  private excluded(name: string): boolean {
    return this.cfg.exclude.some((x) => name === x || name.includes(x));
  }

  /** Ensure a folder path exists on the server, creating ancestors as needed. */
  private async ensureServerFolder(
    driveId: string,
    p: string,
    serverFolders: Map<string, string>,
  ): Promise<string> {
    if (serverFolders.has(p)) return serverFolders.get(p)!;
    const parts = p.split("/").filter(Boolean);
    let cur = "";
    let parentId: string | null = null;
    for (const part of parts) {
      cur = `${cur}/${part}`;
      let id = serverFolders.get(cur);
      if (!id) {
        id = await this.gql.addFolder(driveId, part, parentId);
        serverFolders.set(cur, id);
      }
      parentId = id;
    }
    return serverFolders.get(p)!;
  }

  private parentFolderId(p: string, serverFolders: Map<string, string>): string | null {
    const parent = p.slice(0, p.lastIndexOf("/"));
    return parent ? (serverFolders.get(parent) ?? null) : null;
  }

  private async uploadNew(
    driveId: string,
    p: string,
    d: { abs: string; hash: string; size: number },
    serverFolders: Map<string, string>,
  ): Promise<void> {
    const name = p.slice(p.lastIndexOf("/") + 1);
    const parentId = this.parentFolderId(p, serverFolders);
    const bytes = await fsp.readFile(d.abs);
    const { ref, hash, size } = await this.att.upload(bytes, name, mimeOf(name));
    await this.gql.createFile(driveId, {
      name,
      parentFolder: parentId,
      content: ref,
      mimeType: mimeOf(name),
      size,
      sha256: hash,
    });
  }

  private async uploadUpdate(
    driveId: string,
    p: string,
    nodeId: string,
    d: { abs: string; hash: string; size: number },
    serverFolders: Map<string, string>,
  ): Promise<void> {
    const name = p.slice(p.lastIndexOf("/") + 1);
    const parentId = this.parentFolderId(p, serverFolders);
    const bytes = await fsp.readFile(d.abs);
    const { ref, hash, size } = await this.att.upload(bytes, name, mimeOf(name));
    await this.gql.setFileContent(nodeId, {
      content: ref,
      mimeType: mimeOf(name),
      size,
      sha256: hash,
      parentFolder: parentId,
    });
  }

  private async downloadTo(
    baseDir: string,
    p: string,
    s: { ref: string | null; size: number | null },
    skipped: string[],
  ): Promise<boolean> {
    if (!s.ref) return false;
    if (s.size != null && s.size > this.cfg.maxDownloadSizeBytes) {
      skipped.push(p);
      this.log(`skip download (too large) ${p} (${s.size} bytes)`);
      return false;
    }
    const bytes = await this.att.download(s.ref);
    const abs = path.join(baseDir, toFsPath(p));
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.phd-dl-${process.pid}`;
    await fsp.writeFile(tmp, bytes);
    await fsp.rename(tmp, abs);
    return true;
  }

  private debounce(fn: () => void, ms: number): () => void {
    let t: NodeJS.Timeout | null = null;
    return () => {
      if (t) clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
}

function depth(p: string): number {
  return p.split("/").filter(Boolean).length;
}
/** Convert a POSIX-ish "/a/b" tree path to an OS filesystem relative path. */
function toFsPath(p: string): string {
  return p.split("/").filter(Boolean).join(path.sep);
}
