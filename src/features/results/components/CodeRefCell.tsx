import { BookOpen } from "lucide-react";

import { extractShortCodeRef } from "@/features/results/utils/results-format";

import { Dash } from "./Dash";
import { WithTooltip } from "./WithTooltip";

interface CodeRefCellProps {
  reference: string;
  /** When set, displays the error instead of the reference */
  error?: string;
}

export function CodeRefCell({ reference, error }: CodeRefCellProps) {
  if (error) return <span className="text-xs text-red-500">{error}</span>;
  if (!reference) return <Dash />;

  return (
    <WithTooltip
      trigger={
        <span className="inline-flex cursor-help items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 transition-colors hover:bg-gray-200">
          <BookOpen className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="max-w-32 truncate">{extractShortCodeRef(reference)}</span>
        </span>
      }
      content={reference}
      contentClassName="max-w-72 text-xs leading-relaxed"
    />
  );
}
