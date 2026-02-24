/**
 * Normalise a room label to a stable lookup key.
 * Used across the pipeline to ensure consistent map lookups between the
 * processor, service layer, and AI classifier.
 */
export function normalizeRoomKey(label: string): string {
  return label.toUpperCase().trim();
}
