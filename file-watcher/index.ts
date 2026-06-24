/**
 * ph-drive file-watcher entrypoint. Boots the control API, then starts syncing
 * if a persisted config is enabled; otherwise stays idle until the editor
 * configures it. Run: WATCHER_PORT=4111 pnpm watch
 */
import {
  applyPatch,
  configPath,
  loadConfig,
  saveConfig,
  type WatcherConfig,
} from "./config.js";
import { startControlServer } from "./control-server.js";
import { SyncEngine, type SyncStatus } from "./sync-engine.js";

const PORT = Number(process.env.WATCHER_PORT ?? 4111);

export type WatcherManager = {
  getConfig(): WatcherConfig;
  getStatus(): SyncStatus & { configPath: string };
  setConfig(patch: Partial<WatcherConfig>): Promise<WatcherConfig>;
  start(): Promise<WatcherConfig>;
  stop(): Promise<WatcherConfig>;
};

class Manager implements WatcherManager {
  private cfg: WatcherConfig;
  private engine: SyncEngine | null = null;

  constructor() {
    this.cfg = loadConfig();
  }

  getConfig(): WatcherConfig {
    return this.cfg;
  }

  getStatus() {
    const base: SyncStatus = this.engine
      ? this.engine.getStatus()
      : {
          running: false,
          switchboardUrl: this.cfg.switchboardUrl,
          driveId: this.cfg.driveId,
          baseDir: this.cfg.baseDir,
          lastSyncIso: null,
          busy: false,
          counts: { folders: 0, files: 0 },
          lastError: null,
          skipped: [],
          conflicts: [],
          log: [],
        };
    return { ...base, configPath: configPath() };
  }

  private async restart(): Promise<void> {
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }
    if (this.cfg.enabled && this.cfg.driveId && this.cfg.baseDir) {
      this.engine = new SyncEngine(this.cfg);
      await this.engine.start();
    }
  }

  async setConfig(patch: Partial<WatcherConfig>): Promise<WatcherConfig> {
    this.cfg = applyPatch(this.cfg, patch);
    saveConfig(this.cfg);
    await this.restart();
    return this.cfg;
  }

  async start(): Promise<WatcherConfig> {
    this.cfg = { ...this.cfg, enabled: true };
    saveConfig(this.cfg);
    await this.restart();
    return this.cfg;
  }

  async stop(): Promise<WatcherConfig> {
    this.cfg = { ...this.cfg, enabled: false };
    saveConfig(this.cfg);
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }
    return this.cfg;
  }
}

async function main() {
  const manager = new Manager();
  startControlServer(manager, PORT);

  const cfg = manager.getConfig();
  console.log(`[watcher] config: ${configPath()}`);
  console.log(
    `[watcher] switchboard=${cfg.switchboardUrl} drive=${cfg.driveId ?? "(none)"} baseDir=${cfg.baseDir ?? "(none)"} enabled=${cfg.enabled}`,
  );
  if (cfg.enabled && cfg.driveId && cfg.baseDir) {
    await manager.start();
  } else {
    console.log("[watcher] idle — configure it from the editor's Settings panel.");
  }

  const shutdown = async () => {
    console.log("\n[watcher] shutting down…");
    await manager.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[watcher] fatal:", err);
  process.exit(1);
});
