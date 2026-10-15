import { describe, expect, it } from "vitest";
import { classifyMediaUploadError } from "@/lib/media/upload-errors";

describe("classifyMediaUploadError", () => {
  it("maps suspended blob store", () => {
    const err = Object.assign(new Error("Vercel Blob: This store has been suspended."), {
      name: "BlobStoreSuspendedError",
    });
    expect(classifyMediaUploadError(err)).toEqual({
      code: "blob_suspended",
      status: 503,
      retryable: false,
    });
  });

  it("maps rate limits as retryable", () => {
    const err = Object.assign(new Error("rate limited"), {
      name: "BlobServiceRateLimited",
    });
    expect(classifyMediaUploadError(err).retryable).toBe(true);
    expect(classifyMediaUploadError(err).status).toBe(429);
  });

  it("keeps validation codes", () => {
    expect(classifyMediaUploadError(new Error("file_too_large")).code).toBe(
      "file_too_large",
    );
  });
});
