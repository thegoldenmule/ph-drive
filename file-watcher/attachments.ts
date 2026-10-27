/**
 * Upload/download file bytes via the switchboard attachment service. Content is
 * sha256-addressed; refs look like `attachment://v1:<sha256hex>`.
 *
 * Remote reads are document-authorized: the switchboard only serves bytes to a
 * reader that names a document whose operations reference the attachment, so
 * every download carries the referencing ph-drive-file document id.
 */
import {
  AttachmentAlreadyExists,
  createRemoteAttachmentService,
  type IAttachmentService,
} from "@powerhousedao/reactor-attachments";
import type { AttachmentRef } from "@powerhousedao/reactor";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * reserve() rejects with AttachmentAlreadyExists when the hash is already
 * stored (hash-first dedup). Match by name too, in case a second copy of the
 * package is loaded and `instanceof` fails across module instances.
 */
function isAlreadyExists(err: unknown): err is AttachmentAlreadyExists {
  if (err instanceof AttachmentAlreadyExists) return true;
  return (
    err instanceof Error &&
    err.name === "AttachmentAlreadyExists" &&
    typeof (err as Partial<AttachmentAlreadyExists>).ref === "string"
  );
}

export class Attachments {
  private readonly svc: IAttachmentService;

  constructor(switchboardUrl: string, svc?: IAttachmentService) {
    this.svc =
      svc ??
      createRemoteAttachmentService({
        remoteUrl: switchboardUrl.replace(/\/+$/, ""),
      });
  }

  /** Upload bytes, deduping by content hash (the server answers 409 when it already has them). */
  async upload(
    bytes: Uint8Array,
    fileName: string,
    mimeType: string,
  ): Promise<{ ref: AttachmentRef; hash: string; size: number }> {
    const hash = sha256Hex(bytes);
    const size = bytes.byteLength;
    let handle;
    try {
      handle = await this.svc.reserve({
        mimeType,
        fileName,
        clientHash: hash,
        sizeBytes: size,
      });
    } catch (err) {
      if (isAlreadyExists(err)) return { ref: err.ref, hash, size };
      throw err;
    }
    const stream = Readable.toWeb(
      Readable.from(Buffer.from(bytes)),
    ) as ReadableStream<Uint8Array>;
    const result = await handle.send(stream);
    return { ref: result.ref, hash: result.hash, size };
  }

  /** Download bytes; `documentId` is the ph-drive-file document that references `ref`. */
  async download(ref: AttachmentRef, documentId: string): Promise<Uint8Array> {
    const resp = await this.svc.get(ref, { documentId });
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  }
}
