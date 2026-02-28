import { describe, expect, it } from "vitest";

import { validateDxfFile } from "@/features/upload/utils/validateDxfFile";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from "@/shared/constants";

function makeFile(name: string, size: number, type = "application/octet-stream"): File {
  // Fill with `size` zero bytes
  const buffer = new Uint8Array(size);
  return new File([buffer], name, { type });
}

describe("validateDxfFile", () => {
  it("returns null for a valid .dxf file", () => {
    const file = makeFile("floor-plan.dxf", 1024);
    expect(validateDxfFile(file)).toBeNull();
  });

  it("rejects files with wrong extension (.pdf)", () => {
    const file = makeFile("drawing.pdf", 1024);
    expect(validateDxfFile(file)).toMatch(/Only .dxf files/i);
  });

  it("rejects files with wrong extension (.txt)", () => {
    const file = makeFile("notes.txt", 512);
    expect(validateDxfFile(file)).toMatch(/Only .dxf files/i);
  });

  it("rejects files with no extension", () => {
    const file = makeFile("drawing", 512);
    expect(validateDxfFile(file)).toMatch(/Only .dxf files/i);
  });

  it("accepts .DXF uppercase extension", () => {
    const file = makeFile("PLAN.DXF", 1024);
    expect(validateDxfFile(file)).toBeNull();
  });

  it("rejects empty files (0 bytes)", () => {
    const file = makeFile("empty.dxf", 0);
    expect(validateDxfFile(file)).toMatch(/empty/i);
  });

  it("rejects files over the size limit", () => {
    const file = makeFile("huge.dxf", MAX_UPLOAD_SIZE_BYTES + 1);
    const result = validateDxfFile(file);
    expect(result).toMatch(/too large/i);
    expect(result).toContain(`${MAX_UPLOAD_SIZE_MB} MB`);
  });

  it("accepts a file exactly at the size limit", () => {
    const file = makeFile("exact.dxf", MAX_UPLOAD_SIZE_BYTES);
    expect(validateDxfFile(file)).toBeNull();
  });
});
