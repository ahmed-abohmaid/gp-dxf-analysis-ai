import { generateText, Output } from "ai";
import { z } from "zod";

import { geminiFlash } from "@/server/ai/gemini-client";

export interface RoomInput {
  name: string;
  area: number; // m²
}

export const ClassificationSchema = z.object({
  classifications: z.array(
    z.object({
      roomLabel: z.string().describe("Exact room label as given in the input list"),
      roomType: z.string().describe("Normalised English room type"),
      lightingDensity: z
        .number()
        .nonnegative()
        .describe("SBC 401 lighting load density in VA per m² for this room type"),
      socketsDensity: z
        .number()
        .nonnegative()
        .describe("SBC 401 receptacle/socket load density in VA per m² for this room type"),
      codeReference: z.string().describe("Applicable SBC 401 section or description"),
    }),
  ),
});

export type Classification = z.infer<typeof ClassificationSchema>["classifications"][number];

export function buildClassificationPrompt(rooms: RoomInput[], codeContext: string): string {
  const roomsBlock = rooms
    .map((r, i) => `${i + 1}. "${r.name}" — area: ${r.area.toFixed(2)} m²`)
    .join("\n");

  const codeBlock = codeContext.trim()
    ? `CODE SECTIONS FROM THE SAUDI ELECTRICITY COMPANY LOAD ESTIMATION STANDARD (DPS-01):\n${codeContext}`
    : "NO CODE SECTIONS WERE RETRIEVED. You MUST set lightingDensity: 0, socketsDensity: 0, and codeReference: 'NOT FOUND — no matching section retrieved' for every room. Do not guess or use any other source.";

  return `You are an electrical engineer applying the Saudi Electricity Company Distribution Planning Standard DPS-01 ("Estimation of Customer Load Guideline") to assign electrical load densities to rooms in a building floor plan.

You MUST follow this exact three-step reasoning process for EVERY room:

────────────────────────────────────────────────
STEP 1 — NORMALISE THE ROOM LABEL
────────────────────────────────────────────────
Translate the raw room label into a standard English room type.
Labels may be abbreviations, codes, or Arabic — infer the type from context.
Examples: "BEDROOM_2" → Bedroom, "POWDER" → Powder Room, "STAIR" → Staircase,
"AZ451" with large area → Living Room or Hall, "غرفة" → Bedroom, "L2-013" → Circulation/Corridor.

────────────────────────────────────────────────
STEP 2 — DETERMINE THE BUILDING CUSTOMER CATEGORY (from the provided code)
────────────────────────────────────────────────
Look at ALL the room labels together and decide which DPS-01 customer category this
building belongs to by consulting Table (1) in the retrieved code sections:
  C1  → Normal Residential Dwelling (Bedrooms, Kitchens, Bathrooms, Living Rooms, Balconies, etc.)
  C2  → Normal Commercial Shops (Shops, Stores, Display Areas, etc.)
  C3–C17  → Other area-based facilities — find VA/m² in Table 7 of the provided code.
  C18–C29 → Extended facility types — find VA/m² in Table 8 of the provided code.

────────────────────────────────────────────────
STEP 3 — LOOK UP THE LOAD DENSITY FROM THE CORRECT TABLE (from the provided code)
────────────────────────────────────────────────
Apply the load density from the matching table in the retrieved code sections:

• C1 Residential (Section 10.0 of DPS-01, residential area-equivalent density = 145 VA/m²):
    Habitable rooms (Bedroom, Living, Dining, Kitchen, Study, Family, Maid, Laundry, Hall) → 145 VA/m²
    Wet rooms (Bathroom, WC, Powder Room, Toilet)                                          →  50 VA/m²
    Circulation/outdoor (Balcony, Corridor, Staircase)                                     →  60 VA/m²
    Split: lightingDensity = 40% of density, socketsDensity = 60% of density.
    codeReference: "Section 10.0 — Connected Loads Estimation for Normal Residential Dwelling (C1), DPS-01"

• C2 Commercial (Section 11.0 of DPS-01) → 215 VA/m²; split 40/60.
    codeReference: "Section 11.0 — Connected Loads Estimation for Normal Commercial Shops (C2), DPS-01"

• C3–C17 → use aggregate VA/m² from Table 7 in the retrieved code; split 40/60.

• C18–C29 → use aggregate VA/m² from Table 8 in the retrieved code; split 40/60.

STRICT RULES:
1. Use ONLY the code sections provided in the CODE SECTIONS block below. Do NOT use NEC, IEC, or any external source.
2. Every non-zero density must be traceable to a specific section or table in the provided code text.
3. If after following Steps 1–3 a room still cannot be matched, set lightingDensity: 0, socketsDensity: 0, codeReference: "NOT IN PROVIDED CODE SECTIONS".

${codeBlock}

ROOMS FROM THE DXF DRAWING (label + floor area):
${roomsBlock}

For EVERY room above, return exactly one classification entry with:
- roomLabel: the exact label string as shown above
- roomType: normalised English room type from Step 1
- lightingDensity: VA/m² (lighting portion only) from Step 3
- socketsDensity: VA/m² (sockets portion only) from Step 3
- codeReference: exact section/table reference from the provided code

Return DENSITIES ONLY (VA per m²) — do NOT multiply by the room area. The server computes absolute loads.
Return exactly ${rooms.length} classification entries, one per room label.`;
}

/**
 * Classifies rooms against DPS-01 via Gemini, returning VA/m² load densities per room type.
 * Absolute loads are computed server-side by multiplying density × each room's actual area.
 * Returns an empty array on any failure.
 */
export async function classifyRooms(
  rooms: RoomInput[],
  codeContext: string,
): Promise<Classification[]> {
  try {
    const uniqueRooms = Array.from(
      new Map(rooms.map((r) => [r.name.toUpperCase().trim(), r])).values(),
    );
    const { output } = await generateText({
      model: geminiFlash,
      output: Output.object({ schema: ClassificationSchema }),
      prompt: buildClassificationPrompt(uniqueRooms, codeContext),
    });
    return output.classifications;
  } catch {
    return [];
  }
}
