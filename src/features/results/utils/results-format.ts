const CATEGORY_COLOR_MAP: Record<string, string> = {
  C1: "bg-blue-100 text-blue-800 border-blue-200",
  C2: "bg-violet-100 text-violet-800 border-violet-200",
  C3: "bg-emerald-100 text-emerald-800 border-emerald-200",
  C4: "bg-amber-100 text-amber-800 border-amber-200",
};

export function getCategoryBadgeClass(category: string): string {
  return CATEGORY_COLOR_MAP[category] ?? "bg-gray-100 text-gray-700 border-gray-200";
}

export function extractShortCodeRef(reference: string): string {
  const match = reference.match(/Section\s+[\d.]+|Table\s+\d+/i);
  return match ? match[0] : reference.slice(0, 18);
}
