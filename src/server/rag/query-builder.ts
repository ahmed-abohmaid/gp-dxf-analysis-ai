/**
 * server/rag/query-builder.ts
 *
 * Builds the targeted RAG query strings used to retrieve DPS-01 context from
 * the Supabase pgvector store.
 *
 * A single monolithic query covering load densities, demand factors, coincident
 * factors, and room names produces a "smeared" embedding that scores poorly
 * against any specific section in the pdf. Splitting into focused queries —
 * one per topic — maximises the chance that each relevant chunk meets the
 * similarity threshold.
 */

/**
 * Return the set of focused DPS-01 retrieval queries for a given list of room names.
 * All three queries are run in parallel via Promise.all and their results are merged.
 *
 * @param roomNames - Unique room labels from the DXF drawing (deduplicated by caller)
 * @returns Array of query strings; one per retrieval focus area
 */
export function buildRagQueries(roomNames: string[]): [string, string, string] {
  const roomsFragment = roomNames.join(", ");

  // Query 1 — load densities: retrieves VA/m² figures from Section 10-11 and Tables 7-8
  const densityQuery = `DPS-01 connected loads estimation load density VA per square meter residential C1 commercial C2 habitable wet circulation Table 7 Table 8 facility type room type: ${roomsFragment}`;

  // Query 2 — demand factors: retrieves demand factor tables (Table 2 / Table 3) by
  // connected-load tier so the AI can look up the correct factor for each room
  const demandFactorQuery =
    "DPS-01 demand factor Table 2 Table 3 connected load tier residential C1 commercial C2 after diversity maximum demand ADMD kVA";

  // Query 3 — coincident/diversity factors: retrieves Table 4 and diversity sections
  const coincidentFactorQuery =
    "DPS-01 coincident factor diversity factor Table 4 simultaneous demand residential commercial DPS-01";

  return [densityQuery, demandFactorQuery, coincidentFactorQuery];
}
