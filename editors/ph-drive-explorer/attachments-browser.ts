import { type AttachmentRef, isAttachmentRef } from "../../lib/drive-client.js";
import { isRecord } from "../../lib/unknown.js";

// Matches the watcher's node-side sha256 so the same bytes resolve to the same attachment ref.
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json();
  return isRecord(body) ? body : {};
}

function requireString(
  body: Record<string, unknown>,
  key: string,
  step: string,
): string {
  const v = body[key];
  if (typeof v !== "string")
    throw new Error(`${step}: response missing "${key}"`);
  return v;
}

function requireRef(
  body: Record<string, unknown>,
  step: string,
): AttachmentRef {
  const v = requireString(body, "ref", step);
  if (!isAttachmentRef(v))
    throw new Error(`${step}: "ref" is not an attachment ref: ${v}`);
  return v;
}

export type UploadedAttachment = {
  ref: AttachmentRef;
  hash: string;
  size: number;
  mimeType: string;
};

export async function uploadAttachment(
  switchboardUrl: string,
  file: File,
): Promise<UploadedAttachment> {
  const base = switchboardUrl.replace(/\/+$/, "");
  const buf = await file.arrayBuffer();
  const hash = await sha256Hex(buf);
  const size = buf.byteLength;
  const mimeType = file.type || "application/octet-stream";

  const reserve = await fetch(`${base}/attachments/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mimeType,
      fileName: file.name,
      clientHash: hash,
      sizeBytes: size,
    }),
  });

  if (reserve.status === 409) {
    // 409 = already stored; dedup, nothing to upload
    const ref = requireRef(await readJson(reserve), "reserve (409)");
    return { ref, hash, size, mimeType };
  }
  if (reserve.status !== 201) {
    throw new Error(
      `reserve failed: ${reserve.status} ${await reserve.text()}`,
    );
  }
  const reserved = await readJson(reserve);
  const reservationId = requireString(reserved, "reservationId", "reserve");
  const ref = requireRef(reserved, "reserve");

  const put = await fetch(`${base}/attachments/reservations/${reservationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
  if (!put.ok) {
    throw new Error(`upload failed: ${put.status} ${await put.text()}`);
  }
  const result = await readJson(put);
  return {
    ref: isAttachmentRef(result.ref) ? result.ref : ref,
    hash: typeof result.hash === "string" ? result.hash : hash,
    size,
    mimeType,
  };
}
