import { generateText, Output } from "ai";
import { z } from "zod";

import { geminiFlash } from "@/server/ai/gemini-client";
import { normalizeRoomKey } from "@/server/utils/normalize";

interface RoomInput {
  name: string;
  area: number; // m²
  /** All text candidates found inside the room polygon — provides AI with extra context */
  allLabels?: string[];
}

const ClassificationSchema = z.object({
  classifications: z.array(
    z.object({
      roomLabel: z.string().describe("Exact room label as given in the input list"),
      roomType: z.string().describe("Normalised English room type"),
      customerCategory: z.string().describe("DPS-01 customer category (e.g. C1, C2, C3)"),
      lightingDensity: z
        .number()
        .nonnegative()
        .describe("DPS-01 lighting load density in VA per m² for this room type"),
      socketsDensity: z
        .number()
        .nonnegative()
        .describe("DPS-01 receptacle/socket load density in VA per m² for this room type"),
      demandFactor: z
        .number()
        .min(0)
        .max(1)
        .describe("DPS-01 demand factor (0–1) from the applicable demand factor table"),
      coincidentFactor: z
        .number()
        .min(0)
        .max(1)
        .describe("DPS-01 coincident/diversity factor (0–1)"),
      codeReference: z.string().describe("Applicable DPS-01 section or table reference"),
    }),
  ),
});

type Classification = z.infer<typeof ClassificationSchema>["classifications"][number];

function buildClassificationPrompt(rooms: RoomInput[], codeContext: string): string {
  const roomsBlock = rooms
    .map((r, i) => {
      const allLabelsStr =
        r.allLabels && r.allLabels.length > 1
          ? ` (all text inside boundary: ${r.allLabels.map((l) => `"${l}"`).join(", ")})`
          : "";
      return `${i + 1}. "${r.name}"${allLabelsStr} — area: ${r.area.toFixed(2)} m²`;
    })
    .join("\n");

  const codeBlock = codeContext.trim()
    ? `CODE SECTIONS FROM THE SAUDI ELECTRICITY COMPANY LOAD ESTIMATION STANDARD (DPS-01):\n${codeContext}`
    : "NO CODE SECTIONS WERE RETRIEVED. You MUST set lightingDensity: 0, socketsDensity: 0, demandFactor: 1.0, coincidentFactor: 1.0, and codeReference: 'NOT FOUND — no matching section retrieved' for every room. Do not guess or use any other source.";

  return `You are an electrical engineer applying the Saudi Electricity Company Distribution Planning Standard DPS-01 ("Estimation of Customer Load Guideline") to assign electrical load densities and demand factors to rooms in a building floor plan.

You MUST follow this exact four-step reasoning process for EVERY room:

────────────────────────────────────────────────
STEP 1 — NORMALISE THE ROOM LABEL
────────────────────────────────────────────────
Translate the raw room label into a standard English room type.
Labels may be abbreviations, codes, or Arabic — infer the type from context.
For each room, you receive either a single label OR a label plus all text found inside its boundary polygon. Use ALL available text candidates plus the room's area to determine the actual room type. Ignore sheet references (e.g. "AZ451"), door tags (e.g. "DT01"), dimension text, and annotation codes — these are CAD artifacts, not room names.

Examples:
  "BEDROOM_2" → Bedroom
  "POWDER" → Powder Room
  "STAIR" → Staircase
  "M.BEDROOM_1" → Master Bedroom
  "FIRE LOBBY" → Fire Lobby / Corridor
  "MAID ROOM" → Maid Room
  "غرفة" → Bedroom
  "L2-013" → Circulation/Corridor
  Unknown codes with large area → ask: does the surrounding text or area suggest Living Room, Hall, Reception?

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
    Circulation/outdoor (Balcony, Corridor, Staircase, Fire Lobby)                         →  60 VA/m²
    Split: lightingDensity = 40% of density, socketsDensity = 60% of density.
    codeReference: "Section 10.0 — Connected Loads Estimation for Normal Residential Dwelling (C1), DPS-01"

• C2 Commercial (Section 11.0 of DPS-01) → 215 VA/m²; split 40/60.
    codeReference: "Section 11.0 — Connected Loads Estimation for Normal Commercial Shops (C2), DPS-01"

• C3–C17 → use aggregate VA/m² from Table 7 in the retrieved code; split 40/60.

• C18–C29 → use aggregate VA/m² from Table 8 in the retrieved code; split 40/60.

────────────────────────────────────────────────
STEP 4 — DETERMINE DEMAND & COINCIDENT FACTORS (from the provided code)
────────────────────────────────────────────────
Look up the demand factor and coincident factor from the DPS-01 tables in the provided code:

• Demand factor reduces the connected load to the expected maximum demand.
  - C1 Residential: Use Table 2 or the applicable demand factor table from the provided code.
    Typical residential demand factors range from 0.4 to 0.8 depending on total connected load.
  - C2 Commercial: Use Table 3 or the applicable demand factor table from the provided code.
  - C3–C29: Use the applicable tables (Tables 4–8) from the provided code.
  - If no specific demand factor is found in the provided code, use 1.0 (conservative).

• Coincident factor (diversity factor) accounts for not all loads operating simultaneously:
  - Look for diversity/coincident factor tables in the provided code sections.
  - If no specific coincident factor is found, use 1.0 (conservative).

IMPORTANT: The demand factor and coincident factor should be realistic values from the DPS-01 standard.
Do NOT default to 1.0 unless the information genuinely cannot be found in the provided code sections.

STRICT RULES:
1. Use ONLY the code sections provided in the CODE SECTIONS block below. Do NOT use NEC, IEC, or any external source.
2. Every non-zero density must be traceable to a specific section or table in the provided code text.
3. If after following Steps 1–4 a room still cannot be matched, set lightingDensity: 0, socketsDensity: 0, demandFactor: 1.0, coincidentFactor: 1.0, codeReference: "NOT IN PROVIDED CODE SECTIONS".

${codeBlock}

ROOMS FROM THE DXF DRAWING (label + floor area):
${roomsBlock}

For EVERY room above, return exactly one classification entry with:
- roomLabel: the exact label string as shown above
- roomType: normalised English room type from Step 1
- customerCategory: the DPS-01 customer category (e.g. "C1", "C2") from Step 2
- lightingDensity: VA/m² (lighting portion only) from Step 3
- socketsDensity: VA/m² (sockets portion only) from Step 3
- demandFactor: demand factor (0–1) from Step 4
- coincidentFactor: coincident/diversity factor (0–1) from Step 4
- codeReference: exact section/table reference from the provided code

Return DENSITIES ONLY (VA per m²) — do NOT multiply by the room area. The server computes absolute loads.
Return exactly ${rooms.length} classification entries, one per room label.`;
}

/**
 * Classifies rooms against DPS-01 via Gemini, returning VA/m² load densities
 * and demand/coincident factors per room type.
 * Absolute loads are computed server-side by multiplying density × each room's actual area.
 *
 * @throws Error with descriptive message on AI failure (caller decides how to handle)
 */
export async function classifyRooms(
  rooms: RoomInput[],
  codeContext: string,
): Promise<Classification[]> {
  // Deduplication is handled by the caller — no redundant dedup here
  const { output } = await generateText({
    model: geminiFlash,
    output: Output.object({ schema: ClassificationSchema }),
    prompt: buildClassificationPrompt(rooms, codeContext),
  });

  if (!output?.classifications) {
    console.error("[classifyRooms] Gemini returned null or malformed output");
    return [];
  }

  return output.classifications;
}
