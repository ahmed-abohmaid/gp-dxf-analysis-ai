import { beforeEach, describe, expect, it, vi } from "vitest";

import { cleanText, pickLabel, processDxfFile } from "@/server/dxf/processor";

// ── cleanText ──────────────────────────────────────────────────────────────────

describe("cleanText", () => {
  it("uppercases plain text", () => {
    expect(cleanText("bedroom")).toBe("BEDROOM");
  });

  it("strips \\P line-break codes", () => {
    expect(cleanText("Living\\PRoom")).toBe("LIVINGROOM");
  });

  it("strips DXF font format codes {\\fArial|b0|...}", () => {
    expect(cleanText("{\\fArial|b0|i0|c0|p34;Kitchen}")).toBe("KITCHEN");
  });

  it("strips curly braces", () => {
    expect(cleanText("{Bedroom}")).toBe("BEDROOM");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanText("  Lounge  ")).toBe("LOUNGE");
  });

  it("returns empty string for empty input", () => {
    expect(cleanText("")).toBe("");
  });

  it("handles mixed Arabic + format codes", () => {
    // Arabic text should pass through after stripping format codes
    const result = cleanText("{\\fArial;غرفة}");
    expect(result).toBe("غرفة".toUpperCase());
  });
});

// ── pickLabel ─────────────────────────────────────────────────────────────────

describe("pickLabel", () => {
  it("returns 'ROOM' for empty candidates", () => {
    expect(pickLabel([])).toBe("ROOM");
  });

  it("returns the single candidate when only one exists", () => {
    expect(pickLabel(["BEDROOM"])).toBe("BEDROOM");
  });

  it("prefers non-numeric candidates over numeric ones", () => {
    expect(pickLabel(["12.5", "KITCHEN"])).toBe("KITCHEN");
  });

  it("skips pure numeric labels (integer)", () => {
    expect(pickLabel(["101", "BATHROOM"])).toBe("BATHROOM");
  });

  it("skips tag-formatted labels (L1-, DT, DS)", () => {
    expect(pickLabel(["L1-ZONE", "LIVING ROOM"])).toBe("LIVING ROOM");
  });

  it("falls back to first candidate if all are numeric/tags", () => {
    expect(pickLabel(["42", "99"])).toBe("42");
  });

  it("handles mixed list — returns first non-numeric non-tag", () => {
    expect(pickLabel(["3.5", "DS", "MASTER BEDROOM", "LOUNGE"])).toBe("MASTER BEDROOM");
  });
});

// ── processDxfFile — unit tests with mocked DxfParser ────────────────────────

vi.mock("dxf-parser", () => {
  return {
    default: class MockDxfParser {
      parseSync(content: string) {
        return JSON.parse(content);
      }
    },
  };
});

/** Builds a minimal parsed-DXF object as dxf-parser would return it. */
function buildMockDxf(entities: object[], header: Record<string, unknown> = {}) {
  return JSON.stringify({ entities, header });
}

/** A rectangle LWPOLYLINE with the given vertex coordinates. */
function polylineEntity(verts: { x: number; y: number }[]): object {
  return { type: "LWPOLYLINE", vertices: verts };
}

/** A TEXT entity at the given position. */
function textEntity(text: string, x: number, y: number): object {
  return { type: "TEXT", text, position: { x, y } };
}

// 4m × 3m room bounding box (vertices in m — processed as-is because avg area < MM_THRESHOLD)
const ROOM_VERTS = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

describe("processDxfFile", () => {
  it("returns success:false for invalid DXF content", async () => {
    const result = await processDxfFile("not valid json at all!!!");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns success:true and extracts a room", async () => {
    const dxf = buildMockDxf([polylineEntity(ROOM_VERTS), textEntity("BEDROOM", 2, 1.5)]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms).toHaveLength(1);
    expect(result.rawRooms[0].name).toBe("BEDROOM");
    expect(result.rawRooms[0].area).toBeCloseTo(12, 1);
  });

  it("filters polygons smaller than 0.2 m²", async () => {
    const tinyVerts = [
      { x: 0, y: 0 },
      { x: 0.2, y: 0 },
      { x: 0.2, y: 0.5 },
      { x: 0, y: 0.5 },
    ];
    const dxf = buildMockDxf([polylineEntity(tinyVerts)]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    // 0.2 × 0.5 = 0.1 m² — below threshold, should be filtered
    expect(result.rawRooms).toHaveLength(0);
  });

  it("detects millimeter units when average area is large", async () => {
    // 4000mm × 3000mm = 12,000,000 mm² > MM_THRESHOLD → should divide by 1e6
    const mmVerts = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const dxf = buildMockDxf([polylineEntity(mmVerts), textEntity("KITCHEN", 2000, 1500)]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.unitsDetected).toMatch(/millimeter/i);
    // Area after mm→m conversion should be ~12 m²
    expect(result.rawRooms[0]?.area).toBeCloseTo(12, 1);
  });

  it("respects $INSUNITS=4 header override for millimeters", async () => {
    // Even with small coordinates, $INSUNITS=4 forces mm conversion
    const smallVerts = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    const dxf = buildMockDxf([polylineEntity(smallVerts), textEntity("OFFICE", 2, 1.5)], {
      $INSUNITS: 4,
    });
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.unitsDetected).toMatch(/millimeter/i);
  });

  it("returns success:false when entities array is missing", async () => {
    const dxf = JSON.stringify({ header: {} }); // no entities
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(false);
  });

  it("assigns fallback 'ROOM' label when text is outside all polygons", async () => {
    const dxf = buildMockDxf([
      polylineEntity(ROOM_VERTS),
      textEntity("OUTSIDE", 100, 100), // far outside the polygon
    ]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms[0].name).toBe("ROOM");
  });

  it("ignores POLYLINE entities — only LWPOLYLINE is processed", async () => {
    // Same geometry as ROOM_VERTS but as a (legacy) POLYLINE entity.
    // It must NOT produce a room — preventing duplicates when CAD exports both types.
    const legacyPolyline = { type: "POLYLINE", vertices: ROOM_VERTS };
    const dxf = buildMockDxf([
      polylineEntity(ROOM_VERTS), // LWPOLYLINE — should produce one room
      legacyPolyline, // POLYLINE — must be ignored
      textEntity("BEDROOM", 2, 1.5),
    ]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms).toHaveLength(1); // not 2
    expect(result.rawRooms[0].name).toBe("BEDROOM");
  });

  it("extracts rooms from clockwise-wound polygons (positive area)", async () => {
    // CW winding = reversed vertex order.  Flatten.js would return negative area
    // without Math.abs() — these rooms would be silently filtered by the < 0.2 check.
    const cwVerts = [
      { x: 0, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 0 },
      { x: 0, y: 0 },
    ];
    const dxf = buildMockDxf([polylineEntity(cwVerts), textEntity("KITCHEN", 2, 1.5)]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms).toHaveLength(1);
    expect(result.rawRooms[0].area).toBeCloseTo(12, 1);
    expect(result.rawRooms[0].name).toBe("KITCHEN");
  });

  it("POLYLINE entities do not skew unit detection", async () => {
    // A POLYLINE junk entity with huge coordinates would push the sample average
    // above MM_THRESHOLD and flip the unit decision to millimetres.
    // Since POLYLINE is ignored, only the LWPOLYLINE metre-scale room is sampled.
    const polylineJunk = {
      type: "POLYLINE",
      vertices: [
        { x: 0, y: 0 },
        { x: 10_000, y: 0 },
        { x: 10_000, y: 10_000 },
        { x: 0, y: 10_000 },
      ],
    };
    const dxf = buildMockDxf([
      polylineEntity(ROOM_VERTS), // 12 m² LWPOLYLINE — metres
      polylineJunk, // huge POLYLINE — must be ignored
      textEntity("OFFICE", 2, 1.5),
    ]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.unitsDetected).toMatch(/meter/i); // NOT millimeters
    expect(result.rawRooms[0].area).toBeCloseTo(12, 1);
  });
});
