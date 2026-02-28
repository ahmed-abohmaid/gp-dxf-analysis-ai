import { generateText, Output } from "ai";

import { geminiFlash } from "@/server/ai/gemini-client";
import { buildRoomAnalysisPrompt, type RoomPromptInput } from "@/server/ai/prompts/room-analysis";
import { RoomAnalysisSchema, type RoomAnalysis } from "@/server/ai/prompts/schemas";

export type { RoomPromptInput, RoomAnalysis };

/**
 * Single-pass room analysis: classifies each room to its DPS-01 category AND
 * extracts all load estimation values (VA/m², demand factor, loads description).
 *
 * For C1/C2, the AI performs area→kVA table interpolation internally using the
 * totalAreaForType supplied per room, returning a uniform loadDensityVAm2 for
 * all categories. The backend does no special-casing of C1/C2.
 *
 * @throws on AI failure — caller decides how to handle partial results
 */
export async function analyzeRooms(
  rooms: RoomPromptInput[],
  codeContext: string,
  includeAC: boolean,
): Promise<RoomAnalysis[]> {
  const { output } = await generateText({
    model: geminiFlash,
    output: Output.object({ schema: RoomAnalysisSchema }),
    prompt: buildRoomAnalysisPrompt(rooms, codeContext, includeAC),
  });

  if (!output?.rooms) {
    console.error("[analyzeRooms] Gemini returned null or malformed output");
    return [];
  }

  return output.rooms;
}
