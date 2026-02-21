"use client";

import { FileText, RotateCcw, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatKVA, formatNumber } from "@/lib/utils";
import type { DxfProcessResult, DxfRoom } from "@/shared/types/dxf";

interface ResultsDisplayProps {
  results: DxfProcessResult;
  onReset: () => void;
}

export function ResultsDisplay({ results, onReset }: ResultsDisplayProps) {
  const rooms = results.rooms ?? [];
  const totalLoad = results.totalLoad ?? 0;
  const totalLoadKVA = results.totalLoadKVA ?? totalLoad / 1000;

  return (
    <div className="animate-in space-y-6">
      {/* Summary card */}
      <Card className="summary-card border-2 border-blue-200 bg-linear-to-br from-blue-50 to-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-600 p-3">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">Total Building Load</CardTitle>
                <CardDescription>Calculated from {rooms.length} rooms</CardDescription>
              </div>
            </div>
            <Button onClick={onReset} variant="outline" size="sm" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              New Analysis
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold text-blue-600">{formatKVA(totalLoad)} kVA</div>
          <p className="mt-2 text-sm text-gray-500">
            {formatNumber(totalLoad, 0)} Watts ({formatNumber(totalLoadKVA, 2)} kVA)
          </p>
        </CardContent>
      </Card>

      {/* Room breakdown table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-gray-600" />
            <CardTitle>Room Load Breakdown</CardTitle>
          </div>
          <CardDescription>Detailed electrical load estimation by room</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">#</TableHead>
                <TableHead className="font-semibold">Room Name</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="text-right font-semibold">Area (m²)</TableHead>
                <TableHead className="text-right font-semibold">Lighting (W)</TableHead>
                <TableHead className="text-right font-semibold">Sockets (W)</TableHead>
                <TableHead className="text-right font-semibold">Total Load (W)</TableHead>
                <TableHead className="font-semibold">Code Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room: DxfRoom) => (
                <TableRow
                  key={room.id}
                  className={
                    room.error ? "bg-red-50/60 hover:bg-red-100/60" : "hover:bg-blue-50/50"
                  }
                >
                  <TableCell className="font-medium">{room.id}</TableCell>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        room.error ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {room.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(room.area, 2)}</TableCell>
                  <TableCell className="text-right">
                    {room.lightingLoad !== null ? (
                      formatNumber(room.lightingLoad, 0)
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {room.socketsLoad !== null ? (
                      formatNumber(room.socketsLoad, 0)
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {room.totalLoad !== null ? (
                      formatNumber(room.totalLoad, 0)
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-xs text-gray-500">
                    {room.error ? (
                      <span className="text-red-500">{room.error}</span>
                    ) : room.codeReference ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="truncate">{room.codeReference}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">{room.codeReference}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-gray-50 font-semibold">
                <TableCell colSpan={6} className="text-right">
                  Total Building Load:
                </TableCell>
                <TableCell className="text-right text-blue-600">
                  {formatNumber(totalLoad, 0)} W
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
