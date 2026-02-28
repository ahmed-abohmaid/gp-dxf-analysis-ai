import { getCategoryBadgeClass } from "@/features/results/utils/results-format";

import { WithTooltip } from "./WithTooltip";

interface CategoryBadgeProps {
  category: string;
  loadsIncluded?: string | null;
  loadDensityVAm2?: number | null;
  codeReference?: string;
  acIncluded?: boolean | null;
}

export function CategoryBadge({
  category,
  loadsIncluded,
  loadDensityVAm2,
  codeReference,
  acIncluded,
}: CategoryBadgeProps) {
  const badge = (
    <span
      className={`inline-flex cursor-default items-center rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${getCategoryBadgeClass(category)}`}
    >
      {category}
    </span>
  );

  if (!loadsIncluded && loadDensityVAm2 == null) return badge;

  return (
    <WithTooltip
      trigger={
        <span
          className={`inline-flex cursor-help items-center rounded border px-1.5 py-0.5 font-mono text-xs font-semibold underline decoration-dotted underline-offset-2 ${getCategoryBadgeClass(category)}`}
        >
          {category}
        </span>
      }
      content={
        <div className="min-w-48 space-y-1.5 text-xs">
          {loadsIncluded && (
            <>
              <p className="font-semibold text-gray-200">Loads included</p>
              <p className="text-gray-300">{loadsIncluded}</p>
              <hr className="border-gray-600" />
            </>
          )}
          {loadDensityVAm2 != null && loadDensityVAm2 > 0 && (
            <p>
              <span className="text-gray-400">Density: </span>
              <span className="font-mono font-semibold text-blue-300">{loadDensityVAm2} VA/m²</span>
            </p>
          )}
          {acIncluded != null && (
            <p>
              <span className="text-gray-400">AC: </span>
              {acIncluded && loadsIncluded?.includes("no AC-excluded value found") ? (
                <span className="text-yellow-400">Standard value used ⚠</span>
              ) : acIncluded ? (
                <span className="text-green-400">Included ✓</span>
              ) : (
                <span className="text-orange-400">Excluded ✗</span>
              )}
            </p>
          )}
          {codeReference && (
            <p>
              <span className="text-gray-400">Source: </span>
              <span className="text-gray-300">{codeReference}</span>
            </p>
          )}
        </div>
      }
      side="right"
    />
  );
}
