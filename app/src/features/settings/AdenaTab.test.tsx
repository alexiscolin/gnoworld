// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import { WORDS } from "../errors/words.ts";
import { AdenaTab } from "./AdenaTab.tsx";

// Adena's way to link an account loads the wallet's code at the first Continue: code that cannot be fetched (a new deploy) leaves the
// button usable with a line that says so, and is reported.
vi.mock(import("../../lib/adena/adena.ts"), () => {
  throw new TypeError("error loading dynamically imported module");
});
const ME = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdenaTab", () => {
  it("leaves Continue enabled with a line when the wallet's code cannot be fetched, and reports it", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const box = mount(
      <StoreProvider>
        <AdenaTab me={ME} onLinked={() => undefined} onCancel={() => undefined} />
      </StoreProvider>,
    );
    const go = [...box.querySelectorAll("button")].find((button) => button.textContent === "Continue");
    await act(async () => {
      go?.click();
      await vi.dynamicImportSettled();
    });
    expect(go?.disabled).toBe(false);
    expect(box.querySelector("[role=status]")?.textContent).toBe(WORDS["new-version"].short);
    expect(reported).toHaveBeenCalledOnce();
  });
});
