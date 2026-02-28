import Flatten from "@flatten-js/core";

export interface TextEntity {
  text: string;
  point: Flatten.Point;
  matched: boolean;
}

export interface PolylineData {
  polygon: Flatten.Polygon;
  rawArea: number;
}

export interface RawRoom {
  id: number;
  name: string;
  area: number;
  allLabels: string[];
}

/** Max distance (in DXF units, pre-conversion) for the tolerance text-matching pass */
const TEXT_MATCH_TOLERANCE = 500;

export function cleanText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\\P/gi, "") // paragraph break codes (no semicolon terminator)
    .replace(/\\[a-zA-Z][^;]*;/g, "") // format codes: \fFont|b0|...;  \H2.5;  etc.
    .replace(/[{}]/g, "")
    .trim()
    .toUpperCase();
}

function scoreCandidate(text: string): number {
  let score = 0;

  // Strongly penalise pure numeric strings (area values, door numbers)
  if (/^\d+(\.\d+)?$/.test(text)) return -100;

  // Penalise known DXF tag prefixes (door tags, dimension strings)
  if (/^(L\d+-|DT\d*|DS\d*)$/i.test(text)) return -50;

  // Penalise single-character or very short (≤2 chars) strings
  if (text.length <= 2) score -= 10;

  // Penalise alphanumeric codes: 1-2 letters followed by 2+ digits (e.g. AZ451, R306, BK102)
  if (/^[A-Z]{1,2}\d{2,}$/i.test(text)) score -= 15;

  // Bonus: multi-word strings are more likely real names (e.g. "FIRE LOBBY", "MAID ROOM")
  if (/\s/.test(text) || /_/.test(text)) score += 5;

  // Bonus: purely alphabetic (with spaces/underscores) — typical of room names
  if (/^[A-Z][A-Z_ .]+$/i.test(text)) score += 3;

  // Bonus: longer strings tend to be more descriptive
  if (text.length >= 4) score += 2;
  if (text.length >= 8) score += 1;

  return score;
}

/**
 * Choose the best label from all text strings found inside a polygon.
 * Uses structural heuristics — no hardcoded room-name keywords.
 * The AI receives all candidates and makes the final determination.
 * Exported for unit testing.
 */
export function pickLabel(candidates: string[]): string {
  if (candidates.length === 0) return "ROOM";
  if (candidates.length === 1) return candidates[0];

  const scored = candidates
    .map((text) => ({ text, score: scoreCandidate(text) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.text.length - a.text.length; // tie-break: longer string wins
    });

  return scored[0].text;
}

/**
 * Pass 1: match texts that fall strictly inside a polygon boundary.
 * Pass 2: tolerance-based matching for unmatched texts near polygon edges
 * (common with Revit exports where insertion points sit slightly outside).
 */
export function matchTextsToRooms(
  texts: TextEntity[],
  uniquePolylines: PolylineData[],
  factor: number,
  minRoomArea: number,
): { rawRooms: RawRoom[]; roomPolylines: PolylineData[] } {
  const rawRooms: RawRoom[] = [];
  const roomPolylines: PolylineData[] = [];

  // Pass 1: strict point-in-polygon
  for (const polyData of uniquePolylines) {
    const { polygon, rawArea } = polyData;
    const area = Math.round((rawArea / factor) * 100) / 100;

    if (area < minRoomArea) continue;

    const labelsInside: string[] = [];
    for (const te of texts) {
      if (polygon.contains(te.point)) {
        labelsInside.push(te.text);
        te.matched = true;
      }
    }

    rawRooms.push({
      id: rawRooms.length + 1,
      name: pickLabel(labelsInside),
      area,
      allLabels: labelsInside,
    });
    roomPolylines.push(polyData);
  }

  // Pass 2: tolerance-based matching for unmatched texts
  const unmatchedTexts = texts.filter((t) => !t.matched);
  if (unmatchedTexts.length > 0) {
    for (const te of unmatchedTexts) {
      let bestRoom: RawRoom | null = null;
      let bestDist = TEXT_MATCH_TOLERANCE;

      for (let i = 0; i < rawRooms.length; i++) {
        const polyData = roomPolylines[i];
        // Bounding-box pre-filter before the expensive O(n) distanceTo()
        const box = polyData.polygon.box;
        if (
          te.point.x < box.xmin - TEXT_MATCH_TOLERANCE ||
          te.point.x > box.xmax + TEXT_MATCH_TOLERANCE ||
          te.point.y < box.ymin - TEXT_MATCH_TOLERANCE ||
          te.point.y > box.ymax + TEXT_MATCH_TOLERANCE
        )
          continue;
        try {
          const [dist] = polyData.polygon.distanceTo(te.point);
          if (dist < bestDist) {
            bestDist = dist;
            bestRoom = rawRooms[i];
          }
        } catch {
          // skip degenerate polygons
        }
      }

      if (bestRoom) {
        bestRoom.allLabels.push(te.text);
        bestRoom.name = pickLabel(bestRoom.allLabels);
        te.matched = true;
      }
    }
  }

  return { rawRooms, roomPolylines };
}
