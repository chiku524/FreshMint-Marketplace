/** Normalize media upload failures into stable API error codes. */

export function classifyMediaUploadError(error: unknown): {
  code: string;
  status: number;
  retryable: boolean;
} {
  const name = error && typeof error === "object" && "name" in error
    ? String((error as { name?: string }).name)
    : "";
  const msg = error instanceof Error ? error.message : String(error ?? "");

  if (
    name === "BlobStoreSuspendedError" ||
    /store has been suspended/i.test(msg)
  ) {
    return { code: "blob_suspended", status: 503, retryable: false };
  }
  if (name === "BlobStoreNotFoundError" || /store not found/i.test(msg)) {
    return { code: "blob_store_missing", status: 503, retryable: false };
  }
  if (name === "BlobServiceRateLimited" || /rate limit/i.test(msg)) {
    return { code: "upload_rate_limited", status: 429, retryable: true };
  }
  if (name === "BlobServiceNotAvailable") {
    return { code: "blob_unavailable", status: 503, retryable: true };
  }
  if (
    msg === "empty_file" ||
    msg === "file_too_large" ||
    msg === "unsupported_type"
  ) {
    return { code: msg, status: 400, retryable: false };
  }
  return {
    code: msg || "upload_failed",
    status: 400,
    retryable: false,
  };
}
