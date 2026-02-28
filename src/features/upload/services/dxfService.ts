import { customFetch } from "@/services/customFetch";
import type { DxfProcessResult } from "@/shared/types/dxf";

export async function postProcessDxf(file: File, electricalCode = "DPS-01", includeAC = true) {
  const body = new FormData();
  body.append("file", file);
  body.append("electricalCode", electricalCode);
  body.append("includeAC", String(includeAC));

  const data = await customFetch<DxfProcessResult>("/api/dxf", {
    method: "POST",
    body,
  });

  if (!data.success) {
    throw new Error(data.error ?? "Processing failed");
  }

  return data;
}
