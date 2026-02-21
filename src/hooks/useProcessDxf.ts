"use client";

import { pushWarningToast } from "@/lib/utils/pushToasters";
import type { DxfProcessResult } from "@/shared/types/dxf";

import { useCustomMutation } from "./useCustomMutation";

async function postProcessDxf(file: File): Promise<DxfProcessResult> {
  const body = new FormData();
  body.append("file", file);

  const res = await fetch("/api/dxf", { method: "POST", body });
  const data: DxfProcessResult = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return data;
}

/**
 * Mutation hook for DXF processing.
 * Use `mutate(file)` or `mutateAsync(file)` at the call site.
 */
export function useProcessDxf() {
  return useCustomMutation<DxfProcessResult, File>({
    mutationFn: postProcessDxf,
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
