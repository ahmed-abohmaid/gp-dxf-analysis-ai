"use client";

import { useRef, useState } from "react";

import { FileText, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_UPLOAD_SIZE_MB } from "@/shared/constants";

import { validateDxfFile } from "../utils/validateDxfFile";

interface FileDropZoneProps {
  isProcessing: boolean;
  onProcess: (file: File) => void;
}

export function FileDropZone({ isProcessing, onProcess }: FileDropZoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File): void {
    const error = validateDxfFile(file);
    setValidationError(error);
    if (!error) setSelectedFile(file);
  }

  function handleDrag(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleRemove(): void {
    setSelectedFile(null);
    setValidationError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <div
        className={cn(
          "relative rounded-lg border-2 border-dashed p-8 text-center transition-all duration-300",
          dragActive
            ? "scale-[1.02] border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
          isProcessing && "pointer-events-none opacity-50",
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".dxf"
          disabled={isProcessing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {!selectedFile ? (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <Upload className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900">Drop your DXF file here</p>
              <p className="mt-1 text-sm text-gray-500">
                or click to browse &mdash; max {MAX_UPLOAD_SIZE_MB} MB
              </p>
            </div>
            <Button onClick={() => inputRef.current?.click()} size="lg">
              Select File
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 rounded-lg bg-gray-50 p-4">
              <FileText className="h-8 w-8 text-blue-600" />
              <div className="flex-1 text-left">
                <p className="font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{(selectedFile.size / 1024).toFixed(2)} KB</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemove}
                disabled={isProcessing}
                aria-label="Remove file"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <Button
              onClick={() => onProcess(selectedFile)}
              disabled={isProcessing}
              size="lg"
              className="w-full"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysing drawing...
                </span>
              ) : (
                "Process File"
              )}
            </Button>
          </div>
        )}
      </div>

      {validationError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {validationError}
        </p>
      )}
    </>
  );
}
