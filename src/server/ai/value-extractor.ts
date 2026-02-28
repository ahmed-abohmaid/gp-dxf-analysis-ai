import { generateText, Output } from "ai";
import { z } from "zod";

import { geminiFlash } from "@/server/ai/gemini-client";

// ── Schema ────────────────────────────────────────────────────────────────────

const CategoryValuesSchema = z.object({
  categoryValues: z.array(
    z.object({
      customerCategory: z
        .string()
        .describe("The DPS-01 category code exactly as given, e.g. 'C1', 'C7'"),

      loadDensityVAm2: z
        .number()
        .nonnegative()
        .describe(
          "Combined VA/m² from DPS-01 Table 7 or Table 8 for this category. " +
            "For C1 and C2: set to 0 — the kVA table is provided in c1c2KvaTable instead. " +
            "For C18–C29: set to 0 — declared load method applies, no area density.",
        ),

      loadsIncluded: z
        .string()
        .describe(
          "Exact description of loads included in the VA/m² figure, " +
            "as written in the table header or footnote of the code. " +
            "Example: 'Lights + Air Conditioning + Power Sockets'. " +
            "For C1/C2: 'Lights + Air Conditioning + Power Sockets (Table 4/6 area method, L-L 400V)'. " +
            "For C18–C29: 'Declared Load Method — area-based density not applicable'.",
        ),
      acIncluded: z
        .boolean()
        .describe(
          "true if the returned loadDensityVAm2 includes air conditioning loads. " +
            "false if the value is for lights and sockets only (no AC). " +
            "Reflects what was actually found in the code \u2014 not the user's preference.",
        ),
      demandFactor: z
        .number()
        .min(0)
        .max(1)
        .describe(
          "Flat demand factor (0–1) from DPS-01 Table 11 for this category. " +
            "This is a single value — NOT tiered. Convert percentages: 60% → 0.60. " +
            "If not found in retrieved sections, return 1.0.",
        ),

      c1c2KvaTable: z
        .array(
          z.object({
            areaSqM: z.number().describe("Floor area in m²"),
            kva: z.number().describe("Estimated load in kVA for this area"),
          }),
        )
        .optional()
        .describe(
          "ONLY for C1 and C2. Array of all [areaSqM, kva] rows extracted from " +
            "DPS-01 Table 4 (C1, three-phase L-L 400V) or Table 6 (C2, three-phase L-L 400V). " +
            "Include every row found in the retrieved text — do not summarise or skip rows. " +
            "Omit this field entirely for C3–C29.",
        ),

      c1c2ExtendedDensityVAm2: z
        .number()
        .optional()
        .describe(
          "ONLY for C1 and C2. The VA/m² value stated in DPS-01 for areas that exceed " +
            "the table maximum (from Section 16 or a table footnote). " +
            "Extract from the retrieved text only — do not guess.",
        ),

      codeReference: z
        .string()
        .describe(
          "Exact DPS-01 table or section that was the source of these values, " +
            "e.g. 'Table 8 (three-phase L-L 400V), Table 11, Table 4'. " +
            "If a value was not found, state: 'Not found in retrieved sections'.",
        ),
    }),
  ),
});

export type CategoryValues = z.infer<typeof CategoryValuesSchema>["categoryValues"][number];

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildValueExtractionPrompt(
  categories: string[],
  valueContext: string,
  includeAC: boolean,
): string {
  const categoriesList = categories.join(", ");

  return `You are an expert in the Saudi Electricity Company Load Estimation Standard DPS-01.

A building floor plan has been classified. The following DPS-01 customer categories
are present in this building:

${categoriesList}

Your task is to look up the load estimation values for EACH of these categories
from the retrieved DPS-01 sections below.

For each category extract the following four items:

────────────────────────────────────────────────
1. LOAD DENSITY (VA/m²)  — from Table 7 or Table 8
────────────────────────────────────────────────
The user has specified: AC_PREFERENCE = ${includeAC ? "true" : "false"}

IF AC_PREFERENCE = true (AC included):
  Use DPS-01 Table 8 (three-phase L-L 400V) as the default.
  These values include Lights + Air Conditioning + Power Sockets.
  Use Table 7 (single-phase L-N 230V) only if Table 8 is not found.

IF AC_PREFERENCE = false (no AC):
  Look for a version of the table that excludes air conditioning.
  DPS-01 may provide:
    • A separate "Lights and Power Sockets only" column or sub-table, OR
    • A footnote stating a reduced density for non-AC buildings, OR
    • Table 7 or Table 8 entries for categories that inherently have no AC
      (e.g. C13 car parks, C14 outdoor areas, C18–C29 industrial).
  If a no-AC density is found, use it and describe the loads in loadsIncluded.
  If no separate no-AC value exists in the retrieved sections for a category,
  return the standard combined value AND set a flag in loadsIncluded:
    "Lights + Air Conditioning + Power Sockets (no AC-excluded value found in DPS-01 — standard density used)"
  DO NOT subtract or estimate an AC portion yourself.

Special cases:
  • C1 (Residential) and C2 (Commercial Shops): these use a separate area→kVA table
    method (Tables 3–6). Set loadDensityVAm2 = 0 and fill item 4 instead.
  • C18–C29: Declared Load Method. Set loadDensityVAm2 = 0.

────────────────────────────────────────────────
2. LOADS INCLUDED DESCRIPTION
────────────────────────────────────────────────
Copy the exact text from the table describing what loads are included in the VA/m²
figure. This is typically in the table column header or a footnote.
Example: "Lights + Air Conditioning + Power Sockets"
If different categories have different descriptions, copy each one individually.

────────────────────────────────────────────────
SPECIAL CASE: C11 — Common Areas and Services
────────────────────────────────────────────────
C11 (Common Areas) may appear in a separate section or footnote of DPS-01,
not necessarily in the main Table 8 grid alongside other categories.

When looking up C11 density:
  • Search for mentions of: "common area", "shared services", "corridor", "staircase",
    "building services", "emergency lighting", "public area" load density.
  • C11 density is typically much lower than habitable areas - if you find a value matching this description, use it.
  • If C11 has separate values for different load types, return the combined total
    and describe what is included in loadsIncluded.
  • If C11 truly cannot be found anywhere in the retrieved sections, return
    loadDensityVAm2: 0 and set codeReference to
    "C11 not found in retrieved sections — requires Table 9 or building services section".
    Do NOT guess a value.

────────────────────────────────────────────────
3. DEMAND FACTOR  — from Table 11
────────────────────────────────────────────────
DPS-01 Table 11 lists a SINGLE flat demand factor per category.
This is NOT a tiered schedule — there is one value per category row.
Extract the exact value. Convert percentages to decimals: 60% → 0.60.
If not found: return 1.0.

────────────────────────────────────────────────
4. C1 / C2 AREA-KVA TABLE (ONLY for C1 and C2)
────────────────────────────────────────────────
DPS-01 provides area→kVA tables for C1 and C2:
  • C1: Table 3 (single-phase), Table 4 (three-phase L-L 400V) ← use Table 4
  • C2: Table 5 (single-phase), Table 6 (three-phase L-L 400V) ← use Table 6

Extract ALL rows you can find in the retrieved text as { areaSqM, kva } pairs.
Do not skip or summarise rows — include every row exactly as it appears.

Also extract the extended formula density (VA/m²) for areas beyond the table
maximum. This appears as a footnote or in a section for large-area buildings
(e.g. "For areas exceeding X m², use Y VA/m²").

Omit this item entirely for C3–C29.

══════════════════════════════════════════════════════════════
DPS-01 CODE SECTIONS (retrieved):
${valueContext}
══════════════════════════════════════════════════════════════

STRICT RULES:
• Extract values ONLY from the retrieved sections above.
• Do NOT guess, estimate, or use knowledge not present in the text.
• If a value for a category is not in the retrieved text, set the numeric field
  to 0 and write "Not found in retrieved sections — manual lookup required"
  in codeReference.
• All demand factors must be in range 0–1 (convert from % if needed).

Return one entry per category: ${categoriesList}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Phase 2 AI call: given unique category codes from Phase 1, reads VA/m²,
 * demand factors, and C1/C2 kVA table rows from the retrieved DPS-01 sections.
 *
 * @param categories  Unique DPS-01 category codes, e.g. ["C1", "C7", "C11"]
 * @param codeContext RAG chunks covering Tables 7/8, 11, 3/4, 5/6
 * @param includeAC   Whether the building has centralised AC; steers Table 8 vs no-AC lookup
 */
export async function extractCategoryValues(
  categories: string[],
  codeContext: string,
  includeAC = true,
) {
  const { output } = await generateText({
    model: geminiFlash,
    output: Output.object({ schema: CategoryValuesSchema }),
    prompt: buildValueExtractionPrompt(categories, codeContext, includeAC),
  });

  if (!output?.categoryValues) {
    console.error("[extractCategoryValues] Gemini returned null or malformed output");
    return [];
  }

  return output.categoryValues;
}
