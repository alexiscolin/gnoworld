import { Address, type Signal, type StreamEvent } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeStream } from "../../../tests/fakeStream.ts";
import { followVerdicts, pageVerdicts, type VerdictSource } from "./verdicts.ts";

// A stand-in for the page's EventSource: the URL it opened, its listeners, whether it was closed.
function fakeSource() {
  const opened: string[] = [];
  const listeners = new Map<string, (event: { data: unknown }) => void>();
  let closed = 0;
  // EventSource's: 0 while it reconnects, 2 once it gives up.
  let readyState = 1;
  const open = (url: string): VerdictSource => {
    opened.push(url);
    return {
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      close: () => {
        closed += 1;
      },
      get readyState() {
        return readyState;
      },
    };
  };
  // The browser's error, as it reconnects or once it gave up.
  const error = (state: 0 | 2) => {
    readyState = state;
    listeners.get("error")?.({ data: undefined });
  };
  const say = (data: unknown, type = "verdict") => {
    listeners.get(type)?.({ data });
  };
  return { open, opened, say, error, closed: () => closed };
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

  it("opens one stream for several rooms, their names joined by a comma, encoded", () => {
    const source = fakeSource();
    followVerdicts(["#a", "#b/c"], () => undefined, { open: source.open, log: () => undefined });
    expect(source.opened).toEqual(["/api/stream?rooms=%23a%2C%23b%2Fc"]);
  });

  it("asks a stream the page follows for its events alone to go uncounted in the world's here (presence=0, D374)", () => {
    const source = fakeSource();
    followVerdicts(["#earth"], () => undefined, { open: source.open, log: () => undefined, uncounted: true });
    expect(source.opened).toEqual(["/api/stream?rooms=%23earth&presence=0"]);
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

  // F890: after its replay, the stream says when it began following, on the server's clock.
  it("hands on the stream's word of when it began following, in ms, and drops a word of another shape once", () => {
    const source = fakeSource();
    const times: number[] = [];
    const said: string[] = [];
    followVerdicts(["#bubble"], () => undefined, {
      open: source.open,
      log: (what) => said.push(what),
      since: (time) => times.push(time),
    });
    source.say(JSON.stringify({ time: "2026-10-26T12:00:00.000Z" }), "since");
    source.say(JSON.stringify({ time: "noon" }), "since");
    source.say("{not json", "since");
    source.say(JSON.stringify({ time: "2026-10-26T12:00:00.000Z", extra: 1 }), "since");
    source.say(JSON.stringify({ time: "2026-10-26T12:10:00.000Z" }), "since");
    expect(times).toEqual([Date.parse("2026-10-26T12:00:00.000Z"), Date.parse("2026-10-26T12:10:00.000Z")]);
    expect(said).toEqual(["since_unknown"]);
  });

  // F888: EventSource gives up on an answer not 200 (a 429, a restart's 502), and no verdict comes after it.
  it("says once the stream ended for good, never while the browser reconnects it, nor once the page stopped", () => {
    const source = fakeSource();
    let ends = 0;
    const options = { open: source.open, log: () => undefined, dead: () => (ends += 1) };
    followVerdicts(["#bubble"], () => undefined, options);
    source.error(0);
    expect(ends).toBe(0);
    source.error(2);
    source.error(2);
    expect(ends).toBe(1);
    const other = fakeSource();
    followVerdicts(["#bubble"], () => undefined, { ...options, open: other.open })();
    other.error(2);
    expect(ends).toBe(1);
  });

  it("closes the stream when the page stops following", () => {
    const source = fakeSource();
    const stop = followVerdicts(["#bubble"], () => undefined, { open: source.open, log: () => undefined });
    stop();
    stop();
    expect(source.closed()).toBe(1);
  });

  it("ends quietly when the browser gives up and the page asked to hear no end", () => {
    const source = fakeSource();
    followVerdicts(["#bubble"], () => undefined, { open: source.open, log: () => undefined });
    expect(() => {
      source.error(2);
    }).not.toThrow();
  });

  it("opens no stream for no room", () => {
    const source = fakeSource();
    followVerdicts([], () => undefined, { open: source.open, log: () => undefined })();
    expect(source.opened).toEqual([]);
  });
});

// Slice 9h: the stream's `signal` event, read through the Signal schema as the verdicts are; an event of another shape is
// dropped, said once, and the verdicts go on.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const CHART: Signal = { kind: "chart", world: "fresh-mint", account: ALICE, at: "2026-11-05T12:00:00.000Z" };
const signalSource = () => {
  const source = fakeSource();
  return {
    ...source,
    say: (data: unknown, type = "signal") => {
      source.say(data, type);
    },
  };
};

describe("followVerdicts: the first signals", () => {
  it("hands on a signal that fits its schema", () => {
    const source = signalSource();
    const heard: Signal[] = [];
    followVerdicts(["#fresh-mint"], () => undefined, {
      open: source.open,
      log: () => undefined,
      signal: (event) => heard.push(event),
    });
    source.say(JSON.stringify(CHART));
    expect(heard).toEqual([CHART]);
  });

  it("drops a signal of another shape or with a hostile account, saying so once, and hears the next", () => {
    const source = signalSource();
    const heard: Signal[] = [];
    const logged: string[] = [];
    followVerdicts(["#fresh-mint"], () => undefined, {
      open: source.open,
      log: (what) => logged.push(what),
      signal: (event) => heard.push(event),
    });
    source.say(JSON.stringify({ ...CHART, account: "<script>alert(1)</script>" }));
    source.say("not json");
    source.say(JSON.stringify({ ...CHART, kind: "stamped" }));
    source.say(JSON.stringify(CHART));
    expect(heard).toEqual([CHART]);
    expect(logged).toEqual(["signal_unknown"]);
  });

  it("leaves the verdicts as they were: one handler for each kind of event", () => {
    const source = signalSource();
    const verdicts: unknown[] = [];
    const heard: Signal[] = [];
    followVerdicts(["#fresh-mint"], (event) => verdicts.push(event), {
      open: source.open,
      log: () => undefined,
      signal: (event) => heard.push(event),
    });
    source.say(JSON.stringify({ msgid: "m1", room: "#fresh-mint", state: "checked" }), "verdict");
    expect(verdicts).toHaveLength(1);
    expect(heard).toEqual([]);
  });
});

// The page's chat follows the one stream of the page (D215): the signals reach the store through it, so the page's own
// follower hands them on as it hands the verdicts.
describe("pageVerdicts: the page's own stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands a signal on to the page, beside the verdicts", () => {
    const opened: string[] = [];
    const listeners = new Map<string, (event: { data: unknown }) => void>();
    class Source {
      readyState = 1;
      constructor(url: string) {
        opened.push(url);
      }
      addEventListener(type: string, listener: (event: { data: unknown }) => void) {
        listeners.set(type, listener);
      }
      close() {
        return undefined;
      }
    }
    vi.stubGlobal("EventSource", Source);
    const heard: Signal[] = [];
    pageVerdicts(["#fresh-mint"], {
      verdict: () => undefined,
      since: () => undefined,
      dead: () => undefined,
      signal: (event) => heard.push(event),
    });
    listeners.get("signal")?.({ data: JSON.stringify(CHART) });
    expect(opened).toEqual(["/api/stream?rooms=%23fresh-mint"]);
    expect(heard).toEqual([CHART]);
  });

  it("listens to the events it has a handler for and to no other, handing the chain's on unread", () => {
    const sources = fakeStream();
    pageVerdicts(["#a"], { verdict: () => undefined, since: () => undefined, dead: () => undefined });
    expect(sources.opened[0]?.heard()).toEqual(["error", "since", "verdict"]);
    const told: unknown[] = [];
    pageVerdicts(["#b"], {
      verdict: () => undefined,
      since: () => undefined,
      dead: () => undefined,
      chain: (data) => told.push(data),
      realms: (data) => told.push(data),
    });
    sources.opened[1]?.emit("chain", { kind: "x" });
    sources.opened[1]?.emit("realms", { count: 1 });
    expect(sources.opened[1]?.heard()).toEqual(["chain", "error", "realms", "since", "verdict"]);
    expect(told).toEqual(['{"kind":"x"}', '{"count":1}']);
  });

  it("listens to `card` events only when the page has a handler, handing them on unread", () => {
    const sources = fakeStream();
    pageVerdicts(["#a"], { verdict: () => undefined, since: () => undefined, dead: () => undefined });
    expect(sources.opened[0]?.heard()).not.toContain("card");
    const told: unknown[] = [];
    pageVerdicts(["#b"], {
      verdict: () => undefined,
      since: () => undefined,
      dead: () => undefined,
      card: (data) => told.push(data),
    });
    sources.opened[1]?.emit("card", { room: "#b", msgid: "m1", key: null });
    expect(sources.opened[1]?.heard()).toContain("card");
    expect(told).toEqual(['{"room":"#b","msgid":"m1","key":null}']);
  });

  it("reports a frame it does not know once, as an error of the page", () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const sources = fakeStream();
    pageVerdicts(["#a"], { verdict: () => undefined, since: () => undefined, dead: () => undefined });
    sources.opened[0]?.emit("verdict", { state: "gone" });
    sources.opened[0]?.emit("verdict", { state: "gone" });
    expect(report).toHaveBeenCalledTimes(1);
    expect(String(report.mock.calls[0]?.[0])).toBe("Error: verdicts: verdict_unknown");
  });
});

describe("pageVerdicts: the reader's language and the translations' events", () => {
  it("asks the stream for the language, after the rooms, and for none when the page has none", () => {
    const sources = fakeStream();
    const base = { verdict: () => undefined, since: () => undefined, dead: () => undefined };
    pageVerdicts(["#a"], { ...base, language: "fr" });
    pageVerdicts(["#a"], { ...base, uncounted: true, language: "de" });
    pageVerdicts(["#a"], base);
    expect(sources.opened.map(({ url }) => url)).toEqual([
      "/api/stream?rooms=%23a&language=fr",
      "/api/stream?rooms=%23a&presence=0&language=de",
      "/api/stream?rooms=%23a",
    ]);
  });

  it("listens to `translation` events only when the page has a handler, handing them on unread", () => {
    const sources = fakeStream();
    const base = { verdict: () => undefined, since: () => undefined, dead: () => undefined };
    pageVerdicts(["#a"], base);
    expect(sources.opened[0]?.heard()).not.toContain("translation");
    const told: unknown[] = [];
    pageVerdicts(["#b"], { ...base, translation: (data) => told.push(data) });
    sources.opened[1]?.emit("translation", { room: "#b", msgid: "m1" });
    expect(told).toEqual(['{"room":"#b","msgid":"m1"}']);
  });
});
