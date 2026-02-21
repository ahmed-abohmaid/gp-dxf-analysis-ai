import { beforeEach, describe, expect, it, vi } from "vitest";

import * as classifierModule from "@/server/ai/classifier";
import * as processorModule from "@/server/dxf/processor";
import * as ragModule from "@/server/rag/saudi-code-loader";
import { POST } from "@/server/services/dxf-load.post";
import { MAX_UPLOAD_SIZE_BYTES } from "@/shared/constants";

// Mock all external dependencies before importing the route
vi.mock("@/server/dxf/processor", () => ({
  processDxfFile: vi.fn(),
}));
vi.mock("@/server/rag/saudi-code-loader", () => ({
  searchSaudiCode: vi.fn(),
}));
vi.mock("@/server/ai/classifier", () => ({
  classifyRooms: vi.fn(),
}));

const mockProcessDxf = vi.mocked(processorModule.processDxfFile);
const mockSearchSaudiCode = vi.mocked(ragModule.searchSaudiCode);
const mockClassifyRooms = vi.mocked(classifierModule.classifyRooms);

const VALID_GEOMETRY = {
  success: true,
  rawRooms: [{ id: 1, name: "BEDROOM", area: 12 }],
  totalRooms: 1,
  unitsDetected: "Meters",
  timestamp: new Date().toISOString(),
};

const VALID_CLASSIFICATIONS = [
  {
    roomLabel: "BEDROOM",
    roomType: "Bedroom",
    // AI returns densities; server multiplies by room area
    lightingDensity: 22, // VA/m² — SBC 401 §2.2
    socketsDensity: 10, // VA/m² — SBC 401 §2.2
    codeReference: "SBC 401 §2.2",
  },
];

function makeFormData(fileName = "plan.dxf", content = "DXF_CONTENT"): FormData {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const file = new File([blob], fileName, { type: "application/octet-stream" });
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

/**
 * For the size-limit test: Request serialises FormData to multipart bytes so
 * req.formData() rebuilds a fresh File — losing any JS-level size override.
 * Instead we proxy the Request so formData() returns a controlled FormData
 * containing a proxied File whose size getter returns our value.
 */
function makeOversizeRequest(size: number): Request {
  const file = new File(["x"], "huge.dxf", { type: "application/octet-stream" });
  const proxyFile = new Proxy(file, {
    get(target, prop) {
      if (prop === "size") return size;
      const val = Reflect.get(target, prop, target);
      return typeof val === "function" ? val.bind(target) : val;
    },
  }) as File;
  const fd = new FormData();
  fd.append("file", proxyFile);
  const base = new Request("http://localhost/api/dxf", { method: "POST", body: new FormData() });
  return new Proxy(base, {
    get(target, prop) {
      if (prop === "formData") return async () => fd;
      const val = Reflect.get(target, prop, target);
      return typeof val === "function" ? val.bind(target) : val;
    },
  }) as Request;
}

function makeRequest(body: BodyInit, contentType?: string): Request {
  return new Request("http://localhost/api/dxf", {
    method: "POST",
    body,
    headers: contentType ? { "Content-Type": contentType } : undefined,
  });
}

describe("POST /api/dxf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchSaudiCode.mockResolvedValue([]);
    mockClassifyRooms.mockResolvedValue(VALID_CLASSIFICATIONS);
    mockProcessDxf.mockResolvedValue(VALID_GEOMETRY);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("returns 400 when no file field is included", async () => {
    const fd = new FormData();
    const req = makeRequest(fd);
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no file/i);
  });

  it("returns 400 when file is not .dxf", async () => {
    const fd = makeFormData("drawing.pdf");
    const req = makeRequest(fd);
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/\.dxf/i);
  });

  it("returns 400 when file is empty (0 bytes)", async () => {
    const fd = makeFormData("plan.dxf", "");
    const req = makeRequest(fd);
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/empty/i);
  });

  it("returns 400 when file exceeds size limit", async () => {
    const res = await POST(makeOversizeRequest(MAX_UPLOAD_SIZE_BYTES + 1));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exceeds/i);
  });

  it("returns 422 when DXF parser returns success:false", async () => {
    mockProcessDxf.mockResolvedValue({
      success: false,
      rawRooms: [],
      totalRooms: 0,
      unitsDetected: "Unknown",
      timestamp: "",
      error: "Invalid DXF structure",
    });
    const fd = makeFormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/invalid dxf/i);
  });

  it("returns 422 when no rooms are detected", async () => {
    mockProcessDxf.mockResolvedValue({
      success: true,
      rawRooms: [],
      totalRooms: 0,
      unitsDetected: "Meters",
      timestamp: "",
    });
    const fd = makeFormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/no rooms/i);
  });

  // ── AI fallback ────────────────────────────────────────────────────────────

  it("returns 200 with null loads and hasFailedRooms when AI returns empty classifications", async () => {
    mockClassifyRooms.mockResolvedValue([]);
    const fd = makeFormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0].lightingLoad).toBeNull();
    expect(body.rooms[0].socketsLoad).toBeNull();
    expect(body.rooms[0].totalLoad).toBeNull();
    expect(body.rooms[0].error).toMatch(/AI classification failed/i);
    expect(body.hasFailedRooms).toBe(true);
  });

  it("continues with empty RAG context when searchSaudiCode throws", async () => {
    mockSearchSaudiCode.mockRejectedValue(new Error("RAG not ready"));
    const fd = makeFormData();
    const res = await POST(makeRequest(fd));
    // RAG failure is silenced — AI still runs with empty context
    expect(res.status).toBe(200);
    expect(mockClassifyRooms).toHaveBeenCalledWith([{ name: "BEDROOM", area: 12 }], "");
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns 200 with correct loads on happy path", async () => {
    const fd = makeFormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0].name).toBe("BEDROOM");
    expect(body.rooms[0].type).toBe("Bedroom");
    // Server computes: lightingLoad = density × area = 22 × 12 = 264 VA
    //                  socketsLoad  = density × area = 10 × 12 = 120 VA
    //                  totalLoad    = 264 + 120 = 384 VA
    expect(body.rooms[0].lightingLoad).toBe(264);
    expect(body.rooms[0].socketsLoad).toBe(120);
    expect(body.rooms[0].totalLoad).toBe(384);
    expect(body.totalLoad).toBe(384);
    expect(body.totalLoadKVA).toBe(0.38);
    expect(body.hasFailedRooms).toBe(false);
    expect(body.timestamp).toBeTruthy();
  });

  it("computes distinct loads for duplicate room names with different areas", async () => {
    mockProcessDxf.mockResolvedValue({
      success: true,
      rawRooms: [
        { id: 1, name: "BEDROOM", area: 10 },
        { id: 2, name: "BEDROOM", area: 20 },
      ],
      totalRooms: 2,
      unitsDetected: "Meters",
      timestamp: new Date().toISOString(),
    });
    // AI returns the density once for the deduplicated "BEDROOM" label
    mockClassifyRooms.mockResolvedValue([
      {
        roomLabel: "BEDROOM",
        roomType: "Bedroom",
        lightingDensity: 22,
        socketsDensity: 10,
        codeReference: "SBC 401 §2.2",
      },
    ]);
    const res = await POST(makeRequest(makeFormData()));
    expect(res.status).toBe(200);
    const body = await res.json();
    // room 1: 22×10=220 lighting, 10×10=100 sockets, total=320
    expect(body.rooms[0].lightingLoad).toBe(220);
    expect(body.rooms[0].socketsLoad).toBe(100);
    expect(body.rooms[0].totalLoad).toBe(320);
    // room 2: 22×20=440 lighting, 10×20=200 sockets, total=640
    expect(body.rooms[1].lightingLoad).toBe(440);
    expect(body.rooms[1].socketsLoad).toBe(200);
    expect(body.rooms[1].totalLoad).toBe(640);
    expect(body.totalLoad).toBe(960);
  });

  it("resolves ditto-mark labels to the nearest preceding named room", async () => {
    mockProcessDxf.mockResolvedValue({
      success: true,
      rawRooms: [
        { id: 1, name: "BEDROOM", area: 12 },
        { id: 2, name: '"', area: 8 }, // ditto — should resolve to BEDROOM
      ],
      totalRooms: 2,
      unitsDetected: "Meters",
      timestamp: new Date().toISOString(),
    });
    mockClassifyRooms.mockResolvedValue([
      {
        roomLabel: "BEDROOM",
        roomType: "Bedroom",
        lightingDensity: 22,
        socketsDensity: 10,
        codeReference: "SBC 401 §2.2",
      },
    ]);
    const res = await POST(makeRequest(makeFormData()));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Both rooms should classify via the BEDROOM density
    expect(body.rooms[1].type).toBe("Bedroom");
    // Original DXF label is preserved for display
    expect(body.rooms[1].name).toBe('"');
    // Load computed with ditto room's own area (8 m²)
    expect(body.rooms[1].lightingLoad).toBe(176); // 22 × 8
    expect(body.rooms[1].socketsLoad).toBe(80); // 10 × 8
    expect(body.rooms[1].totalLoad).toBe(256);
  });
});
