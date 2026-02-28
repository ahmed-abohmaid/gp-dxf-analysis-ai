import Flatten from "@flatten-js/core";
import DxfParser from "dxf-parser";

import { detectLayers } from "@/server/dxf/layer-detector";
import { cleanText, type TextEntity } from "@/server/dxf/text-matcher";

// ── Private types ───────────────────────────────────────────────────────────

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

// ── Public types ────────────────────────────────────────────────────────────

export interface ParsedDxf {
  insunits: number | undefined;
  layersUsed: { boundary: string[]; text: string[] };
  texts: TextEntity[];
  lwPolylineVerts: Array<Array<{ x: number; y: number }>>;
  legacyPolylineVerts: Array<Array<{ x: number; y: number }>>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractLayerNames(dxf: {
  tables?: { layer?: { layers?: Record<string, unknown> } };
}): string[] {
  const layerTable = dxf.tables?.layer?.layers;
  if (layerTable == null || typeof layerTable !== "object") return [];
  return Object.keys(layerTable as object);
}

function isOnLayer(entity: { layer?: string }, allowedLayers: string[]): boolean {
  if (allowedLayers.length === 0) return true;
  const entityLayer = (entity.layer ?? "").trim();
  return allowedLayers.some(
    (allowed) => allowed.localeCompare(entityLayer, undefined, { sensitivity: "accent" }) === 0,
  );
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse DXF content and extract all entities in a single pass.
 * Handles layer detection internally.
 * Bulge factors treated as straight lines (2-5% area error for arch curves).
 * @future: convert bulge factors to arc segments for exact area calculation
 */
export function parseDxfContent(content: string): ParsedDxf {
  const parser = new DxfParser();
  const dxf = parser.parseSync(content);

  if (dxf == null || dxf.entities == null) {
    throw new Error("Invalid DXF file: missing entity data");
  }

  const insunits =
    typeof dxf.header?.$INSUNITS === "number" ? (dxf.header.$INSUNITS as number) : undefined;

  const allLayers = extractLayerNames(dxf);
  const layersUsed = detectLayers(allLayers);

  const texts: TextEntity[] = [];
  const lwPolylineVerts: Array<Array<{ x: number; y: number }>> = [];
  const legacyPolylineVerts: Array<Array<{ x: number; y: number }>> = [];

  for (const entity of dxf.entities) {
    const e = entity as unknown as DxfEntity;
    try {
      if (e.type === "TEXT" || e.type === "MTEXT") {
        if (isOnLayer(e, layersUsed.text) === false) continue;
        const text = cleanText(e.text ?? "");
        const pos = e.position ?? e.startPoint;
        if (text && pos) {
          texts.push({ text, point: new Flatten.Point(pos.x, pos.y), matched: false });
        }
      } else if (e.type === "LWPOLYLINE") {
        if (isOnLayer(e, layersUsed.boundary)) {
          lwPolylineVerts.push(e.vertices ?? []);
        }
      } else if (e.type === "POLYLINE") {
        // Skip 3D meshes — only process 2D polylines
        if (e.shape !== true && isOnLayer(e, layersUsed.boundary)) {
          legacyPolylineVerts.push(e.vertices ?? []);
        }
      }
    } catch {
      // skip malformed entity
    }
  }

  return { insunits, layersUsed, texts, lwPolylineVerts, legacyPolylineVerts };
}
