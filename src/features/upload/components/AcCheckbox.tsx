"use client";

import { HelpCircle } from "lucide-react";

import { WithTooltip } from "@/features/results/components/WithTooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface AcCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function AcCheckbox({ checked, onChange }: AcCheckboxProps) {
  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <Checkbox
        id="include-ac"
        checked={checked}
        onCheckedChange={(value) => onChange(Boolean(value))}
      />
      <Label htmlFor="include-ac" className="cursor-pointer text-sm text-gray-700">
        Include Air Conditioning loads
      </Label>
    </div>
  );
}
