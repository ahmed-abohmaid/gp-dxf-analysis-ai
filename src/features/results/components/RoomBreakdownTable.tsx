import { FileText } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import { DECLARED_LOAD_CATEGORIES_RE, isC1orC2 } from "@/shared/constants";
import type { DxfRoom } from "@/shared/types/dxf";

import { CategoryBadge } from "./CategoryBadge";
import { CodeRefCell } from "./CodeRefCell";
import { Dash } from "./Dash";
import { FactorCell } from "./FactorCell";
import { LoadCell } from "./LoadCell";

interface RoomBreakdownTableProps {
  rooms: DxfRoom[];
  totalConnectedLoad: number;
  totalDemandLoad: number;
}

export function RoomBreakdownTable({
  rooms,
  totalConnectedLoad,
  totalDemandLoad,
}: RoomBreakdownTableProps) {
  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-gray-500" />
          <div>
            <CardTitle>Room Load Breakdown</CardTitle>
            <CardDescription>
              DPS-01 room-by-room load estimation — hover category badge for loads included, hover
              connected load for density calculation
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">#</TableHead>
              <TableHead className="font-semibold">Room Name</TableHead>
              <TableHead className="font-semibold">Type</TableHead>
              <TableHead className="font-semibold">Cat.</TableHead>
              <TableHead className="text-right font-semibold">Area (m²)</TableHead>
              <TableHead className="text-right font-semibold">VA/m²</TableHead>
              <TableHead className="text-right font-semibold">Connected (VA)</TableHead>
              <TableHead className="text-right font-semibold">DF</TableHead>
              <TableHead className="text-right font-semibold">Demand (VA)</TableHead>
              <TableHead className="font-semibold">Code Ref</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room: DxfRoom) => (
              <TableRow
                key={room.id}
                className={room.error ? "bg-red-50/60 hover:bg-red-100/60" : "hover:bg-blue-50/40"}
              >
                <TableCell className="text-xs text-gray-400">{room.id}</TableCell>
                <TableCell className="font-medium">{room.name}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      room.error ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {room.type}
                  </span>
                </TableCell>
                <TableCell>
                  {room.customerCategory ? (
                    <CategoryBadge
                      category={room.customerCategory}
                      loadsIncluded={room.loadsIncluded}
                      loadDensityVAm2={room.loadDensityVAm2}
                      codeReference={room.codeReference}
                      acIncluded={room.acIncluded}
                    />
                  ) : (
                    <Dash />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(room.area, 2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <DensityCell room={room} />
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  <LoadCell
                    value={room.connectedLoad}
                    density={room.loadDensityVAm2}
                    area={room.area}
                    label="Combined"
                  />
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  <FactorCell value={room.demandFactor} />
                </TableCell>
                <TableCell className="text-right font-semibold text-blue-600 tabular-nums">
                  <LoadCell value={room.demandLoad} />
                </TableCell>
                <TableCell>
                  <CodeRefCell reference={room.codeReference} error={room.error} />
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-gray-50 font-semibold">
              <TableCell colSpan={6} className="text-right text-sm">
                Total Connected Load:
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(totalConnectedLoad, 0)} VA
              </TableCell>
              <TableCell className="text-right text-sm">Total Demand Load:</TableCell>
              <TableCell className="text-right text-blue-600 tabular-nums">
                {formatNumber(totalDemandLoad, 0)} VA
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DensityCell({ room }: { room: DxfRoom }) {
  if (!room.customerCategory) return <Dash />;

  const category = room.customerCategory;
  const isDeclared = DECLARED_LOAD_CATEGORIES_RE.test(category);

  if (isDeclared) {
    return (
      <span className="cursor-default text-xs text-gray-400" title="Declared Load Method">
        —
      </span>
    );
  }

  if (room.loadDensityVAm2 == null) return <Dash />;

  return (
    <span className="tabular-nums">
      {formatNumber(room.loadDensityVAm2, 0)}
      {isC1orC2(category) && (
        <span
          className="ml-0.5 text-[10px] text-gray-400"
          title="Effective density from DPS-01 Table 4/6 interpolation"
        >
          *
        </span>
      )}
    </span>
  );
}
