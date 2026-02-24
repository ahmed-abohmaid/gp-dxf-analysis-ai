import { BarChart3 } from "lucide-react";

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
import type { CategoryBreakdown } from "@/shared/types/dxf";

import { CategoryBadge } from "./CategoryBadge";

interface CategoryBreakdownTableProps {
  categoryBreakdown: CategoryBreakdown[];
}

export function CategoryBreakdownTable({ categoryBreakdown }: CategoryBreakdownTableProps) {
  if (categoryBreakdown.length === 0) return null;

  return (
    <Card className="border border-gray-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-gray-500" />
          <div>
            <CardTitle>Category Breakdown</CardTitle>
            <CardDescription>Load summary by DPS-01 customer category</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">Category</TableHead>
              <TableHead className="font-semibold">Description</TableHead>
              <TableHead className="text-right font-semibold">Rooms</TableHead>
              <TableHead className="text-right font-semibold">Connected (VA)</TableHead>
              <TableHead className="text-right font-semibold">Demand Factor</TableHead>
              <TableHead className="text-right font-semibold">Coincident Factor</TableHead>
              <TableHead className="text-right font-semibold">Demand Load (VA)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryBreakdown.map((cat) => (
              <TableRow key={cat.category} className="hover:bg-blue-50/40">
                <TableCell>
                  <CategoryBadge category={cat.category} />
                </TableCell>
                <TableCell className="text-sm">{cat.description}</TableCell>
                <TableCell className="text-right">{cat.roomCount}</TableCell>
                <TableCell className="text-right">{formatNumber(cat.connectedLoad, 0)}</TableCell>
                <TableCell className="text-right">{cat.demandFactor.toFixed(2)}</TableCell>
                <TableCell className="text-right">{cat.coincidentFactor.toFixed(2)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatNumber(cat.demandLoad, 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
