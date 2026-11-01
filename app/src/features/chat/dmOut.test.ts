import { compose } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { speakIn, type DmOut } from "./dmOut.ts";
import { outbox } from "./outbox.ts";

// The line's last door: what it is given is written into a line, and a separator would open a tag of its own, or a word of IRC.
const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ROOM = "#earth";

function out() {
  const store = createAppStore();
  const send = vi.fn(() => true);
  const o: DmOut = {
    ergo: { send, stop: () => undefined, multiline: () => true, nick: () => ME },
    key: ME,
    outbox: outbox(store),
    store,
    ref: () => "ml0",
  };
  return { o, send };
}
const to = { room: ROOM, composed: compose(ROOM, "hi", ME), inside: true };

describe("speakIn and a country", () => {
  it("writes two capitals into the line", () => {
    const { o, send } = out();
    expect(speakIn(o, to, { country: "JP" })).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith(`@+gnoworld/country=JP PRIVMSG ${ROOM} :hi`);
  });

  it.each(["JP;+gnoworld/edit=m1", "JP :x", "JP\r\nQUIT", "jp", "JPN", ""])(
    "sends the line untagged for %j: what is no country opens nothing, and the words still go",
    (country) => {
      const { o, send } = out();
      expect(speakIn(o, to, { country })).toBe(true);
      expect(send).toHaveBeenCalledExactlyOnceWith(`PRIVMSG ${ROOM} :hi`);
    },
  );
});
