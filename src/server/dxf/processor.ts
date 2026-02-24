/**
 * server/dxf/processor.ts
 *
 * Geometry-only DXF processor.
 * Parses DXF file content, extracts closed polylines (LWPOLYLINE + legacy POLYLINE)
 * as room polygons, matches text labels to polygons via layer-aware filtering, and
 * returns raw room data (name + area + all text candidates for AI context).
 *
 * Layer strategy:
 *   1. Auto-detect boundary layer(s) by name pattern (e.g. "Boundary Layer")
 *   2. Auto-detect room label layer(s) by name pattern (e.g. "A-AREA-IDEN")
 *   3. Blacklist known annotation layers (callouts, dimensions, door tags)
 *   4. Fall back to all layers when no match — ensures arbitrary DXFs still work
 */
import Flatten from "@flatten-js/core";
import DxfParser from "dxf-parser";

// Server-internal types — never sent over the wire to the client

interface RawRoom {
  id: number;
  /** Best-scored text label found inside the polygon */
  name: string;
  /** Floor area in m² after unit-conversion (mm → m when detected) */
  area: number;
  /** All text candidates found inside (or near) the polygon — sent to AI for context */
  allLabels: string[];
}

interface DxfGeometryResult {
  success: boolean;
  rawRooms: RawRoom[];
  totalRooms: number;
  /** Human-readable description of the unit conversion applied */
  unitsDetected: string;
  /** Which layers were used for boundary detection and text matching */
  layersUsed: { boundary: string[]; text: string[] };
  timestamp: string;
  error?: string;
}

// ── Constants (inlined — no external config dependency) ──────────────────────

/** If average sample area exceeds this threshold, drawing units are millimetres */
const MM_THRESHOLD = 500_000;
/** Divide raw mm² areas by this factor to get m² */
const MM_FACTOR = 1_000_000;
/** Polygons smaller than this (m²) are annotations/blocks, not rooms */
const MIN_ROOM_AREA = 0.2;
/** Max distance (in DXF units, pre-conversion) for the tolerance text-matching pass */
const TEXT_MATCH_TOLERANCE = 500;

// ── Layer detection patterns ────────────────────────────────────────────────

/** Patterns that identify polyline layers containing room boundaries */
const BOUNDARY_LAYER_PATTERNS = [/^boundary/i, /room.*bound/i, /area.*bound/i];
/** Patterns that identify text layers containing room name labels */
const TEXT_LAYER_PATTERNS = [/area.*iden/i, /room.*name/i, /room.*label/i, /area.*name/i];
/** Patterns for annotation/non-room text layers to blacklist */
const ANNOTATION_LAYER_BLACKLIST = [
  /anno/i,
  /symb/i,
  /dim/i,
  /note/i,
  /tag/i,
  /title/i,
  /grid/i,
  /hatch/i,
  /patt/i,
  /door/i,
  /window/i,
  /furn/i,
  /fixt/i,
  /case/i,
  /glaz/i,
  /sanr/i,
  /detl/i,
  /flor/i,
  /wall/i,
  /genf/i,
  /thin/i,
  /ceil/i,
  /elec/i,
  /mech/i,
  /plmb/i,
  /fire.*prot/i,
  /legend/i,
];

// ── Internal types ────────────────────────────────────────────────────────────

interface DxfEntity {
  type: string;
  layer?: string;
  text?: string;
  position?: { x: number; y: number };
  startPoint?: { x: number; y: number };
  vertices?: Array<{ x: number; y: number; bulge?: number }>;
  shape?: boolean;
  [key: string]: unknown;
}

interface TextEntity {
  text: string;
  point: Flatten.Point;
  matched: boolean;
}

interface PolylineData {
  polygon: Flatten.Polygon;
  rawArea: number;
}

// ── Layer Detection ─────────────────────────────────────────────────────────

/**
 * Extract all layer names from the parsed DXF layer table.
 */
function extractLayerNames(dxf: {
  tables?: { layer?: { layers?: Record<string, unknown> } };
}): string[] {
  const layerTable = dxf.tables?.layer?.layers;
  if (!layerTable || typeof layerTable !== "object") return [];
  return Object.keys(layerTable);
}

/**
 * Find layers matching any of the given patterns.
 */
function findMatchingLayers(allLayers: string[], patterns: RegExp[]): string[] {
  return allLayers.filter((name) => patterns.some((p) => p.test(name)));
}

/**
 * Check if a layer name matches the annotation blacklist.
 */
function isAnnotationLayer(layerName: string): boolean {
  return ANNOTATION_LAYER_BLACKLIST.some((p) => p.test(layerName));
}

/**
 * Auto-detect which layers to use for boundary polylines and text labels.
 * Falls back to all layers when no pattern matches.
 * Exported for unit testing.
 */
export function detectLayers(allLayers: string[]): { boundary: string[]; text: string[] } {
  const boundaryLayers = findMatchingLayers(allLayers, BOUNDARY_LAYER_PATTERNS);
  const textLayers = findMatchingLayers(allLayers, TEXT_LAYER_PATTERNS);

  // Fallback: if no text layers matched, use all non-annotation layers
  const effectiveTextLayers =
    textLayers.length > 0 ? textLayers : allLayers.filter((name) => !isAnnotationLayer(name));

  return {
    boundary: boundaryLayers, // empty = use all layers (backward compat)
    text: effectiveTextLayers.length > 0 ? effectiveTextLayers : allLayers,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strip DXF formatting codes (\P, \A, etc.) and normalise to upper-case.
 * Exported for unit testing.
 */
export function cleanText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\\P/gi, "") // paragraph break codes (no semicolon terminator)
    .replace(/\\[a-zA-Z][^;]*;/g, "") // format codes: \fFont|b0|...;  \H2.5;  etc.
    .replace(/[{}]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Score a text label candidate using structural heuristics only — no domain
 * knowledge (room-name keywords). The AI makes the final classification.
 *
 * Higher score = more likely to be a real room name.
 */
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
 * Uses structural heuristics via scoring — no hardcoded room-name keywords.
 * The AI receives all candidates and makes the final determination.
 * Exported for unit testing.
 */
export function pickLabel(candidates: string[]): string {
  if (candidates.length === 0) return "ROOM";
  if (candidates.length === 1) return candidates[0];

  // Score each candidate and sort descending
  const scored = candidates
    .map((text) => ({ text, score: scoreCandidate(text) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.text.length - a.text.length; // tie-break: longer string wins
    });

  return scored[0].text;
}

/**
 * Detect whether the drawing uses millimetres by sampling the first few polygons.
 * INSUNITS header value 4 also indicates millimetres.
 */
function detectUnits(
  polylines: PolylineData[],
  insunits?: number,
): { factor: number; detected: string } {
  // Filter out tiny annotation polygons before sampling for unit detection
  const significantPolylines = polylines.filter((p) => p.rawArea > 1);
  const samples = significantPolylines.slice(0, 5).map((p) => p.rawArea);

  if (samples.length === 0) {
    return { factor: 1, detected: "Meters / Units (Scale 1:1)" };
  }

  const avg = samples.reduce((s, a) => s + a, 0) / samples.length;

  if (avg > MM_THRESHOLD || insunits === 4) {
    return {
      factor: MM_FACTOR,
      detected: "Millimeters (dividing by 1 000 000)",
    };
  }

  return { factor: 1, detected: "Meters / Units (Scale 1:1)" };
}

/**
 * Check if an entity's layer is in the allowed set.
 * When the allowed set is empty, all layers pass (backward compatibility).
 */
function isOnAllowedLayer(entity: DxfEntity, allowedLayers: string[]): boolean {
  if (allowedLayers.length === 0) return true;
  const entityLayer = (entity.layer ?? "").trim();
  return allowedLayers.some(
    (allowed) => allowed.localeCompare(entityLayer, undefined, { sensitivity: "accent" }) === 0,
  );
}

/**
 * Produce a stable hash key for a polyline based on its bounding box and rounded area.
 * Used to deduplicate entries that arise from the same room boundary emitted on multiple
 * layers or as both an LWPOLYLINE and a legacy POLYLINE entity.
 * Coordinates are rounded to 1 decimal place to absorb floating-point drift.
 */
function polylineDeduplicationKey({ polygon, rawArea }: PolylineData): string {
  const box = polygon.box;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `${r(box.xmin)},${r(box.ymin)},${r(box.xmax)},${r(box.ymax)},${r(rawArea)}`;
}

/**
 * Build a polygon from a list of vertices (shared by LWPOLYLINE and POLYLINE).
 * Returns null if the polygon cannot be constructed.
 */
function buildPolygon(verts: Array<{ x: number; y: number }>): PolylineData | null {
  if (verts.length < 3) return null;

  const points = verts.map((v) => new Flatten.Point(v.x, v.y));

  // Auto-close if last vertex doesn't match first
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x !== last.x || first.y !== last.y) {
    points.push(first);
  }

  const polygon = new Flatten.Polygon(points);
  // Math.abs — Flatten.js returns signed area (negative for CW-wound polygons);
  // Shapely always returns unsigned area. Match Python behaviour.
  return { polygon, rawArea: Math.abs(polygon.area()) };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse DXF file content and extract room polygons with text labels and areas.
 * Accepts the file content string directly — no disk I/O.
 *
 * Layer-aware: auto-detects boundary and text layers from the DXF layer table.
 * Supports both LWPOLYLINE and legacy POLYLINE entities.
 * Sends all text candidates per room for AI context.
 *
 * @param content - Raw DXF file text (UTF-8)
 * @returns DxfGeometryResult with rawRooms (name + area + allLabels) or an error flag
 */
export async function processDxfFile(content: string): Promise<DxfGeometryResult> {
  const timestamp = new Date().toISOString();

  try {
    const parser = new DxfParser();
    const dxf = parser.parseSync(content);

    if (!dxf || !dxf.entities) {
      throw new Error("Invalid DXF file: missing entity data");
    }

    const insunits =
      typeof dxf.header?.$INSUNITS === "number" ? (dxf.header.$INSUNITS as number) : undefined;

    // ── Layer detection ──────────────────────────────────────────────────────
    const allLayers = extractLayerNames(dxf);
    const layersUsed = detectLayers(allLayers);

    const texts: TextEntity[] = [];
    const polylines: PolylineData[] = [];

    // ── Extract TEXT / MTEXT entities (layer-filtered) ──────────────────────
    for (const entity of dxf.entities) {
      if (entity.type !== "TEXT" && entity.type !== "MTEXT") continue;
      try {
        const e = entity as unknown as DxfEntity;
        if (!isOnAllowedLayer(e, layersUsed.text)) continue;
        const text = cleanText(e.text ?? "");
        const pos = e.position ?? e.startPoint;
        if (text && pos) {
          texts.push({ text, point: new Flatten.Point(pos.x, pos.y), matched: false });
        }
      } catch {
        // skip malformed text entity
      }
    }

    // ── Extract LWPOLYLINE entities (layer-filtered) ────────────────────────
    for (const entity of dxf.entities) {
      if (entity.type !== "LWPOLYLINE") continue;
      try {
        const e = entity as unknown as DxfEntity;
        if (!isOnAllowedLayer(e, layersUsed.boundary)) continue;
        const poly = buildPolygon(e.vertices ?? []);
        if (poly) polylines.push(poly);
      } catch {
        // skip malformed polyline
      }
    }

    // ── Extract legacy POLYLINE entities (layer-filtered) ───────────────────
    // Old-style POLYLINE entities use VERTEX sub-entities. The dxf-parser
    // library converts these into a vertices array on the POLYLINE entity.
    // Bulge factors (curved wall segments) are treated as straight lines for
    // now — area accuracy is typically within 2-5% for architectural curves.
    // @future: convert bulge factors to arc segments for exact area calculation
    for (const entity of dxf.entities) {
      if (entity.type !== "POLYLINE") continue;
      try {
        const e = entity as unknown as DxfEntity;
        if (!isOnAllowedLayer(e, layersUsed.boundary)) continue;
        // Skip 3D meshes / polyface meshes — only process 2D polylines
        if (e.shape) continue;
        const poly = buildPolygon(e.vertices ?? []);
        if (poly) polylines.push(poly);
      } catch {
        // skip malformed polyline
      }
    }

    // ── Geometric deduplication ──────────────────────────────────────────────
    // DXF exports from Revit and re-saved AutoCAD files often emit the same room
    // boundary as both an LWPOLYLINE and a legacy POLYLINE, or on multiple layers.
    // LWPOLYLINE entities are extracted first, so their entries take priority.
    const seenPolylineKeys = new Map<string, true>();
    const uniquePolylines: PolylineData[] = [];
    for (const poly of polylines) {
      const key = polylineDeduplicationKey(poly);
      if (!seenPolylineKeys.has(key)) {
        seenPolylineKeys.set(key, true);
        uniquePolylines.push(poly);
      }
    }

    const { factor, detected: unitsDetected } = detectUnits(uniquePolylines, insunits);

    const rawRooms: RawRoom[] = [];
    // Parallel array: roomPolylines[i] is the PolylineData for rawRooms[i].
    // Built together with rawRooms in Pass 1 so Pass 2 can index directly.
    const roomPolylines: PolylineData[] = [];

    // ── Pass 1: Strict point-in-polygon text matching ───────────────────────
    for (const polyData of uniquePolylines) {
      const { polygon, rawArea } = polyData;
      const area = Math.round((rawArea / factor) * 100) / 100;

      if (area < MIN_ROOM_AREA) continue; // annotation / block, not a room

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

    // ── Pass 2: Tolerance-based matching for unmatched texts ────────────────
    // Text insertion points near polygon edges (common with Revit exports)
    // may fall slightly outside the boundary. Match them to the nearest polygon
    // within a tolerance distance.
    const unmatchedTexts = texts.filter((t) => !t.matched);
    if (unmatchedTexts.length > 0) {
      for (const te of unmatchedTexts) {
        let bestRoom: RawRoom | null = null;
        let bestDist = TEXT_MATCH_TOLERANCE;

        for (let i = 0; i < rawRooms.length; i++) {
          // roomPolylines[i] corresponds to rawRooms[i] — built in parallel in Pass 1
          const polyData = roomPolylines[i];
          try {
            const [dist] = polyData.polygon.distanceTo(te.point);
            if (dist < bestDist) {
              bestDist = dist;
              bestRoom = rawRooms[i];
            }
          } catch {
            // distanceTo may fail for degenerate polygons
          }
        }

        if (bestRoom) {
          bestRoom.allLabels.push(te.text);
          // Re-pick the best label with the expanded candidate set
          bestRoom.name = pickLabel(bestRoom.allLabels);
          te.matched = true;
        }
      }
    }

    return {
      success: true,
      rawRooms,
      totalRooms: rawRooms.length,
      unitsDetected,
      layersUsed,
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      rawRooms: [],
      totalRooms: 0,
      unitsDetected: "Unknown",
      layersUsed: { boundary: [], text: [] },
      timestamp,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
