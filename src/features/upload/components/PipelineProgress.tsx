import { CheckCircle2, Loader2 } from "lucide-react";

const PIPELINE_STEPS = [
  "Parsing DXF geometry",
  "Retrieving Saudi code context",
  "Analyzing rooms with AI",
  "Computing final loads",
] as const;

interface PipelineProgressProps {
  currentStep: string | null | undefined;
}

export function PipelineProgress({ currentStep }: PipelineProgressProps) {
  const currentIdx = PIPELINE_STEPS.indexOf(currentStep as (typeof PIPELINE_STEPS)[number]);

  return (
    <div className="mt-2 space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs">
      {PIPELINE_STEPS.map((step, stepIdx) => {
        const isDone = currentIdx > stepIdx;
        const isActive = currentIdx === stepIdx;

        return (
          <div
            key={step}
            className={`flex items-center gap-2 transition-colors ${
              isDone ? "text-emerald-600" : isActive ? "font-medium text-blue-700" : "text-gray-400"
            }`}
          >
            {isDone ? (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            ) : isActive ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <span className="h-3 w-3 shrink-0 rounded-full border border-gray-300" />
            )}
            {step}
          </div>
        );
      })}
    </div>
  );
}
