import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from "@/shared/constants";

/**
 * Pure validation for DXF file uploads.
 * Returns a human-readable error string, or null if the file is valid.
 */
export function validateDxfFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".dxf")) return "Only .dxf files are accepted.";
  if (file.size === 0) return "File appears to be empty.";
  if (file.size > MAX_UPLOAD_SIZE_BYTES)
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_UPLOAD_SIZE_MB} MB.`;
  return null;
}
