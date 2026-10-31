// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { ReadSource } from "./ReadSource.tsx";

// 5k: "never a number without its source and age" (plan §3): the host, left to right, and the minute asked in UTC, in words.
const AT = "2026-10-31T06:00:07.123Z";

describe("where a read came from", () => {
  it("says the host and the minute asked, in UTC", () => {
    const el = mount(<ReadSource source={{ url: "https://rpc.onyx.testnets.gno.land/abci_query?x=1", at: AT }} />);
    expect(el.textContent).toBe("Read from rpc.onyx.testnets.gno.land at 2026-10-31 06:00 UTC");
    expect(el.querySelector("time")?.getAttribute("datetime")).toBe(AT);
    expect(el.querySelector("time")?.textContent).toBe("2026-10-31 06:00 UTC");
  });

  it("sets the host left to right, whatever the page's direction", () => {
    const el = mount(<ReadSource source={{ url: "https://rpc.example:8443/x", at: AT }} />);
    const host = el.querySelector("span");
    expect(host?.getAttribute("dir")).toBe("ltr");
    expect(host?.textContent).toBe("rpc.example:8443");
  });

  it("names the address itself when it has no host, so the line never reads 'from  at'", () => {
    const named = (url: string) => mount(<ReadSource source={{ url, at: AT }} />).querySelector("span")?.textContent;
    expect(named("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(named("not an address")).toBe("not an address");
  });
});
