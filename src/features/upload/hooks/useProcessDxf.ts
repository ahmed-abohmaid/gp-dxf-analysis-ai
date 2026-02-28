"use client";

import { pushWarningToast } from "@/lib/utils/pushToasters";
import { useCustomMutation } from "@/hooks/useCustomMutation";
import type { DxfProcessResult } from "@/shared/types/dxf";

import { postProcessDxf } from "../services/dxfService";

export function useProcessDxf() {
  return useCustomMutation<
    DxfProcessResult,
    { file: File; electricalCode: string; includeAC: boolean }
  >({
    mutationFn: ({ file, electricalCode, includeAC }) =>
      postProcessDxf(file, electricalCode, includeAC),
    successMessage: "Load calculation complete.",
    onSuccess: (data) => {
      if (data.hasFailedRooms) {
        pushWarningToast(
          "Some rooms could not be classified by AI and are shown with empty load values.",
        );
      }
    },
  });
}
