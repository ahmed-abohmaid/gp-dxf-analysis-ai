import { describe, expect, it } from "vitest";

import { normalizeRoomKey } from "@/server/pipeline/normalize";

describe("normalizeRoomKey", () => {
  it("uppercases the label", () => {
    expect(normalizeRoomKey("bedroom")).toBe("BEDROOM");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeRoomKey("  Kitchen  ")).toBe("KITCHEN");
  });

  it("uppercases and trims together", () => {
    expect(normalizeRoomKey("  master bedroom  ")).toBe("MASTER BEDROOM");
  });

  it("handles already-uppercase input", () => {
    expect(normalizeRoomKey("LOUNGE")).toBe("LOUNGE");
  });

  it("handles empty string", () => {
    expect(normalizeRoomKey("")).toBe("");
  });
});
