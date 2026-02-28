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
  /**
   * Combined VA/m² — from DPS-01 Table 8 (AI Phase 2 extracted).
   * For C1/C2: effective density computed by server-side cross-multiplication.
   * For C18–C29 declared load: null.
   */
  loadDensityVAm2: number | null;
  /**
   * What loads the VA/m² figure covers — AI-extracted from code table header/footnotes.
   * Example: "Lights + Air Conditioning + Power Sockets".
   * Used directly in the UI category hover tooltip.
   */
  loadsIncluded: string | null;
  /**
   * true  = VA/m² includes AC (DPS-01 Table 8 standard value)
   * false = VA/m² is lights + sockets only
   * null  = not determined (classification failed or declared load method)
   */
  acIncluded: boolean | null;
  /** Connected load = loadDensityVAm2 × area; null when AI failed */
  connectedLoad: number | null; // VA
  /** Demand factor from DPS-01 Table 11 (0–1); null when AI failed */
  demandFactor: number | null;
  /** Demand load = connectedLoad × demandFactor; null when AI failed */
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
  /** Coincident factor applied at building summary level */
  coincidentFactor: number;
  /** Sum of demand loads for rooms in this category (VA) */
  demandLoad: number;
  /** Representative VA/m² density for this category (from AI Phase 2) */
  loadDensityVAm2: number;
  /** Loads included description from DPS-01 (AI Phase 2 extracted) */
  loadsIncluded: string;
  /** true = VA/m² includes AC; false = lights + sockets only; null = not determined */
  acIncluded: boolean | null;
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
  /** Building-level coincident factor (CF = 1.0 for single KWH meter) */
  coincidentFactor?: number;
  /** Per-category load breakdown */
  categoryBreakdown?: CategoryBreakdown[];
  totalRooms?: number;
  unitsDetected?: string;
  /** true when at least one room failed AI classification */
  hasFailedRooms?: boolean;
  timestamp: string;
  error?: string;
}
