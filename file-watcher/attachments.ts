/** Upload/download file bytes via the switchboard attachment service. Content is sha256-addressed; refs look like `attachment://v1:<sha256hex>`. */
import { createRemoteAttachmentService } from "@powerhousedao/reactor-attachments";
import type { AttachmentRef } from "@powerhousedao/reactor";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function refForHash(hash: string): AttachmentRef {
  return `attachment://v1:${hash}` as AttachmentRef;
}

export function hashFromRef(ref: string): string | null {
  const m = /^attachment:\/\/v\d+:(.+)$/.exec(ref);
  return m ? m[1] : null;
}

export class Attachments {
  private readonly svc: ReturnType<typeof createRemoteAttachmentService>;

  constructor(switchboardUrl: string) {
    this.svc = createRemoteAttachmentService({
      remoteUrl: switchboardUrl.replace(/\/+$/, ""),
    });
  }

  async exists(ref: string): Promise<boolean> {
    try {
      await this.svc.stat(ref as AttachmentRef);
      return true;
    } catch {
      return false;
    }
  }

  /** Upload bytes, deduping by content hash. */
  async upload(
    bytes: Uint8Array,
    fileName: string,
    mimeType: string,
  ): Promise<{ ref: AttachmentRef; hash: string; size: number }> {
    const hash = sha256Hex(bytes);
    const ref = refForHash(hash);
    const size = bytes.byteLength;
    if (await this.exists(ref)) {
      return { ref, hash, size };
    }
    const handle = await this.svc.reserve({
      mimeType,
      fileName,
      clientHash: hash,
      sizeBytes: size,
    });
    const stream = Readable.toWeb(
      Readable.from(Buffer.from(bytes)),
    ) as ReadableStream<Uint8Array>;
    const result = await handle.send(stream);
    return { ref: result.ref, hash: result.hash, size };
  }

  async download(ref: string): Promise<Uint8Array> {
    const resp = await this.svc.get(ref as AttachmentRef);
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
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
