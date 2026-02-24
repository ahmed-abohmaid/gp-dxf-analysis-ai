import { formatNumber } from "@/lib/utils";

import { Dash } from "./Dash";
import { WithTooltip } from "./WithTooltip";

interface LoadCellProps {
  value: number | null;
  decimals?: number;
  /** AI-assigned load density (VA/m²) — shown in tooltip when provided */
  density?: number | null;
  area?: number;
  label?: string;
}

/**
 * Renders a numeric load cell.
 * When `density`, `area`, and `label` are all provided, shows the AI density
 * calculation (density × area) in a tooltip on the formatted value.
 */
export function LoadCell({ value, decimals = 0, density, area, label }: LoadCellProps) {
  if (value === null) return <Dash />;

  const formatted = formatNumber(value, decimals);

  if (density != null && area != null && label) {
    return (
      <WithTooltip
        trigger={
          <span className="cursor-help underline decoration-gray-400 decoration-dotted underline-offset-2">
            {formatted}
          </span>
        }
        content={
          <>
            <span className="font-medium">{label}:</span>{" "}
            <span className="font-mono text-blue-300">{formatNumber(density, 0)} VA/m²</span> ×{" "}
            {formatNumber(area, 2)} m²
          </>
        }
        contentClassName="text-xs"
      />
    );
  }

  return <>{formatted}</>;
}
