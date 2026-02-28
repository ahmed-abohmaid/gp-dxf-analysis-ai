"use client";

import { useState } from "react";

import { pushWarningToast } from "@/lib/utils/pushToasters";
import { useCustomMutation } from "@/hooks/useCustomMutation";
import type { DxfProcessResult } from "@/shared/types/dxf";

import { postProcessDxf } from "../services/dxfService";

export function useProcessDxf() {
  const [progressStep, setProgressStep] = useState<string | null>(null);

  const mutation = useCustomMutation<
    DxfProcessResult,
    { file: File; electricalCode: string; includeAC: boolean }
  >({
    mutationFn: ({ file, electricalCode, includeAC }) => {
      setProgressStep(null);
      return postProcessDxf(file, electricalCode, includeAC, (step) => setProgressStep(step));
    },
    successMessage: "Load calculation complete.",
    onSuccess: (data) => {
      setProgressStep(null);
      if (data.hasFailedRooms) {
        pushWarningToast(
          "Some rooms could not be classified by AI and are shown with empty load values.",
        );
      }
      if (data.warnings?.length) {
        for (const w of data.warnings) pushWarningToast(w);
      }
    },
  });

  return { ...mutation, progressStep };
}
