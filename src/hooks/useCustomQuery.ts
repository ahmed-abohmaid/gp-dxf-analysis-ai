// @future: needed when read-only data queries are added (e.g. saved projects, history)
"use client";

import { useEffect } from "react";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { normalizeError } from "@/lib/utils/normalizeError";
import { pushErrorToast } from "@/lib/utils/pushToasters";

type UseCustomQueryOptions<TData> = Omit<UseQueryOptions<TData, Error, TData>, "queryKey"> & {
  queryKey: string[];
  /** Auto-show error toast on failure (default: true) */
  toastOnError?: boolean;
};

export function useCustomQuery<TData = unknown>({
  toastOnError = true,
  ...options
}: UseCustomQueryOptions<TData>) {
  const result = useQuery<TData, Error>({ ...options });

  useEffect(() => {
    if (result.error && toastOnError) {
      const normalized = normalizeError(result.error);
      pushErrorToast(normalized.message);
    }
  }, [result.error, toastOnError]);

  return result;
}
