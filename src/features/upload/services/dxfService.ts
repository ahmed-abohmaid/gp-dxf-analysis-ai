import { EventStreamContentType, fetchEventSource } from "@microsoft/fetch-event-source";

import type { DxfProcessResult } from "@/shared/types/dxf";
import type { SseProgressData } from "@/shared/types/sse";

export type ProgressCallback = (step: string, index: number, total: number) => void;

export async function postProcessDxf(
  file: File,
  electricalCode = "DPS-01",
  includeAC = true,
  onProgress?: ProgressCallback,
): Promise<DxfProcessResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("electricalCode", electricalCode);
  body.append("includeAC", String(includeAC));

  let result: DxfProcessResult | null = null;
  let fatalError: Error | null = null;

  await fetchEventSource("/api/dxf", {
    method: "POST",
    body,
    headers: { Accept: "text/event-stream" },

    async onopen(response) {
      if (response.ok && response.headers.get("content-type")?.includes(EventStreamContentType)) {
        return;
      }

      // Pre-stream validation failures come back as JSON
      let message = `Request failed (${response.status})`;
      try {
        const errBody = (await response.json()) as { error?: string };
        if (errBody.error) message = errBody.error;
      } catch {
        // not JSON — keep the status-based message
      }
      fatalError = new Error(message);
      throw fatalError;
    },

    onmessage(ev) {
      if (ev.event === "progress" && onProgress) {
        const data = JSON.parse(ev.data) as SseProgressData;
        onProgress(data.step, data.index, data.total);
      } else if (ev.event === "result") {
        result = JSON.parse(ev.data) as DxfProcessResult;
      }
    },

    onerror(err: unknown) {
      // Re-throw to stop retries — we don't want auto-reconnect for a one-shot pipeline
      throw err;
    },

    // Disable auto-open on page visibility change — not useful for a single POST pipeline
    openWhenHidden: true,
  });

  if (fatalError) throw fatalError;
  if (!result) throw new Error("No result received from server");

  const finalResult: DxfProcessResult = result;
  if (!finalResult.success) throw new Error(finalResult.error ?? "Processing failed");
  return finalResult;
}
