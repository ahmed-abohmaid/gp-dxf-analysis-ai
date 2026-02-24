import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from "@/shared/constants";

export function validateDxfFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".dxf")) return "Only .dxf files are accepted.";
  if (file.size === 0) return "File appears to be empty.";
  if (file.size > MAX_UPLOAD_SIZE_BYTES)
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_UPLOAD_SIZE_MB} MB.`;
  return null;
}
