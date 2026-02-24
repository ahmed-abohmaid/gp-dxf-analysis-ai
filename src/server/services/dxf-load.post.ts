import { round2 } from "@/lib/utils";
import { classifyRooms } from "@/server/ai/classifier";
import { processDxfFile } from "@/server/dxf/processor";
import { buildRagQueries } from "@/server/rag/query-builder";
import { searchSaudiCode } from "@/server/rag/saudi-code-loader";
import { computeBuildingSummary } from "@/server/services/factors-calculator";
import { normalizeRoomKey } from "@/server/utils/normalize";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from "@/shared/constants";
import type { DxfProcessResult, DxfRoom } from "@/shared/types/dxf";

/**
 * POST /api/dxf
 *
 * Six-step Saudi Code pipeline:
 *   1. Read the CAD file — extract room boundaries and labels from DXF content
 *   2. Calculate area for each boundary in m²
 *   3. AI + RAG — classify rooms against DPS-01 and assign load densities (VA/m²)
 *   4. Compute connected load per room (density × area)
 *   5. Apply demand and coincident factors per room
 *   6. Compute final building totals with category breakdown
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

  // ── Step 1 & 2: Parse DXF, extract rooms with areas ─────────────────────
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
  // AND replace the display name so users see a meaningful label.
  const DITTO_RE = /^["\u201C\u201D']+$/;
  const resolvedLabels = geometry.rawRooms.map((r, i, arr) => {
    if (!DITTO_RE.test(r.name.trim())) return r.name;
    for (let j = i - 1; j >= 0; j--) {
      if (!DITTO_RE.test(arr[j].name.trim())) return arr[j].name;
    }
    return r.name; // no prior named room found — keep as-is
  });

  // Replace ditto display names with the resolved label
  for (let i = 0; i < geometry.rawRooms.length; i++) {
    if (DITTO_RE.test(geometry.rawRooms[i].name.trim())) {
      geometry.rawRooms[i].name = resolvedLabels[i];
    }
  }

  // Unique room types sent to AI — deduplicated by resolved label (case-insensitive)
  const uniqueRoomInputs = Array.from(
    new Map(
      geometry.rawRooms.map((r, i) => [
        normalizeRoomKey(resolvedLabels[i]),
        { name: resolvedLabels[i], area: r.area, allLabels: r.allLabels },
      ]),
    ).values(),
  );

  // ── Step 3: RAG retrieval + AI classification ────────────────────────────
  let codeContext = "";
  try {
    const roomNames = uniqueRoomInputs.map((r) => r.name);
    // Three focused queries run in parallel — one for load densities, one for demand
    // factor tables (Table 2/3), one for coincident/diversity factor tables.
    // A single monolithic query produces a smeared embedding that scores poorly against
    // any specific section; targeted queries retrieve each topic independently.
    const queries = buildRagQueries(roomNames);
    const ragResultSets = await Promise.all(queries.map((q) => searchSaudiCode(q, 5)));
    // Flatten and deduplicate chunks by content so identical hits don't inflate the prompt
    const seenContent = new Set<string>();
    codeContext = ragResultSets
      .flat()
      .filter(({ content }) =>
        seenContent.has(content) ? false : (seenContent.add(content), true),
      )
      .map((r) => r.content)
      .join("\n\n---\n\n");
  } catch {
    console.error("[POST /api/dxf] RAG retrieval failed — AI will receive empty context");
  }

  let aiClassifications: Awaited<ReturnType<typeof classifyRooms>> = [];
  try {
    aiClassifications = await classifyRooms(uniqueRoomInputs, codeContext);
  } catch (err) {
    console.error("[POST /api/dxf] AI classification failed:", err);
    aiClassifications = [];
  }

  const classMap = new Map(aiClassifications.map((c) => [normalizeRoomKey(c.roomLabel), c]));

  // ── Steps 4-5: Compute loads and apply factors per room ──────────────────
  let hasFailedRooms = false;
  const roomLoadInputs: {
    connectedLoad: number;
    demandFactor: number;
    coincidentFactor: number;
    customerCategory: string;
    roomType: string;
  }[] = [];

  const rooms: DxfRoom[] = geometry.rawRooms.map((raw, i) => {
    const cls = classMap.get(normalizeRoomKey(resolvedLabels[i]));

    if (!cls) {
      hasFailedRooms = true;
      return {
        id: raw.id,
        name: raw.name,
        type: "UNKNOWN",
        customerCategory: "",
        area: raw.area,
        lightingDensity: null,
        socketsDensity: null,
        lightingLoad: null,
        socketsLoad: null,
        connectedLoad: null,
        demandFactor: null,
        coincidentFactor: null,
        demandLoad: null,
        codeReference: "",
        error: "AI classification failed for this room",
      };
    }

    // density × this room's actual area — correct even for duplicate room names
    const lightingLoad = round2(cls.lightingDensity * raw.area);
    const socketsLoad = round2(cls.socketsDensity * raw.area);
    const connectedLoad = round2(lightingLoad + socketsLoad);

    // Step 5: Apply demand and coincident factors
    // Computed inline — computeBuildingSummary calls computeRoomDemandLoad internally,
    // so calling it here too would double the computation.
    const demandLoad = round2(connectedLoad * cls.demandFactor * cls.coincidentFactor);

    roomLoadInputs.push({
      connectedLoad,
      demandFactor: cls.demandFactor,
      coincidentFactor: cls.coincidentFactor,
      customerCategory: cls.customerCategory,
      roomType: cls.roomType,
    });

    return {
      id: raw.id,
      name: raw.name,
      type: cls.roomType,
      customerCategory: cls.customerCategory,
      area: raw.area,
      lightingDensity: cls.lightingDensity,
      socketsDensity: cls.socketsDensity,
      lightingLoad,
      socketsLoad,
      connectedLoad,
      demandFactor: cls.demandFactor,
      coincidentFactor: cls.coincidentFactor,
      demandLoad,
      codeReference: cls.codeReference,
    };
  });

  // ── Step 6: Building-level totals ────────────────────────────────────────
  const summary = computeBuildingSummary(roomLoadInputs);

  const result: DxfProcessResult = {
    success: true,
    rooms,
    totalConnectedLoad: summary.totalConnectedLoad,
    totalDemandLoad: summary.totalDemandLoad,
    totalDemandLoadKVA: summary.totalDemandLoadKVA,
    effectiveDemandFactor: summary.effectiveDemandFactor,
    categoryBreakdown: summary.categoryBreakdown,
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
