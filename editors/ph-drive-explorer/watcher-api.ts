// Client for the watcher's localhost control API (machine-local settings that don't belong in a document model).
export type WatcherStatus = {
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
  configPath?: string;
};

export type WatcherConfig = {
  switchboardUrl: string;
  driveId: string | null;
  baseDir: string | null;
  maxDownloadSizeBytes: number;
  exclude: string[];
  pollIntervalMs: number;
  enabled: boolean;
};

export type FsListing = {
  path: string;
  parent: string;
  entries: { name: string; isDir: boolean }[];
};

export class WatcherApi {
  readonly base: string;
  constructor(url: string) {
    this.base = url.replace(/\/+$/, "");
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, init);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  status(): Promise<WatcherStatus> {
    return this.json<WatcherStatus>("/status");
  }
  getConfig(): Promise<WatcherConfig> {
    return this.json<WatcherConfig>("/config");
  }
  setConfig(patch: Partial<WatcherConfig>): Promise<WatcherConfig> {
    return this.json<WatcherConfig>("/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }
  start(): Promise<unknown> {
    return this.json("/start", { method: "POST" });
  }
  stop(): Promise<unknown> {
    return this.json("/stop", { method: "POST" });
  }
  listDir(path: string): Promise<FsListing> {
    return this.json<FsListing>(`/fs/list?path=${encodeURIComponent(path)}`);
  }
}
