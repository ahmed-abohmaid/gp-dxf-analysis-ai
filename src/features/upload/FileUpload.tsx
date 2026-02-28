"use client";

import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { AcCheckbox } from "./components/AcCheckbox";
import { CoincidentFactorRow } from "./components/CoincidentFactorRow";
import { ElectricalCodeSelect } from "./components/ElectricalCodeSelect";
import { FileDropZone } from "./components/FileDropZone";

interface FileUploadProps {
  onFileSelect: (file: File, electricalCode: string, includeAC: boolean) => void;
  isProcessing: boolean;
  progressStep?: string | null;
}

export function FileUpload({ onFileSelect, isProcessing, progressStep }: FileUploadProps) {
  const [electricalCode, setElectricalCode] = useState("DPS-01");
  const [includeAC, setIncludeAC] = useState(true);

  return (
    <Card className="upload-card">
      <CardContent className="pt-6">
        <FileDropZone
          isProcessing={isProcessing}
          progressStep={progressStep}
          onProcess={(file) => onFileSelect(file, electricalCode, includeAC)}
        />
        <ElectricalCodeSelect value={electricalCode} onChange={setElectricalCode} />
        <AcCheckbox checked={includeAC} onChange={setIncludeAC} />
        <CoincidentFactorRow />
      </CardContent>
    </Card>
  );
}
