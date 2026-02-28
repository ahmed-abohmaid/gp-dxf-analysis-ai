import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from "@/shared/constants";
import type { DxfProcessResult } from "@/shared/types/dxf";

function errorResponse(message: string, status: number): Response {
  const result: DxfProcessResult = {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  };
  return Response.json(result, { status });
}

export async function validateDxfRequest(
  req: Request,
): Promise<{ error: Response } | { content: string; includeAC: boolean; electricalCode: string }> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return { error: errorResponse("Invalid request: could not parse form data", 400) };
  }

  const electricalCode = String(formData.get("electricalCode") ?? "DPS-01");
  const includeAC = formData.get("includeAC") !== "false";

  if (electricalCode !== "DPS-01") {
    return {
      error: errorResponse(
        `Electrical code "${electricalCode}" is not yet supported. Only DPS-01 is available.`,
        400,
      ),
    };
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: errorResponse("No file provided — include a 'file' field", 400) };
  }
  if (!file.name.toLowerCase().endsWith(".dxf")) {
    return { error: errorResponse("Only .dxf files are accepted", 400) };
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      error: errorResponse(
        `File exceeds ${MAX_UPLOAD_SIZE_MB} MB limit (received ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        400,
      ),
    };
  }
  if (file.size === 0) {
    return { error: errorResponse("File is empty", 400) };
  }

  let content: string;
  try {
    content = await file.text();
  } catch {
    return { error: errorResponse("Could not read file content", 422) };
  }

  return { content, includeAC, electricalCode };
}

export { errorResponse };
