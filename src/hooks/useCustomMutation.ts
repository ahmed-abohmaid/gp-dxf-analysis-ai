"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import { normalizeError } from "@/lib/utils/normalizeError";
import { pushErrorToast, pushSuccessToast } from "@/lib/utils/pushToasters";

type UseCustomMutationOptions<TData, TVariables> = UseMutationOptions<TData, Error, TVariables> & {
  /** Auto-show success toast message on mutation success */
  successMessage?: string;
  /** Auto-show error toast on failure (default: true) */
  toastOnError?: boolean;
};

export function useCustomMutation<TData = unknown, TVariables = void>({
  successMessage,
  toastOnError = true,
  ...options
}: UseCustomMutationOptions<TData, TVariables>) {
  return useMutation<TData, Error, TVariables>({
    ...options,
    onSuccess(...args) {
      if (successMessage) pushSuccessToast(successMessage);
      options.onSuccess?.(...args);
    },
    onError(err, ...args) {
      if (toastOnError) {
        const normalized = normalizeError(err);
        pushErrorToast(normalized.message);
      }
      options.onError?.(err, ...args);
    },
  });
}
