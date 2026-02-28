import { describe, expect, it } from "vitest";

import type { DxfGeometryResult } from "@/server/dxf/processor";
import { aggregateRooms } from "@/server/pipeline/room-aggregator";

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

describe("aggregateRooms", () => {
  it("produces one unique input per distinct label", () => {
    const geo = makeGeometry([
      { name: "Bedroom", area: 15 },
      { name: "Kitchen", area: 12 },
    ]);
    const { uniqueRoomInputs } = aggregateRooms(geo);
    expect(uniqueRoomInputs).toHaveLength(2);
  });

  it("accumulates totalAreaForType for duplicate labels", () => {
    const geo = makeGeometry([
      { name: "Bedroom", area: 15 },
      { name: "Bedroom", area: 12 },
    ]);
    const { uniqueRoomInputs, roomAggregates } = aggregateRooms(geo);
    expect(uniqueRoomInputs).toHaveLength(1);
    expect(roomAggregates.get("BEDROOM")?.totalAreaForType).toBe(27);
    expect(roomAggregates.get("BEDROOM")?.roomCount).toBe(2);
  });

  it("resolves straight-quote ditto mark to the preceding label", () => {
    const geo = makeGeometry([
      { name: "Bedroom", area: 15 },
      { name: '"', area: 12 },
    ]);
    const { resolvedLabels } = aggregateRooms(geo);
    expect(resolvedLabels[1]).toBe("Bedroom");
  });

  it("resolves curly-quote ditto mark to the preceding label", () => {
    const geo = makeGeometry([
      { name: "Kitchen", area: 10 },
      { name: "\u201C", area: 9 },
    ]);
    const { resolvedLabels } = aggregateRooms(geo);
    expect(resolvedLabels[1]).toBe("Kitchen");
  });

  it("chains multiple consecutive ditto marks to the same source", () => {
    const geo = makeGeometry([
      { name: "Lounge", area: 20 },
      { name: '"', area: 18 },
      { name: '"', area: 17 },
    ]);
    const { resolvedLabels, uniqueRoomInputs } = aggregateRooms(geo);
    expect(resolvedLabels[1]).toBe("Lounge");
    expect(resolvedLabels[2]).toBe("Lounge");
    expect(uniqueRoomInputs).toHaveLength(1);
  });

  it("leaves a ditto mark unchanged when there is no preceding label", () => {
    const geo = makeGeometry([{ name: '"', area: 15 }]);
    const { resolvedLabels } = aggregateRooms(geo);
    expect(resolvedLabels[0]).toBe('"');
  });

  it("normalises labels case-insensitively for aggregation", () => {
    const geo = makeGeometry([
      { name: "bedroom", area: 12 },
      { name: "BEDROOM", area: 14 },
    ]);
    const { uniqueRoomInputs } = aggregateRooms(geo);
    expect(uniqueRoomInputs).toHaveLength(1);
    expect(uniqueRoomInputs[0].totalAreaForType).toBe(26);
  });
});
