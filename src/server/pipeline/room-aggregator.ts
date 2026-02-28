import type { RoomPromptInput } from "@/server/ai/prompts/room-analysis";
import type { DxfGeometryResult } from "@/server/dxf/processor";

import { normalizeRoomKey } from "./normalize";

// Matches straight and curly quotation marks used as ditto marks in DXF drawings.
const DITTO_RE = /^["\u201C\u201D']+$/;

export interface AggregateResult {
  /** Per-room resolved labels (index-aligned with geometry.rawRooms) */
  resolvedLabels: string[];
  uniqueRoomInputs: RoomPromptInput[];
  /**
   * Map from normalised room key → aggregate stats.
   * Used by load-assembler to retrieve totalAreaForType per room.
   */
  roomAggregates: Map<
    string,
    { name: string; area: number; totalAreaForType: number; roomCount: number; allLabels: string[] }
  >;
}

// Does NOT mutate geometry.rawRooms.
export function aggregateRooms(geometry: DxfGeometryResult): AggregateResult {
  const { rawRooms } = geometry;

  // Pass 1: resolve ditto marks to the nearest preceding named label.
  const resolvedLabels = rawRooms.map((r, i, arr) => {
    if (!DITTO_RE.test(r.name.trim())) return r.name;
    for (let j = i - 1; j >= 0; j--) {
      if (!DITTO_RE.test(arr[j].name.trim())) return arr[j].name;
    }
    return r.name;
  });

  // Pass 2: aggregate by normalised key (same label → accumulate area).
  const roomAggregates = new Map<
    string,
    { name: string; area: number; totalAreaForType: number; roomCount: number; allLabels: string[] }
  >();

  for (let i = 0; i < rawRooms.length; i++) {
    const key = normalizeRoomKey(resolvedLabels[i]);
    const existing = roomAggregates.get(key);
    if (existing) {
      existing.totalAreaForType += rawRooms[i].area;
      existing.roomCount += 1;
    } else {
      roomAggregates.set(key, {
        name: resolvedLabels[i],
        area: rawRooms[i].area,
        totalAreaForType: rawRooms[i].area,
        roomCount: 1,
        allLabels: rawRooms[i].allLabels ?? [],
      });
    }
  }

  const uniqueRoomInputs: RoomPromptInput[] = Array.from(roomAggregates.values()).map((agg) => ({
    name: agg.name,
    area: agg.area,
    totalAreaForType: agg.totalAreaForType,
    roomCount: agg.roomCount,
    allLabels: agg.allLabels,
  }));

  return { resolvedLabels, uniqueRoomInputs, roomAggregates };
}
