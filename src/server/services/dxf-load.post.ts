import { round2 } from "@/lib/utils";
import { classifyRooms } from "@/server/ai/classifier";
import type { CategoryValues } from "@/server/ai/value-extractor";
import { extractCategoryValues } from "@/server/ai/value-extractor";
import { processDxfFile } from "@/server/dxf/processor";
import { buildRagQueries } from "@/server/rag/query-builder";
import { searchSaudiCode } from "@/server/rag/saudi-code-loader";
import { computeBuildingSummary } from "@/server/services/factors-calculator";
import { interpolateLoadTable } from "@/server/utils/interpolate";
import { normalizeRoomKey } from "@/server/utils/normalize";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from "@/shared/constants";
import type { DxfProcessResult, DxfRoom } from "@/shared/types/dxf";

/**
 * POST /api/dxf
 *
 * Two-phase AI pipeline for DPS-01 load estimation:
 *   Phase 1 — classify rooms to DPS-01 category codes (RAG: Table 2 context)
 *   Phase 2 — extract VA/m², demand factors, C1/C2 kVA tables per unique category
 *             (RAG: Tables 7/8, 11, 3/4, 5/6)
 *
 * Rooms that fail AI classification are included with null load values.
 */
export async function POST(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("Invalid request: could not parse form data", 400);
  }

  const electricalCode = formData.get("electricalCode") ?? "DPS-01";
  const includeAC = formData.get("includeAC") !== "false";
  if (electricalCode !== "DPS-01") {
    return errorResponse(
      `Electrical code "${electricalCode}" is not yet supported. Only DPS-01 is available.`,
      400,
    );
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

  // ── Steps 1–4: Parse DXF, resolve dittos, aggregate room stats ─────────────

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

  // Resolve ditto marks (" or ") to the nearest preceding named label
  const DITTO_RE = /^["\u201C\u201D']+$/;
  const resolvedLabels = geometry.rawRooms.map((r, i, arr) => {
    if (!DITTO_RE.test(r.name.trim())) return r.name;
    for (let j = i - 1; j >= 0; j--) {
      if (!DITTO_RE.test(arr[j].name.trim())) return arr[j].name;
    }
    return r.name;
  });

  for (let i = 0; i < geometry.rawRooms.length; i++) {
    if (DITTO_RE.test(geometry.rawRooms[i].name.trim())) {
      geometry.rawRooms[i].name = resolvedLabels[i];
    }
  }

  const roomAggregates = new Map<
    string,
    { name: string; area: number; totalAreaForType: number; roomCount: number; allLabels: string[] }
  >();
  for (let i = 0; i < geometry.rawRooms.length; i++) {
    const key = normalizeRoomKey(resolvedLabels[i]);
    const existing = roomAggregates.get(key);
    if (existing) {
      existing.totalAreaForType += geometry.rawRooms[i].area;
      existing.roomCount += 1;
    } else {
      roomAggregates.set(key, {
        name: resolvedLabels[i],
        area: geometry.rawRooms[i].area,
        totalAreaForType: geometry.rawRooms[i].area,
        roomCount: 1,
        allLabels: geometry.rawRooms[i].allLabels ?? [],
      });
    }
  }
  const uniqueRoomInputs = Array.from(roomAggregates.values());

  // ── Steps 5–9: Two-phase RAG + AI ───────────────────────────────────────────

  const { classificationQueries, valueQueries } = buildRagQueries();

  let classificationContext = "";
  let valueContext = "";

  try {
    const [classRagSets, valueRagSets] = await Promise.all([
      Promise.all(classificationQueries.map((q) => searchSaudiCode(q, 5))),
      Promise.all(valueQueries.map((q) => searchSaudiCode(q, 6))),
    ]);

    const dedup = (chunks: { content: string }[]): string => {
      const seen = new Set<string>();
      return chunks
        .filter(({ content }) => (seen.has(content) ? false : (seen.add(content), true)))
        .map((r) => r.content)
        .join("\n\n---\n\n");
    };

    classificationContext = dedup(classRagSets.flat());
    valueContext = dedup(valueRagSets.flat());
  } catch {
    console.error("[POST /api/dxf] RAG retrieval failed — AI will receive empty context");
  }

  // Phase 1 — classification only (no numbers)
  let aiClassifications: Awaited<ReturnType<typeof classifyRooms>> = [];
  try {
    aiClassifications = await classifyRooms(uniqueRoomInputs, classificationContext);
  } catch (err) {
    console.error("[POST /api/dxf] Phase 1 classification failed:", err);
  }

  const classMap = new Map(aiClassifications.map((c) => [normalizeRoomKey(c.roomLabel), c]));

  // Phase 2 — value extraction for each unique category
  const uniqueCategories = [...new Set(aiClassifications.map((c) => c.customerCategory))];
  let aiCategoryValues: CategoryValues[] = [];
  try {
    if (uniqueCategories.length > 0) {
      aiCategoryValues = await extractCategoryValues(uniqueCategories, valueContext, includeAC);
    }
  } catch (err) {
    console.error("[POST /api/dxf] Phase 2 value extraction failed:", err);
  }

  // Retry Phase 2 for categories that returned 0 density but are not declared-load types.
  // These are genuine RAG retrieval failures (e.g. C11 not in main Table 8 chunk).
  const DECLARED_RE = /^C(1[89]|2\d)$/;
  const retrievalFailures = aiCategoryValues
    .filter((cv) => cv.loadDensityVAm2 === 0 && !DECLARED_RE.test(cv.customerCategory))
    .filter((cv) => cv.customerCategory !== "C1" && cv.customerCategory !== "C2")
    .map((cv) => cv.customerCategory);

  if (retrievalFailures.length > 0) {
    try {
      const retryQuery =
        `DPS-01 load density VA per square meter ${retrievalFailures.join(" ")} ` +
        retrievalFailures.map((c) => `customer category ${c}`).join(" ");
      const retryChunks = await searchSaudiCode(retryQuery, 8);
      const retryContext = retryChunks.map((r) => r.content).join("\n\n---\n\n");
      const retryValues = await extractCategoryValues(retrievalFailures, retryContext, includeAC);

      for (const retry of retryValues) {
        if (retry.loadDensityVAm2 > 0) {
          const existing = aiCategoryValues.find(
            (cv) => cv.customerCategory === retry.customerCategory,
          );
          if (existing) {
            existing.loadDensityVAm2 = retry.loadDensityVAm2;
            existing.loadsIncluded = retry.loadsIncluded;
            existing.acIncluded = retry.acIncluded;
            existing.codeReference = retry.codeReference + " (retry query)";
          }
        }
      }
    } catch (err) {
      console.error("[POST /api/dxf] Phase 2 retry failed:", err);
    }
  }

  const valueMap = new Map(aiCategoryValues.map((v) => [v.customerCategory, v]));

  // Total area per category — needed for C1/C2 kVA table interpolation
  const categoryAreaMap = new Map<string, number>();
  for (const cls of aiClassifications) {
    const agg = roomAggregates.get(normalizeRoomKey(cls.roomLabel));
    if (agg) {
      categoryAreaMap.set(
        cls.customerCategory,
        (categoryAreaMap.get(cls.customerCategory) ?? 0) + agg.totalAreaForType,
      );
    }
  }

  // ── Step 10: Compute loads per room ──────────────────────────────────────────

  let hasFailedRooms = false;
  const coincidentFactor = 1.0; // N=1 KWH meter

  const roomLoadInputs: Parameters<typeof computeBuildingSummary>[0] = [];

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

    const totalAreaForType = categoryAreaMap.get(cls.customerCategory) ?? raw.area;
    const { loadDensityVAm2, loadsIncluded } = getDensityForRoom(
      cls.customerCategory,
      totalAreaForType,
      valueMap,
    );

    const values = valueMap.get(cls.customerCategory);
    const demandFactor = values?.demandFactor ?? 1.0;
    const acIncluded = values?.acIncluded ?? null;

    const connectedLoad = round2(loadDensityVAm2 * raw.area);
    const demandLoad = round2(connectedLoad * demandFactor * coincidentFactor);

    roomLoadInputs.push({
      connectedLoad,
      demandFactor,
      coincidentFactor,
      customerCategory: cls.customerCategory,
      roomType: cls.roomType,
      loadDensityVAm2,
      loadsIncluded,
      acIncluded,
    });

    return {
      id: raw.id,
      name: raw.name,
      type: cls.roomType,
      customerCategory: cls.customerCategory,
      area: raw.area,
      loadDensityVAm2,
      loadsIncluded,
      acIncluded,
      connectedLoad,
      demandFactor,
      demandLoad,
      codeReference: cls.codeReference,
    };
  });

  // ── Step 11: Building totals ──────────────────────────────────────────────────

  const summary = computeBuildingSummary(roomLoadInputs);

  const result: DxfProcessResult = {
    success: true,
    rooms,
    totalConnectedLoad: summary.totalConnectedLoad,
    totalDemandLoad: summary.totalDemandLoad,
    totalDemandLoadKVA: summary.totalDemandLoadKVA,
    effectiveDemandFactor: summary.effectiveDemandFactor,
    coincidentFactor,
    categoryBreakdown: summary.categoryBreakdown,
    totalRooms: rooms.length,
    unitsDetected: geometry.unitsDetected,
    hasFailedRooms,
    timestamp: new Date().toISOString(),
  };

  return Response.json(result);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDensityForRoom(
  category: string,
  totalAreaForType: number,
  valueMap: Map<string, CategoryValues>,
): { loadDensityVAm2: number; loadsIncluded: string } {
  const values = valueMap.get(category);

  if (!values) {
    return { loadDensityVAm2: 0, loadsIncluded: "Not found" };
  }

  if ((category === "C1" || category === "C2") && values.c1c2KvaTable?.length) {
    const kva = interpolateLoadTable(values.c1c2KvaTable, totalAreaForType);

    if (kva === null) {
      // Area exceeds table maximum — use extended formula density from AI
      return {
        loadDensityVAm2: values.c1c2ExtendedDensityVAm2 ?? 0,
        loadsIncluded: values.loadsIncluded,
      };
    }

    const densityVAm2 = totalAreaForType > 0 ? round2((kva * 1000) / totalAreaForType) : 0;
    return { loadDensityVAm2: densityVAm2, loadsIncluded: values.loadsIncluded };
  }

  return { loadDensityVAm2: values.loadDensityVAm2, loadsIncluded: values.loadsIncluded };
}

function errorResponse(message: string, status: number): Response {
  const result: DxfProcessResult = {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  };
  return Response.json(result, { status });
}
