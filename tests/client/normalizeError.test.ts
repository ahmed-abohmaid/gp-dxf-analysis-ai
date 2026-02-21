import { describe, expect, it } from "vitest";

import { normalizeError } from "@/lib/utils/normalizeError";

describe("normalizeError", () => {
  it("handles Error instances", () => {
    const err = new Error("something went wrong");
    expect(normalizeError(err)).toEqual({ message: "something went wrong" });
  });

  it("handles Error with no message", () => {
    const err = new Error("");
    expect(normalizeError(err)).toEqual({ message: "" });
  });

  it("handles plain object with message only", () => {
    expect(normalizeError({ message: "bad request" })).toEqual({
      message: "bad request",
      statusCode: undefined,
      field: undefined,
    });
  });

  it("handles plain object with all fields", () => {
    expect(normalizeError({ message: "invalid", statusCode: 422, field: "email" })).toEqual({
      message: "invalid",
      statusCode: 422,
      field: "email",
    });
  });

  it("handles plain object without message — falls back to 'Unknown error'", () => {
    expect(normalizeError({ statusCode: 500 })).toEqual({
      message: "Unknown error",
      statusCode: 500,
      field: undefined,
    });
  });

  it("handles string errors", () => {
    expect(normalizeError("timeout")).toEqual({ message: "timeout" });
  });

  it("handles null — treated as object, falls back to Unknown error", () => {
    // null is filtered out by the `err !== null` guard → falls to String(null) = 'null'
    expect(normalizeError(null)).toEqual({ message: "null" });
  });

  it("handles undefined", () => {
    expect(normalizeError(undefined)).toEqual({ message: "undefined" });
  });

  it("handles empty object {}", () => {
    expect(normalizeError({})).toEqual({
      message: "Unknown error",
      statusCode: undefined,
      field: undefined,
    });
  });

  it("handles numeric error codes", () => {
    expect(normalizeError(404)).toEqual({ message: "404" });
  });
});
