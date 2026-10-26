import type { StreamEvent } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { followVerdicts, type VerdictSource } from "./verdicts.ts";

// A stand-in for the page's EventSource: the URL it opened, its listeners, whether it was closed.
function fakeSource() {
  const opened: string[] = [];
  const listeners = new Map<string, (event: { data: unknown }) => void>();
  let closed = 0;
  const open = (url: string): VerdictSource => {
    opened.push(url);
    return {
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      close: () => {
        closed += 1;
      },
    };
  };
  const say = (data: unknown) => {
    listeners.get("verdict")?.({ data });
  };
  return { open, opened, say, closed: () => closed };
}

const CHECKED: StreamEvent = { msgid: "m1", room: "#bubble/games", state: "checked" };

// 4g: the server's verdicts' stream (server/src/stream/stream.ts, /api/stream?rooms=), a link's player waiting on
// "checked"; an event of a state this page does not know is dropped, said once (F675, slice 4's plan §1).
describe("followVerdicts: the room's verdicts, as the server streams them", () => {
  it("opens the stream of the room it follows, its name encoded, and hands on each verdict", () => {
    const source = fakeSource();
    const heard: StreamEvent[] = [];
    followVerdicts(["#bubble/games"], (event) => heard.push(event), { open: source.open, log: () => undefined });
    expect(source.opened).toEqual(["/api/stream?rooms=%23bubble%2Fgames"]);
    source.say(JSON.stringify(CHECKED));
    source.say(JSON.stringify({ ...CHECKED, msgid: "m2", state: "hidden" }));
    expect(heard).toEqual([CHECKED, { ...CHECKED, msgid: "m2", state: "hidden" }]);
  });

  it("drops what is no verdict it knows, saying so once, and goes on", () => {
    const source = fakeSource();
    const heard: StreamEvent[] = [];
    const said: string[] = [];
    followVerdicts(["#bubble"], (event) => heard.push(event), { open: source.open, log: (what) => said.push(what) });
    source.say(JSON.stringify({ ...CHECKED, state: "blurred" }));
    source.say("{not json");
    source.say(JSON.stringify({ ...CHECKED, extra: 1 }));
    source.say(42);
    source.say(JSON.stringify(CHECKED));
    expect(heard).toEqual([CHECKED]);
    expect(said).toEqual(["verdict_unknown"]);
  });

  it("closes the stream when the page stops following", () => {
    const source = fakeSource();
    const stop = followVerdicts(["#bubble"], () => undefined, { open: source.open, log: () => undefined });
    stop();
    stop();
    expect(source.closed()).toBe(1);
  });

  it("opens no stream for no room", () => {
    const source = fakeSource();
    followVerdicts([], () => undefined, { open: source.open, log: () => undefined })();
    expect(source.opened).toEqual([]);
  });
});
