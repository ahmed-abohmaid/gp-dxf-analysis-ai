"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatKVA, formatNumber } from "@/lib/utils";
import type { DxfProcessResult } from "@/shared/types/dxf";

import { CategoryBreakdownTable } from "./components/CategoryBreakdownTable";
import { RoomBreakdownTable } from "./components/RoomBreakdownTable";
import { SummaryCard } from "./components/SummaryCard";

// ── Component ─────────────────────────────────────────────────────────────────

interface ResultsDisplayProps {
  results: DxfProcessResult;
  onReset: () => void;
}

export function ResultsDisplay({ results, onReset }: ResultsDisplayProps) {
  const rooms = results.rooms ?? [];
  const totalConnectedLoad = results.totalConnectedLoad ?? 0;
  const totalDemandLoad = results.totalDemandLoad ?? totalConnectedLoad;
  const totalDemandLoadKVA = results.totalDemandLoadKVA ?? totalDemandLoad / 1000;
  const effectiveDemandFactor = results.effectiveDemandFactor ?? 1;
  const categoryBreakdown = results.categoryBreakdown ?? [];

  return (
    <div className="animate-in space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard
          title="Total Demand Load"
          description="After demand & coincident factors"
          accentColor="blue"
          action={
            <Button onClick={onReset} variant="outline" size="sm" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              New Analysis
            </Button>
          }
          value={
            <div className="text-5xl font-bold tracking-tight text-blue-600">
              {formatKVA(totalDemandLoad)}{" "}
              <span className="text-2xl font-medium text-blue-400">kVA</span>
            </div>
          }
          sub={
            <>
              <p className="mt-2 text-sm text-gray-500">
                {formatNumber(totalDemandLoad, 0)} VA ({formatNumber(totalDemandLoadKVA, 2)} kVA)
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Effective demand factor: {(effectiveDemandFactor * 100).toFixed(0)}%
              </p>
            </>
          }
        />
        <SummaryCard
          title="Total Connected Load"
          description={`Sum of all room loads (${rooms.length} rooms)`}
          accentColor="gray"
          value={
            <div className="text-3xl font-bold tracking-tight text-gray-700">
              {formatKVA(totalConnectedLoad)}{" "}
              <span className="text-xl font-medium text-gray-400">kVA</span>
            </div>
          }
          sub={
            <p className="mt-2 text-sm text-gray-500">{formatNumber(totalConnectedLoad, 0)} VA</p>
          }
        />
      </div>

      <CategoryBreakdownTable categoryBreakdown={categoryBreakdown} />

      <RoomBreakdownTable
        rooms={rooms}
        totalConnectedLoad={totalConnectedLoad}
        totalDemandLoad={totalDemandLoad}
      />
    </div>
  );
}
