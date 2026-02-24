/**
 * server/services/factors-calculator.ts
 *
 * Implements Steps 5–6 of the Saudi Code business flow:
 *   Step 5 — Apply demand and coincident factors per room
 *   Step 6 — Compute final building-level load totals with category breakdown
 *
 * Separated from the API route for testability and single-responsibility.
 */
import { round2 } from "@/lib/utils";
import type { CategoryBreakdown } from "@/shared/types/dxf";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoomLoadInput {
  connectedLoad: number; // VA
  demandFactor: number; // 0–1
  coincidentFactor: number; // 0–1
  customerCategory: string; // e.g. "C1"
  roomType: string; // e.g. "Bedroom"
}

interface RoomLoadResult {
  connectedLoad: number; // VA
  demandFactor: number;
  coincidentFactor: number;
  /** connectedLoad × demandFactor × coincidentFactor */
  demandLoad: number; // VA
}

interface BuildingLoadSummary {
  totalConnectedLoad: number; // VA
  totalDemandLoad: number; // VA
  totalDemandLoadKVA: number;
  /** totalDemandLoad / totalConnectedLoad (0 if no connected load) */
  effectiveDemandFactor: number;
  categoryBreakdown: CategoryBreakdown[];
}

// ── Category descriptions ────────────────────────────────────────────────────

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  C1: "Normal Residential Dwelling",
  C2: "Normal Commercial Shops",
  C3: "Hotel / Motel",
  C4: "Hospital",
  C5: "School",
  C6: "University",
  C7: "Mosque",
  C8: "Office Building",
  C9: "Government Building",
  C10: "Restaurant",
  C11: "Bakery",
  C12: "Supermarket",
  C13: "Workshop",
  C14: "Petrol Station",
  C15: "Car Showroom",
  C16: "Wedding Hall",
  C17: "Sports Facility",
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute demand load for a single room.
 *
 * demand load = connected load × demand factor × coincident factor
 */
export function computeRoomDemandLoad(input: RoomLoadInput): RoomLoadResult {
  const demandLoad = round2(input.connectedLoad * input.demandFactor * input.coincidentFactor);
  return {
    connectedLoad: input.connectedLoad,
    demandFactor: input.demandFactor,
    coincidentFactor: input.coincidentFactor,
    demandLoad,
  };
}

/**
 * Compute building-level totals and per-category breakdown from all room loads.
 *
 * Step 5: Per-room demand load = connectedLoad × demandFactor × coincidentFactor
 * Step 6: Building totals = Σ of all room demand loads, grouped by category
 */
export function computeBuildingSummary(rooms: RoomLoadInput[]): BuildingLoadSummary {
  let totalConnectedLoad = 0;
  let totalDemandLoad = 0;

  // Group by customer category
  const categoryMap = new Map<
    string,
    {
      connectedLoad: number;
      demandLoad: number;
      roomCount: number;
      demandFactorSum: number;
      coincidentFactorSum: number;
    }
  >();

  for (const room of rooms) {
    const result = computeRoomDemandLoad(room);
    totalConnectedLoad += result.connectedLoad;
    totalDemandLoad += result.demandLoad;

    const existing = categoryMap.get(room.customerCategory);
    if (existing) {
      existing.connectedLoad += result.connectedLoad;
      existing.demandLoad += result.demandLoad;
      existing.roomCount += 1;
      existing.demandFactorSum += room.demandFactor;
      existing.coincidentFactorSum += room.coincidentFactor;
    } else {
      categoryMap.set(room.customerCategory, {
        connectedLoad: result.connectedLoad,
        demandLoad: result.demandLoad,
        roomCount: 1,
        demandFactorSum: room.demandFactor,
        coincidentFactorSum: room.coincidentFactor,
      });
    }
  }

  const categoryBreakdown: CategoryBreakdown[] = Array.from(categoryMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, data]) => ({
      category,
      description: CATEGORY_DESCRIPTIONS[category] ?? category,
      roomCount: data.roomCount,
      connectedLoad: round2(data.connectedLoad),
      demandFactor: round2(data.demandFactorSum / data.roomCount),
      coincidentFactor: round2(data.coincidentFactorSum / data.roomCount),
      demandLoad: round2(data.demandLoad),
    }));

  return {
    totalConnectedLoad: round2(totalConnectedLoad),
    totalDemandLoad: round2(totalDemandLoad),
    totalDemandLoadKVA: round2(totalDemandLoad / 1000),
    effectiveDemandFactor:
      totalConnectedLoad > 0 ? round2(totalDemandLoad / totalConnectedLoad) : 0,
    categoryBreakdown,
  };
}
