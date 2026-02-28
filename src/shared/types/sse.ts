export interface SseProgressData {
  step: string;
  index: number;
  total: number;
}

export type SseEventName = "progress" | "result";
