import { round2 } from "@/lib/utils";
import { classifyRooms } from "@/server/ai/classifier";
import { processDxfFile } from "@/server/dxf/processor";
import { searchSaudiCode } from "@/server/rag/saudi-code-loader";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from "@/shared/constants";
import type { DxfProcessResult, DxfRoom } from "@/shared/types/dxf";

/**
 * POST /api/dxf
 *
 * Two-phase pipeline:
 *   1. Geometry  — processDxfFile() extracts room polygons + areas from DXF content
 *   2. AI + RAG  — classifyRooms() classifies each unique room using DPS-01 sections
 *                  retrieved from the Supabase pgvector store; returns VA/m² densities which
 *                  the server multiplies by each room's actual area for absolute loads
 *
 * Rooms that fail AI classification are included in the response with null load values.
 */
export async function POST(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("Invalid request: could not parse form data", 400);
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return errorResponse("No file provided — include a 'file' field", 400);
  }
  if (!file.name.toLowerCase().endsWith(".dxf")) {
    return errorResponse("Only .dxf files are accepted", 400);
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return errorResponse(
      `File exceeds ${MAX_UPLOAD_SIZE_MB} MB limit (received ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      400,
    );
  }
  if (file.size === 0) {
    return errorResponse("File is empty", 400);
  }

  let content: string;
  try {
    content = await file.text();
  } catch {
    return errorResponse("Could not read file content", 422);
  }

  const geometry = await processDxfFile(content);

  if (!geometry.success) {
    return errorResponse(geometry.error ?? "DXF parsing failed", 422);
  }

  if (geometry.rawRooms.length === 0) {
    return errorResponse(
      "No rooms found in this DXF file. Ensure the drawing has closed polylines with text labels.",
      422,
    );
  }

  // ── Ditto-mark resolution ──────────────────────────────────────────────────
  // AutoCAD drawings sometimes use " (ditto) as a label meaning "same as the
  // room above". Resolve each occurrence to the nearest preceding named label
  // so the AI receives a meaningful name; the original label is preserved for display.
  const DITTO_RE = /^["\u201C\u201D']+$/;
  const resolvedLabels = geometry.rawRooms.map((r, i, arr) => {
    if (!DITTO_RE.test(r.name.trim())) return r.name;
    for (let j = i - 1; j >= 0; j--) {
      if (!DITTO_RE.test(arr[j].name.trim())) return arr[j].name;
    }
    return r.name; // no prior named room found — keep as-is
  });

  // Unique room types sent to AI — deduplicated by resolved label (case-insensitive)
  const uniqueRoomInputs = Array.from(
    new Map(
      geometry.rawRooms.map((r, i) => [
        resolvedLabels[i].toUpperCase().trim(),
        { name: resolvedLabels[i], area: r.area },
      ]),
    ).values(),
  );

  let codeContext = "";
  try {
    const roomNames = uniqueRoomInputs.map((r) => r.name);
    // Query uses exact DPS-01 section headings and terminology so embeddings
    // score well against the indexed PDF chunks.
    const ragResults = await searchSaudiCode(
      `connected loads estimation normal residential dwelling C1 load density VA sq m customer category facility type: ${roomNames.join(", ")}`,
      10,
    );
    codeContext = ragResults.map((r) => r.content).join("\n\n---\n\n");
  } catch {
    // RAG unavailable — AI will receive empty context and return 0-load rooms per prompt rules
  }

  const aiClassifications = await classifyRooms(uniqueRoomInputs, codeContext);

  const classMap = new Map(aiClassifications.map((c) => [c.roomLabel.toUpperCase().trim(), c]));

  let totalLoad = 0;
  let hasFailedRooms = false;

  // Multiply per-room area × AI-returned densities so duplicate room names with
  // different areas each get their own correct absolute load values.
  const rooms: DxfRoom[] = geometry.rawRooms.map((raw, i) => {
    const cls = classMap.get(resolvedLabels[i].toUpperCase().trim());

    if (!cls) {
      hasFailedRooms = true;
      return {
        id: raw.id,
        name: raw.name,
        type: "UNKNOWN",
        area: raw.area,
        lightingLoad: null,
        socketsLoad: null,
        totalLoad: null,
        codeReference: "",
        error: "AI classification failed for this room",
      };
    }

    // density × this room's actual area — correct even for duplicate room names
    const lightingLoad = round2(cls.lightingDensity * raw.area);
    const socketsLoad = round2(cls.socketsDensity * raw.area);
    const roomTotal = round2(lightingLoad + socketsLoad);

    totalLoad += roomTotal;

    return {
      id: raw.id,
      name: raw.name,
      type: cls.roomType,
      area: raw.area,
      lightingLoad,
      socketsLoad,
      totalLoad: roomTotal,
      codeReference: cls.codeReference,
    };
  });

  const result: DxfProcessResult = {
    success: true,
    rooms,
    totalLoad: round2(totalLoad),
    totalLoadKVA: round2(totalLoad / 1000),
    totalRooms: rooms.length,
    unitsDetected: geometry.unitsDetected,
    hasFailedRooms,
    timestamp: new Date().toISOString(),
  };

  return Response.json(result);
}

function errorResponse(message: string, status: number): Response {
  const result: DxfProcessResult = {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  };
  return Response.json(result, { status });
}
