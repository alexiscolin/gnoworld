// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { Unread } from "../../lib/query/client.ts";
import { useHours } from "./useHours.ts";

// A plate's hours as a query: none while they come and none when the file did not come whole, the world's own hours once they did, one read for
// two plates of a world, and another world's answer never shown for this one.
const read = vi.hoisted(() => vi.fn());
vi.mock("./hours.ts", () => ({ readHours: read }));

const seen = new Map<string, unknown>();
function Hours({ world }: { world: string }) {
  seen.set(world, useHours(world));
  return null;
}

describe("useHours", () => {
  it("gives nothing while the file comes, then its hours; one read for two plates of one world", async () => {
    seen.clear();
    read.mockResolvedValue({ world: "earth", hours: [1] });
    mount(
      <>
        <Hours world="earth" />
        <Hours world="earth" />
      </>,
    );
    expect(seen.get("earth")).toBeUndefined();
    await settled(() => seen.get("earth") !== undefined);
    expect(seen.get("earth")).toEqual({ world: "earth", hours: [1] });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("earth", expect.any(AbortSignal));
  });

  it("gives nothing for a file that did not come whole, and nothing of another world's hours", async () => {
    seen.clear();
    read.mockReset();
    read.mockRejectedValue(new Unread(undefined));
    mount(<Hours world="gnoswap" />);
    await settled(() => read.mock.calls.length > 0);
    expect(seen.get("gnoswap")).toBeUndefined();
  });
});
