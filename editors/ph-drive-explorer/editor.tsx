import type { EditorProps } from "document-model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DriveGql,
  type DriveFile,
  type DriveFolder,
} from "../../lib/drive-client.js";
import { uploadAttachment } from "./attachments-browser.js";
import { WatcherSettings } from "./components/watcher-settings.js";

const LS = {
  switchboard: "phdrive.switchboardUrl",
  watcher: "phdrive.watcherUrl",
  drive: "phdrive.driveId",
};
const lsGet = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
  }
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

function fileIcon(name: string, mimeType: string | null): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if ((mimeType ?? "").startsWith("image/")) return "🖼️";
  if ((mimeType ?? "").startsWith("video/")) return "🎬";
  if ((mimeType ?? "").startsWith("audio/")) return "🎵";
  if (ext === "pdf") return "📕";
  if (["zip", "tar", "gz"].includes(ext)) return "🗜️";
  if (["md", "txt"].includes(ext)) return "📝";
  if (["json", "js", "ts", "tsx", "html", "css"].includes(ext)) return "🧾";
  return "📄";
}

function humanSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function Editor(props: EditorProps) {
  const docDriveId = (props.document?.header as { id?: string } | undefined)?.id;

  const [switchboardUrl, setSwitchboardUrl] = useState(() =>
    lsGet(LS.switchboard, "http://localhost:4001"),
  );
  const [watcherUrl, setWatcherUrl] = useState(() =>
    lsGet(LS.watcher, "http://localhost:4111"),
  );
  const [driveId, setDriveId] = useState(() => docDriveId ?? lsGet(LS.drive, ""));

  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [cwd, setCwd] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; status: string }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveInput, setDriveInput] = useState("");
  const dragDepth = useRef(0);

  const gql = useMemo(() => new DriveGql(switchboardUrl), [switchboardUrl]);

  useEffect(() => {
    if (docDriveId) {
      setDriveId(docDriveId);
      lsSet(LS.drive, docDriveId);
    }
  }, [docDriveId]);

  // Connect's drive "app" gets no `document` prop; it exposes the open drive id on window.ph.
  useEffect(() => {
    if (docDriveId || driveId) return;
    const read = () =>
      (globalThis as { ph?: { selectedDriveId?: string } }).ph?.selectedDriveId;
    const id = read();
    if (id) {
      setDriveId(id);
      return;
    }
    const t = setInterval(() => {
      const v = read();
      if (v) {
        setDriveId(v);
        clearInterval(t);
      }
    }, 500);
    return () => clearInterval(t);
  }, [docDriveId, driveId]);
  useEffect(() => lsSet(LS.switchboard, switchboardUrl), [switchboardUrl]);
  useEffect(() => lsSet(LS.watcher, watcherUrl), [watcherUrl]);
  useEffect(() => {
    if (driveId) lsSet(LS.drive, driveId);
  }, [driveId]);

  const refresh = useCallback(async () => {
    if (!driveId) return;
    try {
      const t = await gql.listTree(driveId);
      setFolders(t.folders);
      setFiles(t.files);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [gql, driveId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const childFolders = folders
    .filter((f) => (f.parentFolder ?? null) === cwd)
    .sort(byName);
  const childFiles = files
    .filter((f) => (f.parentFolder ?? null) === cwd)
    .sort(byName);

  const crumbs: { id: string | null; name: string }[] = [{ id: null, name: "My Drive" }];
  {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const chain: DriveFolder[] = [];
    let cur = cwd ? byId.get(cwd) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur);
      cur = cur.parentFolder ? byId.get(cur.parentFolder) : undefined;
    }
    for (const f of chain) crumbs.push({ id: f.id, name: f.name });
  }

  const descendantIds = useCallback(
    (folderId: string): string[] => {
      const out = [folderId];
      const stack = [folderId];
      while (stack.length) {
        const id = stack.pop()!;
        for (const f of folders)
          if (f.parentFolder === id) {
            out.push(f.id);
            stack.push(f.id);
          }
      }
      return out;
    },
    [folders],
  );

  const handleDrop = async (fileList: File[]) => {
    if (!driveId || !fileList.length) return;
    setUploads(fileList.map((f) => ({ name: f.name, status: "uploading" })));
    for (const file of fileList) {
      try {
        const att = await uploadAttachment(switchboardUrl, file);
        await gql.createFile(driveId, {
          name: file.name,
          parentFolder: cwd,
          content: att.ref,
          mimeType: att.mimeType,
          size: att.size,
          sha256: att.hash,
        });
        setUploads((u) =>
          u.map((x) => (x.name === file.name ? { ...x, status: "done" } : x)),
        );
      } catch (e: any) {
        setUploads((u) =>
          u.map((x) =>
            x.name === file.name ? { ...x, status: `error: ${e?.message ?? e}` } : x,
          ),
        );
      }
    }
    await refresh();
    setTimeout(() => setUploads([]), 2500);
  };

  const newFolder = async () => {
    const name = window.prompt("New folder name");
    if (!name || !driveId) return;
    await gql.addFolder(driveId, name, cwd);
    await refresh();
  };

  const deleteFolder = async (id: string) => {
    if (!driveId) return;
    if (!window.confirm("Delete this folder and its contents?")) return;
    const ids = descendantIds(id);
    const idSet = new Set(ids);
    for (const f of files) if (f.parentFolder && idSet.has(f.parentFolder)) await gql.removeFile(driveId, f.id);
    // deepest-first so a parent is never removed before its children
    const toDelete = folders
      .filter((f) => idSet.has(f.id))
      .sort((a, b) => depth(b, folders) - depth(a, folders));
    for (const f of toDelete) await gql.removeFolder(driveId, f.id);
    await refresh();
  };

  const deleteFile = async (id: string) => {
    if (!driveId) return;
    await gql.removeFile(driveId, id);
    await refresh();
  };

  const createDrive = async () => {
    const id = await gql.createDrive("My Drive", "PhDriveExplorer");
    setDriveId(id);
  };

  if (!driveId) {
    return (
      <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", maxWidth: 560 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>ph-drive</h2>
        <p style={{ color: "#555" }}>Connect to a switchboard and pick a drive.</p>
        <label style={{ display: "block", marginTop: 16, fontSize: 13 }}>Switchboard URL</label>
        <input
          value={switchboardUrl}
          onChange={(e) => setSwitchboardUrl(e.target.value)}
          style={inputStyle}
        />
        <label style={{ display: "block", marginTop: 16, fontSize: 13 }}>
          Existing drive id
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={driveInput} onChange={(e) => setDriveInput(e.target.value)} style={inputStyle} />
          <button style={btnStyle} onClick={() => setDriveId(driveInput.trim())}>
            Open
          </button>
        </div>
        <div style={{ marginTop: 16 }}>
          <button style={primaryBtn} onClick={createDrive}>
            + Create a new drive
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-accepts-files=""
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        setDragOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current--;
        if (dragDepth.current <= 0) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        void handleDrop(Array.from(e.dataTransfer?.files ?? []));
      }}
      style={{
        position: "relative",
        height: "100%",
        minHeight: 480,
        fontFamily: "system-ui, sans-serif",
        color: "#1a1a1a",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid #eaeaea",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, flexWrap: "wrap" }}>
          {crumbs.map((c, i) => (
            <span key={c.id ?? "root"} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <span style={{ color: "#bbb" }}>/</span>}
              <button
                onClick={() => setCwd(c.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 15,
                  fontWeight: i === crumbs.length - 1 ? 600 : 400,
                  color: i === crumbs.length - 1 ? "#1a1a1a" : "#4385f5",
                  padding: "2px 4px",
                }}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>
        <button style={btnStyle} onClick={newFolder}>＋ Folder</button>
        <button style={btnStyle} onClick={() => setSettingsOpen(true)}>⚙ Settings</button>
      </div>

      {error && (
        <div style={{ padding: "8px 16px", background: "#fdecea", color: "#b3261e", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {childFolders.length === 0 && childFiles.length === 0 ? (
          <div style={{ color: "#999", textAlign: "center", marginTop: 64 }}>
            This folder is empty. Drag files here to upload.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 12,
            }}
          >
            {childFolders.map((f) => (
              <Tile
                key={f.id}
                icon="📁"
                title={f.name}
                subtitle="Folder"
                onOpen={() => setCwd(f.id)}
                onDelete={() => deleteFolder(f.id)}
              />
            ))}
            {childFiles.map((f) => (
              <Tile
                key={f.id}
                icon={fileIcon(f.name, f.mimeType)}
                title={f.name}
                subtitle={humanSize(f.size)}
                href={f.sha256 ? `${switchboardUrl.replace(/\/+$/, "")}/attachments/${f.sha256}` : undefined}
                onDelete={() => deleteFile(f.id)}
              />
            ))}
          </div>
        )}
      </div>

      {uploads.length > 0 && (
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,.12)",
            padding: 12,
            minWidth: 220,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Uploading</div>
          {uploads.map((u) => (
            <div key={u.name} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.name}
              </span>
              <span style={{ color: u.status.startsWith("error") ? "#b3261e" : u.status === "done" ? "#1a7f37" : "#888" }}>
                {u.status === "done" ? "✓" : u.status === "uploading" ? "…" : "✕"}
              </span>
            </div>
          ))}
        </div>
      )}

      {dragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(67,133,245,0.08)",
            border: "3px dashed #4385f5",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            color: "#4385f5",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          Drop files to upload
        </div>
      )}

      {settingsOpen && (
        <WatcherSettings
          watcherUrl={watcherUrl}
          setWatcherUrl={setWatcherUrl}
          switchboardUrl={switchboardUrl}
          driveId={driveId}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function depth(f: DriveFolder, all: DriveFolder[]): number {
  const byId = new Map(all.map((x) => [x.id, x]));
  let n = 0;
  let cur: DriveFolder | undefined = f;
  const seen = new Set<string>();
  while (cur?.parentFolder && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentFolder);
    n++;
  }
  return n;
}

function Tile(props: {
  icon: string;
  title: string;
  subtitle?: string;
  onOpen?: () => void;
  onDelete?: () => void;
  href?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={props.onOpen}
      style={{
        position: "relative",
        border: "1px solid #e6e6e6",
        borderRadius: 10,
        padding: 14,
        cursor: props.onOpen ? "pointer" : "default",
        background: hover ? "#f7f9ff" : "#fff",
        transition: "background .12s",
      }}
    >
      {props.onDelete && hover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete!();
          }}
          title="Delete"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            border: "none",
            background: "rgba(0,0,0,.05)",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            width: 22,
            height: 22,
          }}
        >
          ✕
        </button>
      )}
      <div onClick={props.onOpen} style={{ fontSize: 36, textAlign: "center" }}>
        {props.icon}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: 500,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={props.title}
      >
        {props.href ? (
          <a href={props.href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
            {props.title}
          </a>
        ) : (
          props.title
        )}
      </div>
      {props.subtitle && (
        <div style={{ fontSize: 11, color: "#999", textAlign: "center", marginTop: 2 }}>
          {props.subtitle}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 14,
  marginTop: 4,
};
const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};
const primaryBtn: React.CSSProperties = {
  ...btnStyle,
  background: "#4385f5",
  color: "#fff",
  border: "1px solid #4385f5",
};
