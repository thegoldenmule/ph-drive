import type { AttachmentRef } from "@powerhousedao/reactor";
import {
  AttachmentAlreadyExists,
  createRef,
  type AttachmentResponse,
  type IAttachmentService,
  type IAttachmentUpload,
} from "@powerhousedao/reactor-attachments";
import { describe, expect, it, vi } from "vitest";
import { Attachments, sha256Hex } from "./attachments.js";

const bytes = new TextEncoder().encode("hello world");
const hash = sha256Hex(bytes);
const ref = createRef(hash);

function fakeService(
  overrides: Partial<IAttachmentService>,
): IAttachmentService {
  return {
    reserve: vi.fn(() => Promise.reject(new Error("unexpected reserve"))),
    stat: vi.fn(() => Promise.reject(new Error("unexpected stat"))),
    get: vi.fn(() => Promise.reject(new Error("unexpected get"))),
    getDownloadTarget: vi.fn(() =>
      Promise.reject(new Error("unexpected target")),
    ),
    ...overrides,
  };
}

describe("Attachments.upload", () => {
  it("returns the server ref without uploading when reserve reports AttachmentAlreadyExists", async () => {
    const reserve = vi.fn(() =>
      Promise.reject(new AttachmentAlreadyExists(hash, ref)),
    );
    const stat = vi.fn(() => Promise.reject(new Error("unexpected stat")));
    const att = new Attachments("http://sb", fakeService({ reserve, stat }));

    const out = await att.upload(bytes, "a.txt", "text/plain");

    expect(out).toEqual({ ref, hash, size: bytes.byteLength });
    expect(reserve).toHaveBeenCalledWith({
      mimeType: "text/plain",
      fileName: "a.txt",
      clientHash: hash,
      sizeBytes: bytes.byteLength,
    });
    expect(stat).not.toHaveBeenCalled();
  });

  it("sends the bytes when the hash is new", async () => {
    const send = vi.fn(() =>
      Promise.resolve({ hash, ref, header: {} as never }),
    );
    const handle = { send } as unknown as IAttachmentUpload;
    const att = new Attachments(
      "http://sb",
      fakeService({ reserve: vi.fn(() => Promise.resolve(handle)) }),
    );

    const out = await att.upload(bytes, "a.txt", "text/plain");

    expect(send).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ref, hash, size: bytes.byteLength });
  });

  it("rethrows other reserve failures", async () => {
    const att = new Attachments(
      "http://sb",
      fakeService({ reserve: vi.fn(() => Promise.reject(new Error("boom"))) }),
    );
    await expect(att.upload(bytes, "a.txt", "text/plain")).rejects.toThrow(
      "boom",
    );
  });
});

describe("Attachments.download", () => {
  it("passes the referencing documentId to get()", async () => {
    const get = vi.fn(
      (_ref: AttachmentRef, _opts?: unknown): Promise<AttachmentResponse> =>
        Promise.resolve({
          body: new Response(bytes).body!,
        } as AttachmentResponse),
    );
    const att = new Attachments("http://sb", fakeService({ get }));

    const out = await att.download(ref, "doc-123");

    expect(get).toHaveBeenCalledWith(ref, { documentId: "doc-123" });
    expect(new TextDecoder().decode(out)).toBe("hello world");
  });
});
