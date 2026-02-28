import { describe, expect, it } from "vitest";

import { validateDxfRequest } from "@/server/pipeline/dxf-validator";
import { MAX_UPLOAD_SIZE_BYTES } from "@/shared/constants";

function makeRequest(fields: Record<string, string | File>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/dxf", { method: "POST", body: formData });
}

function makeDxfFile(name = "plan.dxf", content = "VALID DXF CONTENT", sizeOverride?: number) {
  const blob =
    sizeOverride != null ? new Blob([new Uint8Array(sizeOverride)]) : new Blob([content]);
  return new File([blob], name, { type: "application/dxf" });
}

describe("validateDxfRequest", () => {
  it("returns content + options for a valid request", async () => {
    const req = makeRequest({ file: makeDxfFile(), electricalCode: "DPS-01", includeAC: "true" });
    const result = await validateDxfRequest(req);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.electricalCode).toBe("DPS-01");
      expect(result.includeAC).toBe(true);
      expect(result.content).toBe("VALID DXF CONTENT");
    }
  });

  it("returns error 400 when no file field is provided", async () => {
    const req = makeRequest({ electricalCode: "DPS-01" });
    const result = await validateDxfRequest(req);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });

  it("returns error 400 for non-.dxf extension", async () => {
    const req = makeRequest({ file: makeDxfFile("drawing.pdf") });
    const result = await validateDxfRequest(req);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(400);
  });

  it("returns error 400 for empty file", async () => {
    const empty = new File([], "empty.dxf");
    const req = makeRequest({ file: empty });
    const result = await validateDxfRequest(req);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(400);
  });

  it("returns error 400 when file exceeds size limit", async () => {
    const req = makeRequest({ file: makeDxfFile("big.dxf", "", MAX_UPLOAD_SIZE_BYTES + 1) });
    const result = await validateDxfRequest(req);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(400);
  });

  it("accepts a file exactly at the size limit", async () => {
    const req = makeRequest({ file: makeDxfFile("ok.dxf", "", MAX_UPLOAD_SIZE_BYTES) });
    const result = await validateDxfRequest(req);
    expect("error" in result).toBe(false);
  });

  it("returns error 400 for unsupported electricalCode", async () => {
    const req = makeRequest({ file: makeDxfFile(), electricalCode: "IEC-60364" });
    const result = await validateDxfRequest(req);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(400);
  });

  it("defaults include AC to true when not provided", async () => {
    const req = makeRequest({ file: makeDxfFile() });
    const result = await validateDxfRequest(req);
    if (!("error" in result)) {
      expect(result.includeAC).toBe(true);
    }
  });

  it("parses includeAC=false correctly", async () => {
    const req = makeRequest({ file: makeDxfFile(), includeAC: "false" });
    const result = await validateDxfRequest(req);
    if (!("error" in result)) {
      expect(result.includeAC).toBe(false);
    }
  });
});
