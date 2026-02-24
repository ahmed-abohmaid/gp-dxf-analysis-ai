import { customFetch } from "@/services/customFetch";
import type { DxfProcessResult } from "@/shared/types/dxf";

export async function postProcessDxf(file: File): Promise<DxfProcessResult> {
  const body = new FormData();
  body.append("file", file);

  const data = await customFetch<DxfProcessResult>("/api/dxf", {
    method: "POST",
    body,
  });

  if (!data.success) {
    throw new Error(data.error ?? "Processing failed");
  }

  return data;
}
