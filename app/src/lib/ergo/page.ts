// The page's connection to Ergo (slice 4's 4b): connectErgo on the browser's WebSocket at /ws on the page's own
// host (nginx's location = /ws, deploy/web), on the page's clock and its randomness.
import { connectErgo, type Ergo, type ErgoOptions, type Socket, type Who } from "./ergo.ts";

/** Ergo's WebSocket on the page's host: wss when the page is https. */
export const ergoUrl = ({ protocol, host }: { protocol: string; host: string }): string =>
  `${protocol === "https:" ? "wss:" : "ws:"}//${host}/ws`;

// The browser's WebSocket as connectErgo drives it: its open, message and close handed on.
function browserSocket(url: string): Socket {
  const browser = new WebSocket(url);
  const socket: Socket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    send: (data) => {
      browser.send(data);
    },
    close: () => {
      browser.close();
    },
  };
  browser.onopen = () => {
    socket.onopen?.();
  };
  browser.onmessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    socket.onmessage?.({ data });
  };
  browser.onclose = () => {
    socket.onclose?.();
  };
  return socket;
}

/** The page's connection to Ergo, as `who`, until stopped. */
export function pageErgo(who: Who, on: Pick<ErgoOptions, "onState" | "onLine">): Ergo {
  return connectErgo({
    url: ergoUrl(location),
    who,
    open: browserSocket,
    ...on,
    random: () => Math.random(),
    after: (ms, run) => {
      const timer = setTimeout(run, ms);
      return () => {
        clearTimeout(timer);
      };
    },
  });
}
