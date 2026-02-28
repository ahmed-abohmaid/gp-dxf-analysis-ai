import React from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as toasters from "@/lib/utils/pushToasters";
import { useCustomMutation } from "@/hooks/useCustomMutation";

vi.mock("@/lib/utils/pushToasters", () => ({
  pushSuccessToast: vi.fn(),
  pushErrorToast: vi.fn(),
  pushInfoToast: vi.fn(),
  pushWarningToast: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useCustomMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires success toast when successMessage is set and mutation succeeds", async () => {
    const { result } = renderHook(
      () =>
        useCustomMutation({
          mutationFn: async () => "ok",
          successMessage: "Done!",
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(toasters.pushSuccessToast).toHaveBeenCalledWith("Done!");
    expect(toasters.pushErrorToast).not.toHaveBeenCalled();
  });

  it("does not fire success toast when successMessage is absent", async () => {
    const { result } = renderHook(() => useCustomMutation({ mutationFn: async () => "ok" }), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(toasters.pushSuccessToast).not.toHaveBeenCalled();
  });

  it("fires error toast when mutation fails and toastOnError is true (default)", async () => {
    const { result } = renderHook(
      () =>
        useCustomMutation({
          mutationFn: async () => {
            throw new Error("network error");
          },
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutate(undefined);
    });

    expect(toasters.pushErrorToast).toHaveBeenCalledWith("network error");
  });

  it("suppresses error toast when toastOnError is false", async () => {
    const { result } = renderHook(
      () =>
        useCustomMutation({
          mutationFn: async () => {
            throw new Error("silent error");
          },
          toastOnError: false,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutate(undefined);
    });

    expect(toasters.pushErrorToast).not.toHaveBeenCalled();
  });

  it("calls onSuccess callback after success toast", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useCustomMutation({
          mutationFn: async () => "data",
          successMessage: "Saved",
          onSuccess,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    // TanStack Query v5 passes an internal context object as 4th arg
    expect(onSuccess).toHaveBeenCalledWith("data", undefined, undefined, expect.any(Object));
    expect(toasters.pushSuccessToast).toHaveBeenCalled();
  });
});
