import { describe, expect, it, vi } from "vitest";

import { cleanText, detectLayers, pickLabel, processDxfFile } from "@/server/dxf/processor";

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

  it("prefers multi-word room names over short codes", () => {
    expect(pickLabel(["L1-ZONE", "LIVING ROOM"])).toBe("LIVING ROOM");
  });

  it("falls back to first candidate if all are numeric", () => {
    // Both score -100; stable sort keeps original order
    expect(pickLabel(["42", "99"])).toBe("42");
  });

  it("picks highest-scored candidate from mixed list", () => {
    expect(pickLabel(["3.5", "DS", "MASTER BEDROOM", "LOUNGE"])).toBe("MASTER BEDROOM");
  });

  it("prefers room name over alphanumeric code (e.g. AZ451)", () => {
    // AZ451 is a Revit sheet reference — should score lower than a real room name
    expect(pickLabel(["AZ451", "BEDROOM"])).toBe("BEDROOM");
  });

  it("prefers descriptive name over short code", () => {
    expect(pickLabel(["R306", "FIRE LOBBY"])).toBe("FIRE LOBBY");
  });
});

// ── detectLayers ──────────────────────────────────────────────────────────────

describe("detectLayers", () => {
  it("detects boundary and text layers by pattern", () => {
    const layers = ["Boundary Layer", "A-AREA-IDEN", "A-ANNO-SYMB", "0", "Defpoints"];
    const result = detectLayers(layers);
    expect(result.boundary).toContain("Boundary Layer");
    expect(result.text).toContain("A-AREA-IDEN");
    // Annotation layer should NOT be in text layers
    expect(result.text).not.toContain("A-ANNO-SYMB");
  });

  it("falls back to all non-annotation layers when no text pattern matches", () => {
    const layers = ["Boundary Layer", "Custom Layer", "A-ANNO-SYMB"];
    const result = detectLayers(layers);
    expect(result.boundary).toContain("Boundary Layer");
    // "Custom Layer" should be included (not annotation), "A-ANNO-SYMB" excluded
    expect(result.text).toContain("Custom Layer");
    expect(result.text).not.toContain("A-ANNO-SYMB");
  });

  it("returns all layers when no patterns match at all", () => {
    const layers = ["Layer1", "Layer2"];
    const result = detectLayers(layers);
    // No boundary pattern matched → empty (all layers accepted for polylines)
    expect(result.boundary).toHaveLength(0);
    // No text or annotation pattern matched → all layers used for text
    expect(result.text).toEqual(["Layer1", "Layer2"]);
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
function buildMockDxf(
  entities: object[],
  header: Record<string, unknown> = {},
  layers?: Record<string, unknown>,
) {
  return JSON.stringify({
    entities,
    header,
    ...(layers ? { tables: { layer: { layers } } } : {}),
  });
}

/** A rectangle LWPOLYLINE with the given vertex coordinates and optional layer. */
function polylineEntity(verts: { x: number; y: number }[], layer?: string): object {
  return { type: "LWPOLYLINE", vertices: verts, ...(layer ? { layer } : {}) };
}

/** A legacy POLYLINE entity with the given vertex coordinates and optional layer. */
function legacyPolylineEntity(verts: { x: number; y: number }[], layer?: string): object {
  return { type: "POLYLINE", vertices: verts, ...(layer ? { layer } : {}) };
}

/** A TEXT entity at the given position with optional layer. */
function textEntity(text: string, x: number, y: number, layer?: string): object {
  return { type: "TEXT", text, position: { x, y }, ...(layer ? { layer } : {}) };
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

  it("includes allLabels array on each extracted room", async () => {
    const dxf = buildMockDxf([
      polylineEntity(ROOM_VERTS),
      textEntity("BEDROOM", 2, 1.5),
      textEntity("12.5", 2, 2),
    ]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms[0].allLabels).toEqual(expect.arrayContaining(["BEDROOM", "12.5"]));
    // Best label should still be BEDROOM (not the numeric one)
    expect(result.rawRooms[0].name).toBe("BEDROOM");
  });

  it("returns layersUsed in result", async () => {
    const layers = { "Boundary Layer": {}, "A-AREA-IDEN": {} };
    const dxf = buildMockDxf(
      [polylineEntity(ROOM_VERTS, "Boundary Layer"), textEntity("BEDROOM", 2, 1.5, "A-AREA-IDEN")],
      {},
      layers,
    );
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.layersUsed).toBeDefined();
    expect(result.layersUsed.boundary).toContain("Boundary Layer");
    expect(result.layersUsed.text).toContain("A-AREA-IDEN");
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

  it("assigns fallback 'ROOM' label when text is far outside all polygons", async () => {
    const dxf = buildMockDxf([
      polylineEntity(ROOM_VERTS),
      textEntity("FARAWAY", 2000, 2000), // > 500 DXF units from polygon — beyond tolerance
    ]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms[0].name).toBe("ROOM");
  });

  it("processes legacy POLYLINE entities alongside LWPOLYLINE", async () => {
    // Both LWPOLYLINE and POLYLINE should produce rooms
    const room2Verts = [
      { x: 10, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 3 },
      { x: 10, y: 3 },
    ];
    const dxf = buildMockDxf([
      polylineEntity(ROOM_VERTS),
      legacyPolylineEntity(room2Verts),
      textEntity("BEDROOM", 2, 1.5),
      textEntity("KITCHEN", 12, 1.5),
    ]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms).toHaveLength(2);
  });

  it("skips POLYLINE entities with shape flag (3D meshes)", async () => {
    const meshEntity = { type: "POLYLINE", vertices: ROOM_VERTS, shape: true };
    const dxf = buildMockDxf([
      polylineEntity(ROOM_VERTS),
      meshEntity,
      textEntity("BEDROOM", 2, 1.5),
    ]);
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms).toHaveLength(1); // mesh should be skipped
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

  it("filters text by layer when annotation layer is detected", async () => {
    const layers = { "Boundary Layer": {}, "A-AREA-IDEN": {}, "A-ANNO-SYMB": {} };
    const dxf = buildMockDxf(
      [
        polylineEntity(ROOM_VERTS, "Boundary Layer"),
        textEntity("BEDROOM", 2, 1.5, "A-AREA-IDEN"),
        textEntity("AZ451", 2, 2, "A-ANNO-SYMB"), // annotation — should be filtered
      ],
      {},
      layers,
    );
    const result = await processDxfFile(dxf);
    expect(result.success).toBe(true);
    expect(result.rawRooms[0].name).toBe("BEDROOM");
    // AZ451 should NOT appear in allLabels since its layer is blacklisted
    expect(result.rawRooms[0].allLabels).not.toContain("AZ451");
  });
});
