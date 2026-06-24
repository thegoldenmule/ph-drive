import { useCallback, useEffect, useState } from "react";
import {
  WatcherApi,
  type FsListing,
  type WatcherConfig,
  type WatcherStatus,
} from "../watcher-api.js";

export function WatcherSettings(props: {
  watcherUrl: string;
  setWatcherUrl: (v: string) => void;
  switchboardUrl: string;
  driveId: string;
  onClose: () => void;
}) {
  const { watcherUrl, setWatcherUrl, switchboardUrl, driveId, onClose } = props;
  const [api, setApi] = useState(() => new WatcherApi(watcherUrl));
  const [online, setOnline] = useState<boolean | null>(null);
  const [status, setStatus] = useState<WatcherStatus | null>(null);
  const [config, setConfig] = useState<WatcherConfig | null>(null);
  const [picker, setPicker] = useState<FsListing | null>(null);
  const [maxMb, setMaxMb] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setApi(new WatcherApi(watcherUrl)), [watcherUrl]);

  const poll = useCallback(async () => {
    const ok = await api.health();
    setOnline(ok);
    if (!ok) return;
    try {
      const [s, c] = await Promise.all([api.status(), api.getConfig()]);
      setStatus(s);
      setConfig(c);
      setMaxMb(Math.round(c.maxDownloadSizeBytes / (1024 * 1024)));
    } catch {
    }
  }, [api]);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => clearInterval(id);
  }, [poll]);

  const openPicker = async (path?: string) => {
    try {
      setPicker(await api.listDir(path ?? config?.baseDir ?? ""));
    } catch (e: any) {
      setMsg(`picker error: ${e?.message ?? e}`);
    }
  };

  const chooseBaseDir = async (dir: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const c = await api.setConfig({
        switchboardUrl,
        driveId,
        baseDir: dir,
        maxDownloadSizeBytes: maxMb * 1024 * 1024,
      });
      setConfig(c);
      setPicker(null);
      setMsg(`base directory set to ${c.baseDir}`);
      await poll();
    } catch (e: any) {
      setMsg(`error: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const applyAndStart = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.setConfig({
        switchboardUrl,
        driveId,
        maxDownloadSizeBytes: maxMb * 1024 * 1024,
      });
      await api.start();
      setMsg("syncing started");
      await poll();
    } catch (e: any) {
      setMsg(`error: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await api.stop();
      await poll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Local sync (watcher)</h3>
          <button style={iconBtn} onClick={onClose}>✕</button>
        </div>

        <label style={lbl}>Watcher control URL</label>
        <input style={inp} value={watcherUrl} onChange={(e) => setWatcherUrl(e.target.value)} />
        <div style={{ fontSize: 12, marginTop: 4, color: online ? "#1a7f37" : "#b3261e" }}>
          {online === null ? "checking…" : online ? "● connected" : "● not reachable — is `pnpm watch` running?"}
        </div>

        {online && (
          <>
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Stat label="Status" value={status?.running ? (status.busy ? "syncing…" : "running") : "stopped"} />
              <Stat label="Last sync" value={status?.lastSyncIso ? new Date(status.lastSyncIso).toLocaleTimeString() : "—"} />
              <Stat label="Folders / files" value={`${status?.counts.folders ?? 0} / ${status?.counts.files ?? 0}`} />
              <Stat label="Drive" value={status?.driveId === driveId ? "this drive" : status?.driveId ? "other drive" : "—"} />
            </div>

            <label style={{ ...lbl, marginTop: 16 }}>Base directory (on the watcher host)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={inp} readOnly value={config?.baseDir ?? "(not set)"} />
              <button style={btn} onClick={() => openPicker()}>Browse…</button>
            </div>

            {picker && (
              <div style={pickerBox}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <button style={btn} onClick={() => openPicker(picker.parent)}>⬆ up</button>
                  <span style={{ fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {picker.path}
                  </span>
                </div>
                <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #eee", borderRadius: 6 }}>
                  {picker.entries.filter((e) => e.isDir).map((e) => (
                    <div
                      key={e.name}
                      onClick={() => openPicker(`${picker.path}/${e.name}`)}
                      style={{ padding: "6px 10px", cursor: "pointer", fontSize: 13 }}
                    >
                      📁 {e.name}
                    </div>
                  ))}
                  {picker.entries.filter((e) => e.isDir).length === 0 && (
                    <div style={{ padding: 10, color: "#999", fontSize: 13 }}>No subfolders</div>
                  )}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button style={primary} disabled={busy} onClick={() => chooseBaseDir(picker.path)}>
                    Use “{picker.path.split("/").pop() || picker.path}”
                  </button>
                  <button style={btn} onClick={() => setPicker(null)}>Cancel</button>
                </div>
              </div>
            )}

            <label style={{ ...lbl, marginTop: 16 }}>Max download size (MB)</label>
            <input
              style={inp}
              type="number"
              value={maxMb}
              onChange={(e) => setMaxMb(Number(e.target.value) || 0)}
            />

            <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
              <button style={primary} disabled={busy || !config?.baseDir} onClick={applyAndStart}>
                Apply & Start sync
              </button>
              <button style={btn} disabled={busy} onClick={stop}>Stop</button>
            </div>

            {status?.lastError && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#b3261e" }}>error: {status.lastError}</div>
            )}
            {!!status?.skipped?.length && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#a15c00" }}>
                skipped (too large): {status.skipped.join(", ")}
              </div>
            )}
            {!!status?.conflicts?.length && (
              <div style={{ marginTop: 4, fontSize: 12, color: "#a15c00" }}>
                conflicts (server kept): {status.conflicts.join(", ")}
              </div>
            )}
          </>
        )}

        {msg && <div style={{ marginTop: 10, fontSize: 12, color: "#444" }}>{msg}</div>}
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div style={{ background: "#f6f7f9", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#888" }}>{props.label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{props.value}</div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  fontFamily: "system-ui, sans-serif",
};
const modal: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 20,
  width: 460,
  maxWidth: "92vw",
  maxHeight: "88vh",
  overflow: "auto",
  boxShadow: "0 12px 48px rgba(0,0,0,.25)",
};
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "#555", marginBottom: 2 };
const inp: React.CSSProperties = { width: "100%", padding: "7px 9px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const primary: React.CSSProperties = { ...btn, background: "#4385f5", color: "#fff", border: "1px solid #4385f5" };
const iconBtn: React.CSSProperties = { ...btn, padding: "4px 8px" };
const pickerBox: React.CSSProperties = { marginTop: 8, border: "1px solid #eee", borderRadius: 8, padding: 10, background: "#fafafa" };
