# ph-drive

A Google-Drive-style, two-way file sync built on the [Powerhouse](https://powerhouse.inc) stack.

A browser **editor** that looks like file folders and a standalone **Node file-watcher**
both sync through one local **Switchboard**. Drop a file into the editor and it appears
on disk; drop a file into the watched folder and it appears in the editor — folders and
deletes included, in both directions.

---

## What it does

- **Editor → disk:** drag a file into the Connect editor → it uploads as an attachment and
  becomes a file node → the watcher downloads the bytes to your local folder.
- **disk → editor:** create/delete a file or folder in the watched directory → the watcher
  emits the matching operations → the editor reflects it within a couple of seconds.
- **Machine-local settings live in the watcher, not a document.** The editor talks to the
  watcher directly over `localhost` to set the base directory, max download size,
  exclude globs, and start/stop — settings that are per-host and don't belong in shared state.

---

## Architecture

```
┌──────────────── Chrome ────────────────┐      ┌──────── Node (this repo) ────────┐
│ Connect studio (pnpm connect)           │ ctrl │ file-watcher/  (pnpm watch)       │
│  PhDriveExplorer editor                 │ plane│  HTTP control API (localhost)     │
│   • file-folder UI, drag-drop upload    │◀────▶│   /config /status /fs/list ...    │
│   • reads tree + writes ops via GraphQL │ CORS │  3-way reconcile sync engine      │
│   • Settings panel → watcher            │      │  chokidar(baseDir)                │
└───────────────┬─────────────────────────┘      │  remote attachment service        │
                │                                 └──────────────┬───────────────────┘
                │ GraphQL + WS + /attachments                    │ same, to any switchboard URL
                ▼ (SWITCHBOARD_URL, e.g. http://localhost:4001)  ▼
        ┌──────────────────── Switchboard (pnpm reactor) ────────────────────┐
        │ reactor (operation log = source of truth) + PGlite                  │
        │ document models: powerhouse/reactor-drive (baseline) + phdrive/file │
        │ reactor-drive NodeProcessor + attachment service (/attachments/*)   │
        └─────────────────────────────────────────────────────────────────────┘
```

Every piece is **switchboard-location-independent** — the switchboard URL is pure runtime
config, so the watcher and editor can point at a local or remote switchboard.

---

## How it works

**Drive model:**

- **Folders** are identity operations on the `reactor-drive` document — `ADD_FOLDER`, `UPDATE_FOLDER`,
  `REMOVE_FOLDER` (scope `document`).
- **Files** are separate **`phdrive/file`** documents linked to the drive via an
  `ADD_RELATIONSHIP` of type `drive/child`. Each file document's state holds the attachment
  ref + metadata (`content`, `mimeType`, `size`, `sha256`, `parentFolder`), so it is
  self-describing.
- **File bytes** live in the switchboard's content-addressed **attachment store**
  (`attachment://v1:<sha256>`), uploaded/downloaded over `/attachments/*` — never inside an
  operation.

**Reading the tree:** files come from `documentOutgoingRelationships(drive, "drive/child")`
and folders from folding the drive's operation log. (The reactor-drive node subgraph
name-collides with the auto-generated document-model subgraph, so the tree is read from raw
operations + relationships rather than that subgraph.)

**Bidirectional sync:** the watcher runs a serialized, idempotent **3-way reconcile**
(`base` snapshot vs. disk vs. server). Adds/deletes/modifies on either side are propagated;
content-addressed hashing makes every side effect idempotent, so writes never echo back into
new operations. Three things trigger a reconcile: a **live `graphql-ws` subscription** to the
switchboard's `documentChanges` (the primary, push-based path — server changes reach disk in
~300ms), `chokidar` for local disk changes, and a slow poll (default 15s) as a safety net for
dropped connections or missed events.

---

## Repository layout

```
ph-drive/
├── document-models/ph-drive-file/   # custom `phdrive/file` model (attachment ref + metadata)
├── editors/ph-drive-explorer/       # Connect editor (folder UI, drag-drop, watcher settings)
│   ├── editor.tsx                   #   file-folder UI + drag-drop upload
│   ├── module.ts                    #   EditorModule, documentTypes: ["powerhouse/reactor-drive"]
│   ├── drive-... / attachments-browser.ts / watcher-api.ts
│   └── components/watcher-settings.tsx
├── file-watcher/                    # standalone Node sync process
│   ├── index.ts                     #   entrypoint + manager
│   ├── control-server.ts            #   localhost HTTP control API (editor talks to this)
│   ├── sync-engine.ts               #   3-way reconcile (bidirectional sync)
│   ├── subscription.ts              #   graphql-ws live subscription to the switchboard
│   ├── attachments.ts               #   download/upload bytes via the switchboard
│   └── config.ts                    #   local config store
├── lib/drive-client.ts             # shared reactor GraphQL client (browser + node)
├── scripts/create-drive.ts          # create a reactor-drive drive + set its editor
├── specs/phdrive-file.json          # document-model spec (input to `ph generate`)
└── processors/ · subgraphs/         # generated scaffolding (unused here)
```

---

## Prerequisites

- **Node 24+** and **pnpm**
- **Chrome** (the editor ↔ watcher channel is localhost-only and targeted at Chrome)
- The **`ph` CLI** (`@powerhousedao/ph-cli`)
- A local **Connect checkout with reactor-drive support** — see below

### Connect support (linked checkout)

Stock Connect only renders `powerhouse/document-drive` drives. This project links a patched
Connect checkout via `pnpm-workspace.yaml` `overrides`:

```yaml
overrides:
  "@powerhousedao/connect": "link:/…/powerhouse-feature-0/apps/connect"
  "@powerhousedao/reactor-browser": "link:/…/powerhouse-feature-0/packages/reactor-browser"
```

> Update these paths to your checkout. The changes there are backward-compatible (both
> `document-drive` and `reactor-drive` drives work):
>
> - **reactor-browser** — a `DRIVE_DOCUMENT_TYPES` list; the drive list and the drive-app
>   editor selection now include `reactor-drive`; the drive-list refresh subscribes to all
>   drive types (fixes first-load visibility).
> - **reactor** (`read-models/document-view.ts`) — preserves `header.meta` across operations,
>   so a drive's `preferredEditor` is not wiped when a later op (e.g. `ADD_RELATIONSHIP`)
>   rebuilds the snapshot.

After editing the source of the linked packages, rebuild them
(`pnpm --filter @powerhousedao/reactor-browser build`, etc.) since the project resolves them
from `dist`.

---

## Setup

```bash
pnpm install
```

## Running it

Three processes. Use three terminals.

```bash
# 1) Switchboard (reactor + attachment service), dev mode loads this project's models
pnpm reactor                 # http://localhost:4001

# 2) Create a reactor-drive drive (prints DRIVE_ID + the Connect URL)
pnpm create-drive "My Drive"

# 3) Connect studio, pointed at the drive
pnpm connect --default-drives-url http://localhost:4001/d/<DRIVE_ID>   # http://localhost:3000

# 4) The file-watcher (boots idle; configure it from the editor)
WATCHER_PORT=4111 pnpm watch
```

Then in **Chrome** open `http://localhost:3000`, click the drive, and:

1. **Drag a file** onto the editor → it uploads and a tile appears.
2. Open **⚙ Settings** → it connects to the watcher → **Browse** to a base directory → set a
   max download size → **Apply & Start**.
3. The dragged file now appears on disk; drop a file into that directory and it appears in the
   editor.

---

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm reactor` | Start the local Switchboard (`ph reactor --dev`, port 4001) |
| `pnpm connect` | Start Connect studio (`ph connect`, port 3000) |
| `pnpm create-drive [name]` | Create a `powerhouse/reactor-drive` drive, set its editor, print its id |
| `pnpm watch` | Start the standalone file-watcher (control API + sync) |
| `pnpm generate` | Re-run document-model / editor codegen |
| `pnpm tsc` | Type-check |
| `pnpm lint` / `pnpm format` | oxlint / oxfmt |
| `pnpm test` | vitest |

## Configuration (file-watcher)

The watcher reads bootstrap defaults from env, then is reconfigured at runtime by the editor
and persists to a local JSON file.

| Env var | Default | Purpose |
| --- | --- | --- |
| `WATCHER_PORT` | `4111` | Control-API port |
| `SWITCHBOARD_URL` | `http://localhost:4001` | Switchboard to sync against |
| `DRIVE_ID` | — | Drive to sync (set via the editor if omitted) |
| `WATCH_DIR` | — | Base directory to mirror (set via the editor if omitted) |
| `MAX_DOWNLOAD_SIZE` | `100MB` | Skip downloading files larger than this |
| `WATCHER_CONFIG` | `~/.ph-drive-watcher/config.json` | Where the persisted config lives |

### Watcher control API

`GET /health` · `GET /status` · `GET /config` · `PUT /config` · `POST /start` · `POST /stop`
· `GET /fs/list?path=` (host directory listing for the base-dir picker). CORS-enabled for the
Connect origin.

---

## Known limitations

- **Chrome-only**, by design (localhost editor ↔ watcher channel).
- **Requires the linked Connect checkout** for reactor-drive support (see above).
- Conflict handling is demo-grade: on a simultaneous edit of the same path on both sides,
  **the server wins** (the change is surfaced in the watcher status).
- Linking a different-version Connect checkout can produce a **type-only** `tsc` mismatch in
  the generated `processors/factory.ts` (two `@powerhousedao/shared` versions). It does not
  affect runtime; align the versions if you need a fully green `tsc`.
