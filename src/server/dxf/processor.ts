import { detectLayers } from "@/server/dxf/layer-detector";
import { parseDxfContent } from "@/server/dxf/parser";
import { buildRoomPolygons, detectUnits, MIN_ROOM_AREA } from "@/server/dxf/polygon-builder";
import { cleanText, matchTextsToRooms, pickLabel } from "@/server/dxf/text-matcher";

export { detectLayers, cleanText, pickLabel };

export interface DxfGeometryResult {
  success: boolean;
  rawRooms: Array<{ id: number; name: string; area: number; allLabels: string[] }>;
  totalRooms: number;
  unitsDetected: string;
  layersUsed: { boundary: string[]; text: string[] };
  timestamp: string;
  error?: string;
}

export async function processDxfFile(content: string): Promise<DxfGeometryResult> {
  const timestamp = new Date().toISOString();
  try {
    const { insunits, layersUsed, texts, lwPolylineVerts, legacyPolylineVerts } =
      parseDxfContent(content);

    const uniquePolylines = buildRoomPolygons(lwPolylineVerts, legacyPolylineVerts);
    const { factor, detected: unitsDetected } = detectUnits(uniquePolylines, insunits);

    const { rawRooms } = matchTextsToRooms(texts, uniquePolylines, factor, MIN_ROOM_AREA);

    return {
      success: true,
      rawRooms,
      totalRooms: rawRooms.length,
      unitsDetected,
      layersUsed,
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      rawRooms: [],
      totalRooms: 0,
      unitsDetected: "Unknown",
      layersUsed: { boundary: [], text: [] },
      timestamp,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
