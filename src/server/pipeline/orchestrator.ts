import { analyzeRooms } from "@/server/ai/room-analyzer";
import { computeBuildingSummary } from "@/server/calculation/factors-calculator";
import { processDxfFile } from "@/server/dxf/processor";
import { buildRagQueries } from "@/server/rag/query-builder";
import { searchSaudiCode } from "@/server/rag/saudi-code-loader";
import type { DxfProcessResult } from "@/shared/types/dxf";
import type { SseEventName, SseProgressData } from "@/shared/types/sse";

import { errorResponse, validateDxfRequest } from "./dxf-validator";
import { assembleLoads } from "./load-assembler";
import { aggregateRooms } from "./room-aggregator";

const STEPS = [
  "Parsing DXF geometry",
  "Retrieving Saudi code context",
  "Analyzing rooms with AI",
  "Computing final loads",
] as const;

export async function POST(req: Request): Promise<Response> {
  const validated = await validateDxfRequest(req);
  if ("error" in validated) return validated.error;
  const { content, includeAC } = validated;

  const encoder = new TextEncoder();
  const total = STEPS.length;

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: SseEventName, data: unknown): void {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      function progress(index: number): void {
        emit("progress", {
          step: STEPS[index],
          index: index + 1,
          total,
        } satisfies SseProgressData);
      }

      const warnings: string[] = [];

      function finish(result: DxfProcessResult): void {
        if (warnings.length > 0) result.warnings = warnings;
        emit("result", result);
        controller.close();
      }

      try {
        // ── Step 1: Parse DXF geometry ───────────────────────────────────────
        progress(0);
        const geometry = await processDxfFile(content);

        if (!geometry.success) {
          finish({
            success: false,
            error: geometry.error ?? "DXF parsing failed",
            timestamp: new Date().toISOString(),
          });
          return;
        }
        if (geometry.rawRooms.length === 0) {
          finish({
            success: false,
            error:
              "No rooms found in this DXF file. Ensure the drawing has closed polylines with text labels.",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const { resolvedLabels, uniqueRoomInputs } = aggregateRooms(geometry);

        // ── Step 2: Parallel RAG retrieval ───────────────────────────────────
        progress(1);
        const [q1, q2, q3, q4] = buildRagQueries();
        let codeContext = "";
        try {
          const ragSets = await Promise.all([
            searchSaudiCode(q1, 5),
            searchSaudiCode(q2, 5),
            searchSaudiCode(q3, 6),
            searchSaudiCode(q4, 6),
          ]);
          const seen = new Set<string>();
          codeContext = ragSets
            .flat()
            .filter(({ content: c }) => (seen.has(c) ? false : (seen.add(c), true)))
            .map((r) => r.content)
            .join("\n\n---\n\n");
        } catch (err) {
          console.error(
            "[POST /api/dxf] RAG retrieval failed — AI will receive empty context",
            err,
          );
          warnings.push("Saudi code context retrieval failed — results may be less accurate.");
        }

        // ── Step 3: Single AI call ────────────────────────────────────────────
        progress(2);
        let analysisResults: Awaited<ReturnType<typeof analyzeRooms>> = [];
        try {
          analysisResults = await analyzeRooms(uniqueRoomInputs, codeContext, includeAC);
        } catch (err) {
          console.error("[POST /api/dxf] AI analysis failed:", err);
          warnings.push("AI room analysis failed — load values will be empty.");
        }

        // ── Step 4: Assemble loads + building summary ─────────────────────────
        progress(3);
        const { rooms, roomLoadInputs, hasFailedRooms } = assembleLoads(
          geometry,
          analysisResults,
          resolvedLabels,
        );
        const summary = computeBuildingSummary(roomLoadInputs);

        finish({
          success: true,
          rooms,
          totalConnectedLoad: summary.totalConnectedLoad,
          totalDemandLoad: summary.totalDemandLoad,
          totalDemandLoadKVA: summary.totalDemandLoadKVA,
          effectiveDemandFactor: summary.effectiveDemandFactor,
          coincidentFactor: 1.0,
          categoryBreakdown: summary.categoryBreakdown,
          totalRooms: rooms.length,
          unitsDetected: geometry.unitsDetected,
          hasFailedRooms,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        finish({
          success: false,
          error: err instanceof Error ? err.message : "Unexpected server error",
          timestamp: new Date().toISOString(),
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export { errorResponse };
