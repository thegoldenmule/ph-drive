/**
 * Local HTTP control plane the Connect editor uses to configure machine-local
 * settings (CORS-enabled JSON, localhost only):
 *   GET  /health
 *   GET  /status            -> syncStatus
 *   GET  /config            -> WatcherConfig
 *   PUT  /config  {patch}   -> WatcherConfig (persists + restarts sync)
 *   POST /start | /stop     -> { ok }
 *   GET  /fs/list?path=...  -> host fs picker
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WatcherManager } from "./index.js";

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function listDir(p: string): { path: string; parent: string; entries: { name: string; isDir: boolean }[] } {
  const target = p && p.length ? path.resolve(p) : os.homedir();
  const dirents = fs.readdirSync(target, { withFileTypes: true });
  const entries = dirents
    .filter((d) => !d.name.startsWith("."))
    .map((d) => ({ name: d.name, isDir: d.isDirectory() }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return { path: target, parent: path.dirname(target), entries };
}

export function startControlServer(manager: WatcherManager, port: number): void {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        send(res, 204, {});
        return;
      }
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const route = `${req.method} ${url.pathname}`;

      switch (route) {
        case "GET /health":
          return send(res, 200, { ok: true, service: "ph-drive-watcher" });

        case "GET /status":
          return send(res, 200, manager.getStatus());

        case "GET /config":
          return send(res, 200, manager.getConfig());

        case "PUT /config": {
          const patch = await readBody(req);
          const cfg = await manager.setConfig(patch);
          return send(res, 200, cfg);
        }

        case "POST /start": {
          const cfg = await manager.start();
          return send(res, 200, { ok: true, config: cfg });
        }

        case "POST /stop": {
          const cfg = await manager.stop();
          return send(res, 200, { ok: true, config: cfg });
        }

        case "GET /fs/list": {
          try {
            return send(res, 200, listDir(url.searchParams.get("path") ?? ""));
          } catch (err: any) {
            return send(res, 400, { error: err?.message ?? "cannot list directory" });
          }
        }

        default:
          return send(res, 404, { error: `no route ${route}` });
      }
    } catch (err: any) {
      send(res, 500, { error: err?.message ?? String(err) });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[watcher] control API on http://localhost:${port}`);
  });
}
