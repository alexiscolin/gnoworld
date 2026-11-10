// @vitest-environment jsdom
import type { Worlds } from "@gnoworld/schemas/indexer";
import { describe, expect, it, vi } from "vitest";
import { mount, settled } from "../tests/mount.tsx";
import { useWorldsFile } from "./worldsFile.ts";

// The worlds' file for the views that need every world: none while it comes, its worlds once, an empty list when it did not come (a view falls
// back to what the device holds), nothing asked while closed, and one read for every view.
const read = vi.hoisted(() => vi.fn());
vi.mock("./lib/chain/realms.ts", () => ({ readWorlds: read }));

const seen = new Map<string, Worlds["worlds"] | undefined>();
function View({ id, open = true }: { id: string; open?: boolean }) {
  seen.set(id, useWorldsFile(open));
  return null;
}

describe("useWorldsFile", () => {
  it("is none while it comes, then the worlds, from one read for two views, and none asked while closed", async () => {
    read.mockResolvedValue({ worlds: [] });
    mount(
      <>
        <View id="a" />
        <View id="b" />
        <View id="c" open={false} />
      </>,
    );
    expect(seen.get("a")).toBeUndefined();
    await settled(() => seen.get("a") !== undefined && seen.get("c") !== undefined);
    expect([seen.get("a"), seen.get("b")]).toEqual([[], []]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("is an empty list when the file did not come whole", async () => {
    read.mockReset();
    read.mockResolvedValue(undefined);
    mount(<View id="d" />);
    await settled(() => seen.get("d") !== undefined);
    expect(seen.get("d")).toEqual([]);
  });
});
