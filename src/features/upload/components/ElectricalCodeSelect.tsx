import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ElectricalCodeSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function ElectricalCodeSelect({ value, onChange }: ElectricalCodeSelectProps) {
  return (
    <div className="mt-4 space-y-1.5">
      <Label
        htmlFor="electrical-code"
        className="text-xs font-semibold tracking-wide text-gray-500 uppercase"
      >
        Electrical Code
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="electrical-code" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="DPS-01">Saudi Code (SBC / DPS-01)</SelectItem>
          <SelectItem value="EG" disabled className="cursor-not-allowed opacity-50">
            <span className="flex items-center gap-2">
              Egyptian Code
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                Coming soon
              </span>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
