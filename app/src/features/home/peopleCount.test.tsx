// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import type { People } from "./Hero.tsx";
import { usePeople } from "./peopleCount.ts";

// The hero's people as a query: "coming" while it is asked, the counts once they come (never fewer than one online), none when the server did not
// say, and nothing asked for a page that does not want them.
const read = vi.hoisted(() => vi.fn());
vi.mock("./people.ts", () => ({ readPeople: read }));

const seen: (People | undefined)[] = [];
function Hero({ wanted = true }: { wanted?: boolean }) {
  seen.push(usePeople(wanted));
  return null;
}

describe("usePeople", () => {
  it("says coming, then the counts, with at least one online", async () => {
    seen.length = 0;
    read.mockResolvedValue({ online: 0, countries: 3 });
    mount(<Hero />);
    expect(seen.at(-1)).toBe("coming");
    await settled(() => seen.at(-1) !== "coming");
    expect(seen.at(-1)).toEqual({ online: 1, countries: 3 });
  });

  it("says none when the server did not say, and asks nothing when not wanted", async () => {
    seen.length = 0;
    read.mockReset();
    read.mockResolvedValue(undefined);
    mount(<Hero />);
    await settled(() => seen.at(-1) === undefined);
    read.mockClear();
    mount(<Hero wanted={false} />);
    expect(seen.at(-1)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
});
