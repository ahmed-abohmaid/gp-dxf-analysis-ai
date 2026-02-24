import { Zap } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SummaryCardProps {
  title: string;
  description: string;
  accentColor: "blue" | "gray";
  value: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
}

export function SummaryCard({
  title,
  description,
  accentColor,
  value,
  sub,
  action,
}: SummaryCardProps) {
  const stripe = accentColor === "blue" ? "bg-blue-500" : "bg-gray-300";
  const border =
    accentColor === "blue" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200";
  const iconBg = accentColor === "blue" ? "bg-blue-600" : "bg-gray-500";

  return (
    <Card className={`relative overflow-hidden border shadow-sm ${border}`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${stripe}`} />
      <CardHeader className="pl-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2.5 shadow-sm ${iconBg}`}>
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pl-6">
        {value}
        {sub}
      </CardContent>
    </Card>
  );
}
