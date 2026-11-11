// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { LatestOnX } from "./LatestOnX.tsx";

// The Earth's latest card (D13931): the blog's last post read on chain, with its day and its page on gno.land's gnoweb; a read that fails or
// holds no post draws nothing, not even its heading.
const read = vi.hoisted(() => vi.fn());
vi.mock("../../lib/chain/rpc.ts", () => ({ readPage: read }));

const page = "### [Gno.land Mainnet Upgraded to v1.7.0](/r/gnoland/blog:p/mainnet-upgrade)\n30 Oct 2026\n";
const source = { url: "https://rpc.gno.land:443", at: "2026-11-11T10:00:00.000Z" };

describe("the latest post of the blog", () => {
  it("shows the title, the day and a link to the post on the mainnet's gnoweb, read from the mainnet", async () => {
    read.mockResolvedValue({ ok: true, value: page, source });
    const box = mount(<LatestOnX />);
    await settled(() => box.textContent !== "");
    expect(box.textContent).toContain("Gno.land Mainnet Upgraded to v1.7.0");
    expect(box.querySelector("time")?.textContent).toBe("30 Oct 2026");
    expect(box.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-30");
    expect(box.querySelector("a")?.getAttribute("href")).toBe("https://gno.land/r/gnoland/blog:p/mainnet-upgrade");
    expect(read).toHaveBeenCalledWith(
      "https://rpc.gno.land:443",
      { realm: "gno.land/r/gnoland/blog" },
      expect.anything(),
    );
  });

  it("draws nothing when the read fails or the page holds no post", async () => {
    for (const answer of [
      { ok: false, failure: { kind: "down", next: "Try again." }, source },
      { ok: true, value: "No posts.", source },
    ]) {
      read.mockResolvedValue(answer);
      const box = mount(<LatestOnX />);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(box.textContent).toBe("");
    }
  });
});
