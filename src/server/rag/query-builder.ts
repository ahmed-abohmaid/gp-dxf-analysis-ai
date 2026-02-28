/**
 * Returns the 4 static RAG queries used to retrieve DPS-01 context for
 * the unified room analysis prompt.
 *
 * Query coverage:
 *   1. Table 2 — category classification
 *   2. Tables 7 & 8 — load densities (VA/m²) for C3–C17, C21–C29
 *   3. Table 11 — demand factors
 *   4. Tables 3–6 — C1/C2 area→kVA + C11 common area density
 */
export function buildRagQueries(): [string, string, string, string] {
  return [
    "DPS-01 customer category classification Table 2 C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 C18 C19 C20 C21 C22 C23 C24 C25 C26 C27 C28 C29 residential commercial dwelling shop office hospital school mosque common area facility type",

    "DPS-01 load density VA per square meter Table 7 Table 8 three-phase L-L 400V combined loads lighting air conditioning power sockets customer category C3 C4 C5 C6 C7 C8 C9 C10 C12 C13 C14 C15 C16 C17 C21 C22 C23 C24 C25 C26 C27 C28 C29",

    "DPS-01 demand factor Table 11 customer category C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 maximum demand diversity percentage after diversity factor",

    "DPS-01 residential dwelling C1 C2 commercial shop area square meter kVA load estimation Table 3 Table 4 Table 5 Table 6 230V 400V single phase three phase common area C11 corridor lobby staircase shared services emergency lighting VA per square meter building services",
  ];
}
