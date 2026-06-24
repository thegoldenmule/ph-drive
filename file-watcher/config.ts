/** Per-host watcher config, persisted to JSON; not part of any document model. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type WatcherConfig = {
  switchboardUrl: string;
  /** drive id to sync (null = idle) */
  driveId: string | null;
  /** absolute base dir to mirror the drive into (null = idle) */
  baseDir: string | null;
  /** files larger than this are listed but not downloaded */
  maxDownloadSizeBytes: number;
  /** substring/segment patterns to ignore on disk */
  exclude: string[];
  /** fallback reconcile interval; live updates come from the ws subscription */
  pollIntervalMs: number;
  enabled: boolean;
};

const CONFIG_PATH =
  process.env.WATCHER_CONFIG ??
  path.join(os.homedir(), ".ph-drive-watcher", "config.json");

function defaults(): WatcherConfig {
  return {
    switchboardUrl: process.env.SWITCHBOARD_URL ?? "http://localhost:4001",
    driveId: process.env.DRIVE_ID ?? null,
    baseDir: process.env.WATCH_DIR
      ? path.resolve(process.env.WATCH_DIR)
      : null,
    maxDownloadSizeBytes: process.env.MAX_DOWNLOAD_SIZE
      ? Number(process.env.MAX_DOWNLOAD_SIZE)
      : 100 * 1024 * 1024,
    exclude: [".DS_Store", "node_modules", ".git"],
    pollIntervalMs: 15000,
    enabled: Boolean(
      (process.env.DRIVE_ID && process.env.WATCH_DIR) || false,
    ),
  };
}

export function loadConfig(): WatcherConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

export function saveConfig(cfg: WatcherConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

export function configPath(): string {
  return CONFIG_PATH;
}

/** Validate + normalise a partial config patch coming from the editor. */
export function applyPatch(
  current: WatcherConfig,
  patch: Partial<WatcherConfig>,
): WatcherConfig {
  const next: WatcherConfig = { ...current, ...patch };
  if (typeof next.baseDir === "string" && next.baseDir.length > 0) {
    next.baseDir = path.resolve(next.baseDir);
  }
  if (next.switchboardUrl) {
    next.switchboardUrl = next.switchboardUrl.replace(/\/+$/, "");
  }
  if (!Number.isFinite(next.maxDownloadSizeBytes) || next.maxDownloadSizeBytes < 0) {
    next.maxDownloadSizeBytes = current.maxDownloadSizeBytes;
  }
  if (!Array.isArray(next.exclude)) next.exclude = current.exclude;
  return next;
}
