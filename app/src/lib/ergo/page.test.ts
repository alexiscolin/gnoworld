import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErgoState } from "./ergo.ts";
import { ergoUrl, pageErgo } from "./page.ts";

// The browser's WebSocket, as the test sees it: the URL it was opened at, what it sent, whether it closed.
class Browser {
  static opened: Browser[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  sent: string[] = [];
  closed = false;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    Browser.opened.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

afterEach(() => {
  Browser.opened = [];
  vi.unstubAllGlobals();
});

describe("Ergo's address", () => {
  it.each([
    [{ protocol: "https:", host: "gno.world" }, "wss://gno.world/ws"],
    [{ protocol: "http:", host: "127.0.0.1:4173" }, "ws://127.0.0.1:4173/ws"],
  ])("is /ws on the page's own host, secure when the page is: %j", (where, url) => {
    expect(ergoUrl(where)).toBe(url);
  });
});

describe("the page's connection to Ergo", () => {
  const connect = () => {
    vi.stubGlobal("WebSocket", Browser);
    vi.stubGlobal("location", { protocol: "https:", host: "gno.world" });
    const states: ErgoState[] = [];
    const lines: string[] = [];
    const ergo = pageErgo(
      { guest: () => "guest-abcdef" },
      { onState: (state) => states.push(state), onLine: (line) => lines.push(line.command) },
    );
    const socket = Browser.opened.at(-1);
    if (socket === undefined) throw new Error("no socket");
    return { ergo, socket, states, lines };
  };

  it("opens the browser's WebSocket at /ws on the page's host, and hands its events on", () => {
    const { ergo, socket, states } = connect();
    expect(socket.url).toBe("wss://gno.world/ws");
    expect(states).toEqual(["connecting"]);
    socket.onopen?.({});
    expect(socket.sent).toEqual(["CAP LS 302", expect.stringMatching(/^CAP REQ :/)]);
    socket.onmessage?.({ data: ":ergo CAP * ACK :message-tags" });
    expect(socket.sent.at(-1)).toBe("USER u 0 * :guest-abcdef");
    ergo.stop();
    expect(socket.closed).toBe(true);
    expect(states.at(-1)).toBe("stopped");
  });

  it("hands on a live line once connected", () => {
    const { socket, states, lines, ergo } = connect();
    socket.onopen?.({});
    socket.onmessage?.({ data: ":ergo CAP * ACK :message-tags" });
    socket.onmessage?.({ data: ":ergo 376 guest-abcdef :End of MOTD" });
    expect(states).toEqual(["connecting", "connected"]);
    socket.onmessage?.({ data: "@msgid=a;time=2026-10-25T10:00:00.000Z :bob!u@h PRIVMSG #a :hi" });
    expect(lines).toEqual(["PRIVMSG"]);
    ergo.stop();
  });

  it("hears nothing more from a socket once stopped", () => {
    const { socket, states, lines, ergo } = connect();
    ergo.stop();
    socket.onmessage?.({ data: ":bob!u@h PRIVMSG #a :late" });
    socket.onclose?.({});
    expect(lines).toEqual([]);
    expect(states.at(-1)).toBe("stopped");
  });

  // A full-jitter share of the first second: Math.random's half, 500 ms.
  it("waits its jittered backoff on the page's clock, then opens another socket", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { socket, states, ergo } = connect();
      socket.onclose?.({});
      expect(states.at(-1)).toBe("waiting");
      vi.advanceTimersByTime(499);
      expect(Browser.opened).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(Browser.opened).toHaveLength(2);
      ergo.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("leaves no timer once stopped while it waits", () => {
    vi.useFakeTimers();
    try {
      const { socket, ergo } = connect();
      socket.onclose?.({});
      ergo.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
