/**
 * server/dxf/processor.ts
 *
 * Geometry-only DXF processor.
 * Parses DXF file content, extracts closed polylines as room polygons,
 * matches text labels to polygons, and returns raw room data (name + area).
 * No load calculations — load factors are derived by the AI in the API route.
 */
import Flatten from "@flatten-js/core";
import DxfParser from "dxf-parser";

// Server-internal types — never sent over the wire to the client

export interface RawRoom {
  id: number;
  /** Cleaned, uppercased text label found inside the polygon */
  name: string;
  /** Floor area in m² after unit-conversion (mm → m when detected) */
  area: number;
}

export interface DxfGeometryResult {
  success: boolean;
  rawRooms: RawRoom[];
  totalRooms: number;
  /** Human-readable description of the unit conversion applied */
  unitsDetected: string;
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

// ── Internal types ────────────────────────────────────────────────────────────

interface DxfEntity {
  type: string;
  text?: string;
  position?: { x: number; y: number };
  startPoint?: { x: number; y: number };
  vertices?: Array<{ x: number; y: number }>;
  [key: string]: unknown;
}

interface TextEntity {
  text: string;
  point: Flatten.Point;
}

interface PolylineData {
  polygon: Flatten.Polygon;
  rawArea: number;
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
 * Choose the best label from all text strings found inside a polygon.
 * Priority: prefer longer, non-numeric, non-tag strings.
 * Exported for unit testing.
 */
export function pickLabel(candidates: string[]): string {
  if (candidates.length === 0) return "ROOM";

  // First non-numeric, non-tag candidate
  for (const t of candidates) {
    const isNumeric = /^\d+(\.\d+)?$/.test(t);
    const isTag = /^(L\d+-|DT|DS)/.test(t);
    if (!isNumeric && !isTag) return t;
  }

  return candidates[0];
}

/**
 * Detect whether the drawing uses millimetres by sampling the first few polygons.
 * INSUNITS header value 4 also indicates millimetres.
 */
function detectUnits(
  polylines: PolylineData[],
  insunits?: number,
): { factor: number; detected: string } {
  const samples = polylines.slice(0, 5).map((p) => p.rawArea);

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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse DXF file content and extract room polygons with text labels and areas.
 * Accepts the file content string directly — no disk I/O.
 *
 * @param content - Raw DXF file text (UTF-8)
 * @returns DxfGeometryResult with rawRooms (name + area) or an error flag
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

    const texts: TextEntity[] = [];
    const polylines: PolylineData[] = [];

    // ── Extract TEXT / MTEXT entities ────────────────────────────────────────
    for (const entity of dxf.entities) {
      if (entity.type !== "TEXT" && entity.type !== "MTEXT") continue;
      try {
        const e = entity as unknown as DxfEntity;
        const text = cleanText(e.text ?? "");
        const pos = e.position ?? e.startPoint;
        if (text && pos) {
          texts.push({ text, point: new Flatten.Point(pos.x, pos.y) });
        }
      } catch {
        // skip malformed text entity
      }
    }

    // ── Extract LWPOLYLINE / POLYLINE entities ────────────────────────────────
    for (const entity of dxf.entities) {
      if (entity.type !== "LWPOLYLINE" && entity.type !== "POLYLINE") continue;
      try {
        const e = entity as unknown as DxfEntity;
        const verts = e.vertices ?? [];
        if (verts.length < 3) continue;

        const points = verts.map((v: { x: number; y: number }) => new Flatten.Point(v.x, v.y));

        // Auto-close if last vertex doesn't match first
        const first = points[0];
        const last = points[points.length - 1];
        if (first.x !== last.x || first.y !== last.y) {
          points.push(first);
        }

        const polygon = new Flatten.Polygon(points);
        polylines.push({ polygon, rawArea: polygon.area() });
      } catch {
        // skip malformed polyline
      }
    }

    const { factor, detected: unitsDetected } = detectUnits(polylines, insunits);

    const rawRooms: RawRoom[] = [];

    for (const { polygon, rawArea } of polylines) {
      const area = Math.round((rawArea / factor) * 100) / 100;

      if (area < MIN_ROOM_AREA) continue; // annotation / block, not a room

      // Collect all text labels whose insertion point lies inside this polygon
      const labelsInside: string[] = [];
      for (const { text, point } of texts) {
        if (polygon.contains(point)) {
          labelsInside.push(text);
        }
      }

      rawRooms.push({
        id: rawRooms.length + 1,
        name: pickLabel(labelsInside),
        area,
      });
    }

    return {
      success: true,
      rawRooms,
      totalRooms: rawRooms.length,
      unitsDetected,
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      rawRooms: [],
      totalRooms: 0,
      unitsDetected: "Unknown",
      timestamp,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
