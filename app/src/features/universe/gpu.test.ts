// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { offerOf } from "./gpu.ts";

const phone = (matches: boolean) =>
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

afterEach(() => {
  Reflect.deleteProperty(navigator, "connection");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// A computer's strong GPU, as the probe reads it.
const strongGpu = () =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 1 } : { loseContext: () => undefined },
    getParameter: () => "Apple M2 Pro",
  } as unknown as RenderingContext);
const link = (connection: { saveData?: boolean; effectiveType?: string }) =>
  Object.defineProperty(navigator, "connection", { value: connection, configurable: true });

describe("offerOf, the link (D13721)", () => {
  it("takes space on a computer whose link the browser estimates at 2g: only the reader's own Save-Data waits there", () => {
    phone(false);
    strongGpu();
    link({ effectiveType: "2g", saveData: false });
    expect(offerOf()).toBe("auto");
  });

  it("waits to be asked on a computer whose reader asks to save data", () => {
    phone(false);
    strongGpu();
    link({ effectiveType: "4g", saveData: true });
    expect(offerOf()).toBe("ask");
  });

  it("keeps a phone's ask at an estimated 2g", () => {
    phone(true);
    link({ effectiveType: "2g" });
    expect(offerOf()).toBe("ask");
  });
});

describe("offerOf", () => {
  it("makes no WebGL2 context on a phone, which has no space to draw, and keeps the ask offer", () => {
    phone(true);
    const made = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    expect(offerOf()).toBe("ask");
    expect(made).not.toHaveBeenCalled();
  });

  it("probes the GPU on a computer: none offered where there is no WebGL2", () => {
    phone(false);
    const made = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(offerOf()).toBe("none");
    expect(made).toHaveBeenCalledWith("webgl2");
  });
});
