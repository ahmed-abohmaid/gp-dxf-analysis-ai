type ApiError = {
  message: string;
  statusCode?: number;
  field?: string;
};

export function normalizeError(err: unknown): ApiError {
  if (err instanceof Error) {
    return { message: err.message };
  }
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    return {
      message: (e.message as string) ?? "Unknown error",
      statusCode: e.statusCode as number | undefined,
      field: e.field as string | undefined,
    };
  }
  return { message: String(err) };
}
