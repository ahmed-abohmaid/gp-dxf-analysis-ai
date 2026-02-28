import Flatten from "@flatten-js/core";

import type { PolylineData } from "@/server/dxf/text-matcher";

/** If average sample area exceeds this threshold, drawing units are millimetres */
const MM_THRESHOLD = 500_000;
/** Divide raw mm² areas by this factor to get m² */
const MM_FACTOR = 1_000_000;
/** Polygons smaller than this (m²) are annotations or blocks, not rooms */
export const MIN_ROOM_AREA = 0.2;

/**
 * Build a polygon from a list of vertices shared by LWPOLYLINE and POLYLINE.
 * Math.abs — Flatten.js returns signed area for CW-wound polygons; we want unsigned.
 */
export function buildPolygon(verts: Array<{ x: number; y: number }>): PolylineData | null {
  if (verts.length < 3) return null;

  const points = verts.map((v) => new Flatten.Point(v.x, v.y));

  const first = points[0];
  const last = points[points.length - 1];
  if (first.x !== last.x || first.y !== last.y) {
    points.push(first);
  }

  const polygon = new Flatten.Polygon(points);
  return { polygon, rawArea: Math.abs(polygon.area()) };
}

function polylineDeduplicationKey({ polygon, rawArea }: PolylineData): string {
  const box = polygon.box;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `${r(box.xmin)},${r(box.ymin)},${r(box.xmax)},${r(box.ymax)},${r(rawArea)}`;
}

export function detectUnits(
  polylines: PolylineData[],
  insunits?: number,
): { factor: number; detected: string } {
  const significantPolylines = polylines.filter((p) => p.rawArea > 1);
  const samples = significantPolylines.slice(0, 5).map((p) => p.rawArea);

  if (samples.length === 0) {
    return { factor: 1, detected: "Meters / Units (Scale 1:1)" };
  }

  const avg = samples.reduce((s, a) => s + a, 0) / samples.length;

  if (avg > MM_THRESHOLD || insunits === 4) {
    return { factor: MM_FACTOR, detected: "Millimeters (dividing by 1 000 000)" };
  }

  return { factor: 1, detected: "Meters / Units (Scale 1:1)" };
}

/**
 * Build, deduplicate, and return unique room polygons from raw vertex arrays.
 * LWPOLYLINE entries are placed first so dedup keeps them over legacy POLYLINE.
 */
export function buildRoomPolygons(
  lwPolylineVerts: Array<Array<{ x: number; y: number }>>,
  legacyPolylineVerts: Array<Array<{ x: number; y: number }>>,
): PolylineData[] {
  const polylines: PolylineData[] = [];

  for (const verts of [...lwPolylineVerts, ...legacyPolylineVerts]) {
    if (verts.length >= 3) {
      // Cheap bbox pre-filter — skip obvious annotation-sized polygons
      let xMin = verts[0].x,
        xMax = verts[0].x;
      let yMin = verts[0].y,
        yMax = verts[0].y;
      for (const v of verts) {
        if (v.x < xMin) xMin = v.x;
        if (v.x > xMax) xMax = v.x;
        if (v.y < yMin) yMin = v.y;
        if (v.y > yMax) yMax = v.y;
      }
      if ((xMax - xMin) * (yMax - yMin) < MIN_ROOM_AREA) continue;
    }
    try {
      const poly = buildPolygon(verts);
      if (poly) polylines.push(poly);
    } catch {
      // skip malformed polyline
    }
  }

  // Deduplicate: DXF exports often emit the same boundary on multiple layers
  const seen = new Map<string, true>();
  const unique: PolylineData[] = [];
  for (const poly of polylines) {
    const key = polylineDeduplicationKey(poly);
    if (!seen.has(key)) {
      seen.set(key, true);
      unique.push(poly);
    }
  }

  return unique;
}
