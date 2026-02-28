const CATEGORY_COLOR_MAP: Record<string, string> = {
  // Residential
  C1: "bg-blue-100 text-blue-800 border-blue-200",
  C2: "bg-violet-100 text-violet-800 border-violet-200",
  C3: "bg-indigo-100 text-indigo-800 border-indigo-200",
  // Retail / Commercial
  C4: "bg-amber-100 text-amber-800 border-amber-200",
  C5: "bg-orange-100 text-orange-800 border-orange-200",
  // Educational / Institutional
  C6: "bg-emerald-100 text-emerald-800 border-emerald-200",
  C7: "bg-teal-100 text-teal-800 border-teal-200",
  C8: "bg-cyan-100 text-cyan-800 border-cyan-200",
  // Offices
  C9: "bg-sky-100 text-sky-800 border-sky-200",
  C10: "bg-blue-50 text-blue-700 border-blue-100",
  // Hospitality / Religion
  C11: "bg-violet-100 text-violet-800 border-violet-200",
  C12: "bg-pink-100 text-pink-800 border-pink-200",
  // Health / Sports
  C13: "bg-red-100 text-red-800 border-red-200",
  C14: "bg-lime-100 text-lime-800 border-lime-200",
  // Finance / Utilities
  C15: "bg-yellow-100 text-yellow-800 border-yellow-200",
  C16: "bg-green-100 text-green-800 border-green-200",
  // Industry / Special
  C17: "bg-purple-100 text-purple-800 border-purple-200",
  // Declared load (C18–C29) — muted
  C18: "bg-slate-100 text-slate-700 border-slate-200",
  C19: "bg-slate-100 text-slate-700 border-slate-200",
  C20: "bg-gray-100 text-gray-700 border-gray-200",
  C21: "bg-gray-100 text-gray-700 border-gray-200",
  C22: "bg-zinc-100 text-zinc-700 border-zinc-200",
  C23: "bg-zinc-100 text-zinc-700 border-zinc-200",
  C24: "bg-neutral-100 text-neutral-700 border-neutral-200",
  C25: "bg-neutral-100 text-neutral-700 border-neutral-200",
  C26: "bg-stone-100 text-stone-700 border-stone-200",
  C27: "bg-stone-100 text-stone-700 border-stone-200",
  C28: "bg-slate-50 text-slate-600 border-slate-100",
  C29: "bg-slate-50 text-slate-600 border-slate-100",
};

export function getCategoryBadgeClass(category: string): string {
  return CATEGORY_COLOR_MAP[category] ?? "bg-gray-100 text-gray-700 border-gray-200";
}

export function extractShortCodeRef(reference: string): string {
  const match = reference.match(/Section\s+[\d.]+|Table\s+\d+/i);
  return match ? match[0] : reference.slice(0, 18);
}
