import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface HeaderProps {
  showReset?: boolean;
  onReset?: () => void;
}

export function Header({ showReset = false, onReset }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-3 text-center sm:flex-row sm:items-center sm:text-left">
            <div className="mx-auto rounded-lg bg-white p-2 shadow-lg ring-1 ring-gray-200 sm:mx-0">
              <img
                src="/asu-logo.webp"
                alt="Ain Shams University logo — Electrical Load Estimation Dashboard"
                className="h-8 w-8 object-contain sm:h-10 sm:w-10"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl md:text-3xl">
                Ain Shams University Electrical Load Estimator
              </h1>
              <p className="mt-1 hidden text-xs text-gray-500 sm:block sm:text-sm">
                Ain Shams University Electrical Engineering senior design: AutoCAD DXF analysis and
                room-by-room electrical load estimation
              </p>
            </div>
          </div>

          <div className="w-full shrink-0 sm:w-auto">
            {showReset && onReset && (
              <div className="flex justify-center sm:justify-end">
                <Button onClick={onReset} variant="outline" size="lg" className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  New Analysis
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
