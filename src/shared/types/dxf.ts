// ── Wire types returned to the client ────────────────────────────────────────
// RawRoom and DxfGeometryResult are server-internal and live in
// server/dxf/processor.ts — they never cross the API boundary.

/** A room with AI-derived load values; sent over the wire to the client */
export interface DxfRoom {
  id: number;
  /** Room label from the DXF drawing (resolved if originally a ditto mark) */
  name: string;
  /** Normalised English room type derived by the AI (e.g. "Bedroom") */
  type: string;
  /** DPS-01 customer category assigned by the AI (e.g. "C1") */
  customerCategory: string;
  area: number; // m²
  /** Lighting load density used by AI (VA/m²); null when AI failed */
  lightingDensity: number | null; // VA/m²
  /** Sockets load density used by AI (VA/m²); null when AI failed */
  socketsDensity: number | null; // VA/m²
  /** null when AI classification failed for this room */
  lightingLoad: number | null; // VA
  /** null when AI classification failed for this room */
  socketsLoad: number | null; // VA
  /** Connected load = lightingLoad + socketsLoad; null when AI failed */
  connectedLoad: number | null; // VA
  /** Demand factor from DPS-01 tables (0–1); null when AI failed */
  demandFactor: number | null;
  /** Coincident factor from DPS-01 tables (0–1); null when AI failed */
  coincidentFactor: number | null;
  /** Demand load = connectedLoad × demandFactor × coincidentFactor; null when AI failed */
  demandLoad: number | null; // VA
  /** DPS-01 section reference returned by AI */
  codeReference: string;
  /** Set when AI could not classify this room */
  error?: string;
}

/** Per-category load breakdown for the building summary */
export interface CategoryBreakdown {
  /** DPS-01 customer category (e.g. "C1", "C2") */
  category: string;
  /** Human-readable category description */
  description: string;
  /** Number of rooms in this category */
  roomCount: number;
  /** Sum of connected loads for rooms in this category (VA) */
  connectedLoad: number;
  /** Average demand factor applied to this category */
  demandFactor: number;
  /** Average coincident factor applied to this category */
  coincidentFactor: number;
  /** Sum of demand loads for rooms in this category (VA) */
  demandLoad: number;
}

/** Final API response shape from POST /api/dxf */
export interface DxfProcessResult {
  success: boolean;
  rooms?: DxfRoom[];
  /** Total connected load in VA (sum of all rooms where AI succeeded) */
  totalConnectedLoad?: number;
  /** Total demand load in VA (after applying demand × coincident factors) */
  totalDemandLoad?: number;
  /** Total demand load in kVA */
  totalDemandLoadKVA?: number;
  /** Effective demand factor = totalDemandLoad / totalConnectedLoad */
  effectiveDemandFactor?: number;
  /** Per-category load breakdown */
  categoryBreakdown?: CategoryBreakdown[];
  totalRooms?: number;
  unitsDetected?: string;
  /** true when at least one room failed AI classification */
  hasFailedRooms?: boolean;
  timestamp: string;
  error?: string;
}
