import { round2 } from "@/lib/utils";
import type { RoomAnalysis } from "@/server/ai/prompts/schemas";
import type { RoomLoadInput } from "@/server/calculation/factors-calculator";
import type { DxfGeometryResult } from "@/server/dxf/processor";
import type { DxfRoom } from "@/shared/types/dxf";

import { normalizeRoomKey } from "./normalize";

// @future: coincidentFactor will be derived from the number of KWH meters or user input.
const COINCIDENT_FACTOR = 1.0;

export interface AssembledLoads {
  rooms: DxfRoom[];
  roomLoadInputs: RoomLoadInput[];
  hasFailedRooms: boolean;
}

/**
 * Merges AI analysis results with DXF geometry to produce per-room load values.
 *
 * For every category the AI returns a uniform loadDensityVAm2 (C1/C2 interpolation
 * is done inside the AI prompt). The backend applies the uniform formula:
 *   connectedLoad = loadDensityVAm2 × area
 *   demandLoad    = connectedLoad × demandFactor × coincidentFactor
 */
export function assembleLoads(
  geometry: DxfGeometryResult,
  analysisResults: RoomAnalysis[],
  resolvedLabels: string[],
): AssembledLoads {
  const analysisMap = new Map(analysisResults.map((a) => [normalizeRoomKey(a.roomLabel), a]));

  let hasFailedRooms = false;
  const roomLoadInputs: RoomLoadInput[] = [];

  const rooms: DxfRoom[] = geometry.rawRooms.map((raw, i) => {
    const analysis = analysisMap.get(normalizeRoomKey(resolvedLabels[i]));

    if (!analysis) {
      hasFailedRooms = true;
      return {
        id: raw.id,
        name: raw.name,
        type: "UNKNOWN",
        customerCategory: "",
        categoryDescription: "",
        area: raw.area,
        loadDensityVAm2: null,
        loadsIncluded: null,
        acIncluded: null,
        connectedLoad: null,
        demandFactor: null,
        demandLoad: null,
        codeReference: "",
        error: "AI classification failed for this room",
      };
    }

    const connectedLoad = round2(analysis.loadDensityVAm2 * raw.area);
    const demandLoad = round2(connectedLoad * analysis.demandFactor * COINCIDENT_FACTOR);

    roomLoadInputs.push({
      connectedLoad,
      demandFactor: analysis.demandFactor,
      coincidentFactor: COINCIDENT_FACTOR,
      customerCategory: analysis.customerCategory,
      categoryDescription: analysis.categoryDescription,
      roomType: analysis.roomType,
      loadDensityVAm2: analysis.loadDensityVAm2,
      loadsIncluded: analysis.loadsIncluded,
      acIncluded: analysis.acIncluded,
    });

    return {
      id: raw.id,
      name: raw.name,
      type: analysis.roomType,
      customerCategory: analysis.customerCategory,
      categoryDescription: analysis.categoryDescription,
      area: raw.area,
      loadDensityVAm2: analysis.loadDensityVAm2,
      loadsIncluded: analysis.loadsIncluded,
      acIncluded: analysis.acIncluded,
      connectedLoad,
      demandFactor: analysis.demandFactor,
      demandLoad,
      codeReference: analysis.codeReference,
    };
  });

  return { rooms, roomLoadInputs, hasFailedRooms };
}
