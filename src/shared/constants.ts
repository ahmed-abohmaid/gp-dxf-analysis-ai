// ── File upload limits ────────────────────────────────────────────────────────
// Single source of truth — used by both the API route (server) and the
// FileUpload component (client) so the two sides never silently diverge.

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_UPLOAD_SIZE_MB = 10;
