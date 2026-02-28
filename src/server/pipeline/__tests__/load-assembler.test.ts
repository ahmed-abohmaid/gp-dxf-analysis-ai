import { describe, expect, it } from "vitest";

import type { RoomAnalysis } from "@/server/ai/prompts/schemas";
import type { DxfGeometryResult } from "@/server/dxf/processor";
import { assembleLoads } from "@/server/pipeline/load-assembler";

function makeGeometry(rooms: Array<{ name: string; area: number }>): DxfGeometryResult {
  return {
    success: true,
    rawRooms: rooms.map((r, i) => ({ id: i + 1, name: r.name, area: r.area, allLabels: [r.name] })),
    totalRooms: rooms.length,
    unitsDetected: "Meters",
    layersUsed: { boundary: [], text: [] },
    timestamp: new Date().toISOString(),
  };
}

function makeAnalysis(overrides: Partial<RoomAnalysis> & { roomLabel: string }): RoomAnalysis {
  return {
    roomLabel: overrides.roomLabel,
    roomType: overrides.roomType ?? "Bedroom",
    customerCategory: overrides.customerCategory ?? "C1",
    categoryDescription: overrides.categoryDescription ?? "Normal Residential Dwelling",
    loadDensityVAm2: overrides.loadDensityVAm2 ?? 40,
    demandFactor: overrides.demandFactor ?? 0.6,
    loadsIncluded: overrides.loadsIncluded ?? "Lights + Power Sockets",
    acIncluded: overrides.acIncluded ?? false,
    codeReference: overrides.codeReference ?? "Table 8",
    classificationReason: overrides.classificationReason ?? "Standard residential room",
  };
}

describe("assembleLoads", () => {
  it("assembles connectedLoad and demandLoad correctly", () => {
    const geo = makeGeometry([{ name: "BEDROOM", area: 20 }]);
    const analysis = [
      makeAnalysis({ roomLabel: "BEDROOM", loadDensityVAm2: 40, demandFactor: 0.6 }),
    ];
    const { rooms } = assembleLoads(geo, analysis, ["BEDROOM"]);

    expect(rooms[0].connectedLoad).toBe(800); // 40 × 20
    expect(rooms[0].demandLoad).toBe(480); // 800 × 0.6
  });

  it("sets hasFailedRooms=false when all rooms have AI results", () => {
    const geo = makeGeometry([{ name: "BEDROOM", area: 15 }]);
    const analysis = [makeAnalysis({ roomLabel: "BEDROOM" })];
    const { hasFailedRooms } = assembleLoads(geo, analysis, ["BEDROOM"]);
    expect(hasFailedRooms).toBe(false);
  });

  it("sets hasFailedRooms=true when an AI result is missing", () => {
    const geo = makeGeometry([
      { name: "BEDROOM", area: 15 },
      { name: "MYSTERY ROOM", area: 10 },
    ]);
    // Only provide analysis for the first room
    const analysis = [makeAnalysis({ roomLabel: "BEDROOM" })];
    const { rooms, hasFailedRooms } = assembleLoads(geo, analysis, ["BEDROOM", "MYSTERY ROOM"]);
    expect(hasFailedRooms).toBe(true);
    expect(rooms[1].error).toBeDefined();
    expect(rooms[1].connectedLoad).toBeNull();
  });

  it("populates categoryDescription from AI result", () => {
    const geo = makeGeometry([{ name: "LOUNGE", area: 25 }]);
    const analysis = [makeAnalysis({ roomLabel: "LOUNGE", categoryDescription: "My Category" })];
    const { rooms } = assembleLoads(geo, analysis, ["LOUNGE"]);
    expect(rooms[0].categoryDescription).toBe("My Category");
  });

  it("builds roomLoadInputs for each successfully assembled room", () => {
    const geo = makeGeometry([
      { name: "A", area: 10 },
      { name: "B", area: 5 },
    ]);
    const analysis = [makeAnalysis({ roomLabel: "A" }), makeAnalysis({ roomLabel: "B" })];
    const { roomLoadInputs } = assembleLoads(geo, analysis, ["A", "B"]);
    expect(roomLoadInputs).toHaveLength(2);
  });

  it("excludes failed rooms from roomLoadInputs", () => {
    const geo = makeGeometry([
      { name: "A", area: 10 },
      { name: "B", area: 5 },
    ]);
    // Only provide analysis for A
    const analysis = [makeAnalysis({ roomLabel: "A" })];
    const { roomLoadInputs } = assembleLoads(geo, analysis, ["A", "B"]);
    expect(roomLoadInputs).toHaveLength(1);
  });

  it("uses case-insensitive label matching", () => {
    const geo = makeGeometry([{ name: "bedroom", area: 20 }]);
    const analysis = [makeAnalysis({ roomLabel: "BEDROOM" })];
    const { rooms, hasFailedRooms } = assembleLoads(geo, analysis, ["bedroom"]);
    expect(hasFailedRooms).toBe(false);
    expect(rooms[0].connectedLoad).not.toBeNull();
  });
});
