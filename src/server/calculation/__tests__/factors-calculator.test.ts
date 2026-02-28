import { describe, expect, it } from "vitest";

import {
  computeBuildingSummary,
  computeRoomDemandLoad,
  type RoomLoadInput,
} from "@/server/calculation/factors-calculator";

// Fields added in Phase 2; irrelevant to the demand-load math being tested here
const X: Pick<
  RoomLoadInput,
  "loadDensityVAm2" | "loadsIncluded" | "acIncluded" | "categoryDescription"
> = {
  loadDensityVAm2: 100,
  loadsIncluded: "Lights + Power Sockets",
  acIncluded: null,
  categoryDescription: "Normal Residential Dwelling",
};

// ── computeRoomDemandLoad ──────────────────────────────────────────────────────

describe("computeRoomDemandLoad", () => {
  it("computes demand load as connectedLoad × demandFactor × coincidentFactor", () => {
    const result = computeRoomDemandLoad({
      ...X,
      connectedLoad: 384,
      demandFactor: 0.6,
      coincidentFactor: 1.0,
      customerCategory: "C1",
      roomType: "Bedroom",
    });
    expect(result).toBe(230.4);
  });

  it("applies both demand and coincident factors", () => {
    const result = computeRoomDemandLoad({
      ...X,
      connectedLoad: 1000,
      demandFactor: 0.8,
      coincidentFactor: 0.75,
      customerCategory: "C1",
      roomType: "Living Room",
    });
    // 1000 × 0.8 × 0.75 = 600
    expect(result).toBe(600);
  });

  it("returns connectedLoad unchanged when both factors are 1.0", () => {
    const result = computeRoomDemandLoad({
      ...X,
      connectedLoad: 500,
      demandFactor: 1.0,
      coincidentFactor: 1.0,
      customerCategory: "C2",
      roomType: "Shop",
    });
    expect(result).toBe(500);
  });

  it("returns 0 demand load when connected load is 0", () => {
    const result = computeRoomDemandLoad({
      ...X,
      connectedLoad: 0,
      demandFactor: 0.8,
      coincidentFactor: 0.9,
      customerCategory: "C1",
      roomType: "Bathroom",
    });
    expect(result).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    const result = computeRoomDemandLoad({
      ...X,
      connectedLoad: 100,
      demandFactor: 0.3,
      coincidentFactor: 0.7,
      customerCategory: "C1",
      roomType: "Bedroom",
    });
    // 100 × 0.3 × 0.7 = 21.0 (exact)
    expect(result).toBe(21);
  });
});

// ── computeBuildingSummary ────────────────────────────────────────────────────

describe("computeBuildingSummary", () => {
  it("returns zero totals and empty breakdown for empty room list", () => {
    const summary = computeBuildingSummary([]);
    expect(summary.totalConnectedLoad).toBe(0);
    expect(summary.totalDemandLoad).toBe(0);
    expect(summary.totalDemandLoadKVA).toBe(0);
    expect(summary.effectiveDemandFactor).toBe(0);
    expect(summary.categoryBreakdown).toHaveLength(0);
  });

  it("sums a single room correctly", () => {
    const rooms: RoomLoadInput[] = [
      {
        ...X,
        connectedLoad: 384,
        demandFactor: 0.6,
        coincidentFactor: 1.0,
        customerCategory: "C1",
        roomType: "Bedroom",
      },
    ];
    const summary = computeBuildingSummary(rooms);
    expect(summary.totalConnectedLoad).toBe(384);
    expect(summary.totalDemandLoad).toBe(230.4);
    expect(summary.totalDemandLoadKVA).toBe(0.23);
    expect(summary.effectiveDemandFactor).toBe(0.6);
    expect(summary.categoryBreakdown).toHaveLength(1);
    expect(summary.categoryBreakdown[0].category).toBe("C1");
    expect(summary.categoryBreakdown[0].description).toBe("Normal Residential Dwelling");
    expect(summary.categoryBreakdown[0].roomCount).toBe(1);
    expect(summary.categoryBreakdown[0].connectedLoad).toBe(384);
    expect(summary.categoryBreakdown[0].demandLoad).toBe(230.4);
  });

  it("groups multiple rooms in the same category", () => {
    const rooms: RoomLoadInput[] = [
      {
        ...X,
        connectedLoad: 300,
        demandFactor: 0.6,
        coincidentFactor: 1.0,
        customerCategory: "C1",
        roomType: "Bedroom",
      },
      {
        ...X,
        connectedLoad: 200,
        demandFactor: 0.6,
        coincidentFactor: 1.0,
        customerCategory: "C1",
        roomType: "Kitchen",
      },
    ];
    const summary = computeBuildingSummary(rooms);
    expect(summary.totalConnectedLoad).toBe(500);
    expect(summary.categoryBreakdown).toHaveLength(1);
    expect(summary.categoryBreakdown[0].roomCount).toBe(2);
    expect(summary.categoryBreakdown[0].connectedLoad).toBe(500);
  });

  it("produces separate category breakdown entries for different categories", () => {
    const rooms: RoomLoadInput[] = [
      {
        ...X,
        connectedLoad: 300,
        demandFactor: 0.6,
        coincidentFactor: 1.0,
        customerCategory: "C1",
        roomType: "Bedroom",
      },
      {
        ...X,
        connectedLoad: 500,
        demandFactor: 0.8,
        coincidentFactor: 1.0,
        customerCategory: "C2",
        roomType: "Shop",
      },
    ];
    const summary = computeBuildingSummary(rooms);
    expect(summary.totalConnectedLoad).toBe(800);
    // C1 demand: 300 × 0.6 = 180; C2 demand: 500 × 0.8 = 400; total = 580
    expect(summary.totalDemandLoad).toBe(580);
    expect(summary.categoryBreakdown).toHaveLength(2);
    // Breakdown is sorted alphabetically by category
    expect(summary.categoryBreakdown[0].category).toBe("C1");
    expect(summary.categoryBreakdown[1].category).toBe("C2");
  });

  it("computes effective demand factor as ratio of demand to connected load", () => {
    const rooms: RoomLoadInput[] = [
      {
        ...X,
        connectedLoad: 1000,
        demandFactor: 0.5,
        coincidentFactor: 1.0,
        customerCategory: "C1",
        roomType: "Bedroom",
      },
    ];
    const summary = computeBuildingSummary(rooms);
    // 500 / 1000 = 0.5
    expect(summary.effectiveDemandFactor).toBe(0.5);
  });

  it("sets effectiveDemandFactor to 0 when totalConnectedLoad is 0", () => {
    const rooms: RoomLoadInput[] = [
      {
        ...X,
        connectedLoad: 0,
        demandFactor: 0.6,
        coincidentFactor: 1.0,
        customerCategory: "C1",
        roomType: "Bedroom",
      },
    ];
    const summary = computeBuildingSummary(rooms);
    expect(summary.effectiveDemandFactor).toBe(0);
  });

  it("converts total to kVA correctly", () => {
    const rooms: RoomLoadInput[] = [
      {
        ...X,
        connectedLoad: 2000,
        demandFactor: 1.0,
        coincidentFactor: 1.0,
        customerCategory: "C1",
        roomType: "Bedroom",
      },
    ];
    const summary = computeBuildingSummary(rooms);
    expect(summary.totalDemandLoad).toBe(2000);
    expect(summary.totalDemandLoadKVA).toBe(2);
  });
});
