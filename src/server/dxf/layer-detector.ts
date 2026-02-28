// ── Layer detection patterns ────────────────────────────────────────────────

/** Patterns that identify polyline layers containing room boundaries */
const BOUNDARY_LAYER_PATTERNS = [/^boundary/i, /room.*bound/i, /area.*bound/i];

/** Patterns that identify text layers containing room name labels */
const TEXT_LAYER_PATTERNS = [/area.*iden/i, /room.*name/i, /room.*label/i, /area.*name/i];

/** Patterns for annotation/non-room text layers to skip */
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

export function isAnnotationLayer(layerName: string): boolean {
  return ANNOTATION_LAYER_BLACKLIST.some((p) => p.test(layerName));
}

/**
 * Auto-detect which layers to use for boundary polylines and text labels.
 * Falls back to all layers when no pattern matches.
 * Exported for unit testing.
 */
export function detectLayers(allLayers: string[]): { boundary: string[]; text: string[] } {
  const boundaryLayers = allLayers.filter((name) =>
    BOUNDARY_LAYER_PATTERNS.some((p) => p.test(name)),
  );
  const textLayers = allLayers.filter((name) => TEXT_LAYER_PATTERNS.some((p) => p.test(name)));

  const effectiveTextLayers =
    textLayers.length > 0 ? textLayers : allLayers.filter((name) => !isAnnotationLayer(name));

  return {
    boundary: boundaryLayers, // empty = use all layers (backward compat)
    text: effectiveTextLayers.length > 0 ? effectiveTextLayers : allLayers,
  };
}
