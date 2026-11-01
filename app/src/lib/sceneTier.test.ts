import { describe, expect, it, vi } from "vitest";
import { rememberedTier, rememberLow } from "./sceneTier.ts";

const device = (kept: string | null = null) => ({
  getItem: vi.fn<(key: string) => string | null>().mockReturnValue(kept),
  setItem: vi.fn<(key: string, value: string) => void>(),
});
const refused = () => {
  throw new DOMException("blocked", "SecurityError");
};

describe("rememberedTier", () => {
  it("reads Low from the device", () => {
    expect(rememberedTier(() => device("low"))).toBe("low");
  });

  it("remembers nothing by default", () => {
    expect(rememberedTier(() => device())).toBeUndefined();
  });

  it.each(["high", "LOW", "", "low ", '{"tier":"low"}'])(
    "takes %j for nothing: a device's file is outside data",
    (held) => {
      expect(rememberedTier(() => device(held))).toBeUndefined();
    },
  );

  it("takes a device that refuses for one that remembers nothing", () => {
    expect(rememberedTier(refused)).toBeUndefined();
  });

  it("takes a device that fails to read for one that remembers nothing", () => {
    const failing = device();
    failing.getItem.mockImplementation(refused);
    expect(rememberedTier(() => failing)).toBeUndefined();
  });
});

describe("rememberLow", () => {
  it("writes what rememberedTier reads", () => {
    const kept = device();
    rememberLow(() => kept);
    const [key, value] = kept.setItem.mock.calls[0] ?? [];
    expect(rememberedTier(() => device(value ?? null))).toBe("low");
    expect(key).toBe("gnoworld:scene:tier");
  });

  it("does not fail on a device that refuses", () => {
    expect(() => {
      rememberLow(refused);
    }).not.toThrow();
  });

  it("does not fail on a device that is full", () => {
    const full = device();
    full.setItem.mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => {
      rememberLow(() => full);
    }).not.toThrow();
  });
});
