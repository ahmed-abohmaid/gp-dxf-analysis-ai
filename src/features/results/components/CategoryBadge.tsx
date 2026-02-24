import { getCategoryBadgeClass } from "@/features/results/utils/results-format";

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${getCategoryBadgeClass(category)}`}
    >
      {category}
    </span>
  );
}
