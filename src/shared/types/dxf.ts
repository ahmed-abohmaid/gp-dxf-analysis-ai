// ── Wire types returned to the client ────────────────────────────────────────
// RawRoom and DxfGeometryResult are server-internal and live in
// server/dxf/processor.ts — they never cross the API boundary.

/** A room with AI-derived load values; sent over the wire to the client */
export interface DxfRoom {
  id: number;
  /** Original label from the DXF drawing */
  name: string;
  /** Normalised English room type derived by the AI (e.g. "Bedroom") */
  type: string;
  area: number; // m²
  /** null when AI classification failed for this room */
  lightingLoad: number | null; // VA
  /** null when AI classification failed for this room */
  socketsLoad: number | null; // VA
  /** null when AI classification failed for this room */
  totalLoad: number | null; // VA
  /** SBC 401 section reference returned by AI */
  codeReference: string;
  /** Set when AI could not classify this room */
  error?: string;
}

/** Final API response shape from POST /api/process-dxf */
export interface DxfProcessResult {
  success: boolean;
  rooms?: DxfRoom[];
  totalLoad?: number; // VA (only rooms where AI succeeded)
  totalLoadKVA?: number;
  totalRooms?: number;
  unitsDetected?: string;
  /** true when at least one room failed AI classification */
  hasFailedRooms?: boolean;
  timestamp: string;
  error?: string;
}
