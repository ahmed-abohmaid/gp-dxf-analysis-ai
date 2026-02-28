import { round2 } from "@/lib/utils";

/**
 * Linear interpolation of a load value (kVA) from a DPS-01 area-load table.
 *
 * @param table   Array of { areaSqM, kva } rows extracted by AI Phase 2 from the code PDF.
 *                Does not need to be sorted — sorts internally.
 * @param areaSqM Target floor area in m²
 * @returns       Interpolated kVA, or null if area exceeds the table maximum
 *                (caller should fall back to the extended formula density)
 */
export function interpolateLoadTable(
  table: Array<{ areaSqM: number; kva: number }>,
  areaSqM: number,
): number | null {
  if (areaSqM <= 0) return 0;
  const sorted = [...table].sort((a, b) => a.areaSqM - b.areaSqM);

  if (areaSqM < sorted[0].areaSqM) {
    return (areaSqM / sorted[0].areaSqM) * sorted[0].kva;
  }

  if (areaSqM > sorted[sorted.length - 1].areaSqM) return null;

  // Find the first row at or above the target — the bracket is [prev, this row]
  const idx = sorted.findIndex((row) => row.areaSqM >= areaSqM);
  const { areaSqM: a0, kva: v0 } = sorted[idx - 1];
  const { areaSqM: a1, kva: v1 } = sorted[idx];
  const t = (areaSqM - a0) / (a1 - a0);
  return round2(v0 + t * (v1 - v0));
}
