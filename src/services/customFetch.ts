export type FetchError = {
  message: string;
  status: number;
  errorBody?: unknown;
};

export async function customFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  isJsonResponse = true,
): Promise<T> {
  const isFormData = options.body instanceof FormData;

  const headers: HeadersInit = {
    ...(isFormData
      ? { Accept: "application/json" }
      : { "Content-Type": "application/json", Accept: "application/json" }),
    ...(options.headers || {}),
  };

  const response = await fetch(endpoint, {
    ...options,
    method: options.method || "GET",
    headers,
  });

  if (!response.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      // not JSON
    }

    const message =
      typeof errorBody === "object" &&
      errorBody !== null &&
      "message" in (errorBody as Record<string, unknown>)
        ? String((errorBody as Record<string, unknown>).message)
        : `Request failed (${response.status})`;

    const error: FetchError = { message, status: response.status, errorBody };
    throw error;
  }

  if (!isJsonResponse) {
    return response as unknown as T;
  }

  return (await response.json()) as T;
}
