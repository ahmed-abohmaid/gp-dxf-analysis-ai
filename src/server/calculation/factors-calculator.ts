import { round2 } from "@/lib/utils";
import type { CategoryBreakdown } from "@/shared/types/dxf";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoomLoadInput {
  connectedLoad: number; // VA
  demandFactor: number; // 0–1
  coincidentFactor: number; // 0–1
  customerCategory: string; // e.g. "C1"
  categoryDescription: string; // AI-provided, e.g. "Normal Residential Dwelling"
  roomType: string; // e.g. "Bedroom"
  loadDensityVAm2: number;
  loadsIncluded: string;
  acIncluded: boolean | null;
}

interface BuildingLoadSummary {
  totalConnectedLoad: number; // VA
  totalDemandLoad: number; // VA
  totalDemandLoadKVA: number;
  /** totalDemandLoad / totalConnectedLoad (0 if no connected load) */
  effectiveDemandFactor: number;
  categoryBreakdown: CategoryBreakdown[];
}

// ── Public API ────────────────────────────────────────────────────────────────

export function computeRoomDemandLoad(input: RoomLoadInput): number {
  return round2(input.connectedLoad * input.demandFactor * input.coincidentFactor);
}

export function computeBuildingSummary(rooms: RoomLoadInput[]): BuildingLoadSummary {
  let totalConnectedLoad = 0;
  let totalDemandLoad = 0;

  const categoryMap = new Map<
    string,
    {
      description: string;
      connectedLoad: number;
      demandLoad: number;
      roomCount: number;
      demandFactorSum: number;
      coincidentFactorSum: number;
      loadDensityVAm2: number;
      loadsIncluded: string;
      acIncluded: boolean | null;
    }
  >();

  for (const room of rooms) {
    const demandLoad = computeRoomDemandLoad(room);
    totalConnectedLoad += room.connectedLoad;
    totalDemandLoad += demandLoad;

    const existing = categoryMap.get(room.customerCategory);
    if (existing) {
      existing.connectedLoad += room.connectedLoad;
      existing.demandLoad += demandLoad;
      existing.roomCount += 1;
      existing.demandFactorSum += room.demandFactor;
      existing.coincidentFactorSum += room.coincidentFactor;
    } else {
      categoryMap.set(room.customerCategory, {
        description: room.categoryDescription,
        connectedLoad: room.connectedLoad,
        demandLoad,
        roomCount: 1,
        demandFactorSum: room.demandFactor,
        coincidentFactorSum: room.coincidentFactor,
        loadDensityVAm2: room.loadDensityVAm2,
        loadsIncluded: room.loadsIncluded,
        acIncluded: room.acIncluded,
      });
    }
  }

  const categoryBreakdown: CategoryBreakdown[] = Array.from(categoryMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, data]) => ({
      category,
      description: data.description,
      roomCount: data.roomCount,
      connectedLoad: round2(data.connectedLoad),
      demandFactor: round2(data.demandFactorSum / data.roomCount),
      coincidentFactor: round2(data.coincidentFactorSum / data.roomCount),
      demandLoad: round2(data.demandLoad),
      loadDensityVAm2: data.loadDensityVAm2,
      loadsIncluded: data.loadsIncluded,
      acIncluded: data.acIncluded,
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
