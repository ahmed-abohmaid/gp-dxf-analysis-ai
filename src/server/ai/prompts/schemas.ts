import { z } from "zod";

/**
 * Unified output schema for the single-pass room analysis call.
 * AI classifies each room AND provides all load estimation values in one response.
 */
export const RoomAnalysisSchema = z.object({
  rooms: z.array(
    z.object({
      roomLabel: z.string().describe("Exact room label as given in the input — copy verbatim"),

      roomType: z
        .string()
        .describe("Normalised English room type, e.g. 'Master Bedroom', 'Corridor'"),

      customerCategory: z.string().describe("DPS-01 category code: one of C1 … C29"),

      categoryDescription: z
        .string()
        .describe(
          "Human-readable DPS-01 category name, e.g. 'Normal Residential Dwelling'. " +
            "Copy the exact name from DPS-01 Table 2.",
        ),

      loadDensityVAm2: z
        .number()
        .nonnegative()
        .describe(
          "Final combined VA/m² for this room. " +
            "For C1/C2: interpolate from the area→kVA table (Tables 3–6) using the given total area, " +
            "convert kVA → VA, then divide by total area. Return the resulting VA/m² value directly. " +
            "For C18–C29 (declared load): return 0. " +
            "For all others: extract from Table 7 or Table 8.",
        ),

      demandFactor: z
        .number()
        .min(0)
        .max(1)
        .describe(
          "Flat demand factor (0–1) from DPS-01 Table 11. Convert percentages: 60% → 0.60. " +
            "If not found, return 1.0.",
        ),

      loadsIncluded: z
        .string()
        .describe(
          "What loads the VA/m² covers — copy from table header or footnote. " +
            "Example: 'Lights + Air Conditioning + Power Sockets'. " +
            "For C18–C29: 'Declared Load Method — area-based density not applicable'.",
        ),

      acIncluded: z
        .boolean()
        .describe(
          "true if loadDensityVAm2 includes air conditioning. " +
            "false if lights and sockets only. Reflects the code — not the user preference.",
        ),

      codeReference: z
        .string()
        .describe(
          "DPS-01 table/section that is the source, e.g. 'Table 8 (three-phase L-L 400V), Table 11'. " +
            "If a value was not found: 'Not found in retrieved sections'.",
        ),

      classificationReason: z
        .string()
        .describe("One sentence: why this room maps to the chosen category"),
    }),
  ),
});

export type RoomAnalysis = z.infer<typeof RoomAnalysisSchema>["rooms"][number];
