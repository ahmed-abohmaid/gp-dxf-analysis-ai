import { HelpCircle } from "lucide-react";

import { WithTooltip } from "@/features/results/components/WithTooltip";

export function CoincidentFactorRow() {
  return (
    <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 opacity-50">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Full Building</span>
        <WithTooltip
          trigger={<HelpCircle className="h-3.5 w-3.5 cursor-help text-gray-400" />}
          content={
            <div className="max-w-64 space-y-1.5 text-xs leading-relaxed">
              <p>
                Accounts for load diversity across multiple KWH meters fed by one transformer.
                Requires all building floor plans to determine meter count (N).
              </p>
              <p>
                <span className="font-medium">Formula:</span> CF(N) = (0.67 + 0.33 / √N) / 1.25
              </p>
              <p className="text-gray-400">Currently fixed at N=1 → CF=1.0 (no reduction).</p>
            </div>
          }
          side="right"
        />
      </div>
      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
        Coming soon
      </span>
    </div>
  );
}
