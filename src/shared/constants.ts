// Single source of truth — used by both the API route (server) and client components.

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_UPLOAD_SIZE_MB = 10;

/** Matches DPS-01 categories that use the Declared Load Method (C18–C29). */
export const DECLARED_LOAD_CATEGORIES_RE = /^C(1[89]|2\d)$/;

export const isC1orC2 = (cat: string): boolean => cat === "C1" || cat === "C2";
