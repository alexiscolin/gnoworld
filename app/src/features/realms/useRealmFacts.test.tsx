// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { readRealmFacts } from "../../lib/chain/indexer.ts";
import { useRealmFacts } from "./useRealmFacts.ts";

vi.mock("../../lib/chain/indexer.ts", () => ({ readRealmFacts: vi.fn() }));

const answer = (firstBlock: number) => ({ ok: true, value: { firstBlock }, source: {} }) as never;
const seen: unknown[] = [];
function Reader() {
  seen.push(useRealmFacts("idx", "gno.land/r/a"));
  return null;
}

describe("useRealmFacts, a place seen again", () => {
  it("draws what is kept in its first render and asks nothing within the fresh window", async () => {
    const read = vi.mocked(readRealmFacts);
    read.mockResolvedValueOnce(answer(1));
    const first = mount(<Reader />);
    await settled(() => seen.at(-1) !== undefined);
    expect(seen.at(0)).toBeUndefined();
    expect(seen.at(-1)).toEqual(answer(1));
    first.remove();
    seen.length = 0;
    mount(<Reader />);
    await act(() => Promise.resolve());
    expect(seen.at(0)).toEqual(answer(1));
    expect(seen).not.toContain(undefined);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
