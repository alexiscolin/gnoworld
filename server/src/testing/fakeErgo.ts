// A fake Ergo for the IRC link's tests: a TCP server that records each connection's lines and lets the
// test answer, as 3b's table says the real one does. The real Ergo's tests are testing/ergo.test.ts.
import { once } from "node:events";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { afterEach } from "vitest";

export const PASSWORD = "an-operator-password-of-32-chars";

export interface Peer {
  socket: Socket;
  lines: string[];
  next: (pattern: RegExp) => Promise<string>;
  say: (line: string) => void;
}

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

export const fakeErgo = async (at = 0) => {
  const peers: Peer[] = [];
  const waiting: (() => void)[] = [];
  const server = createServer((socket) => {
    const lines: string[] = [];
    let rest = "";
    const changed: (() => void)[] = [];
    socket.setEncoding("utf8");
    socket.on("error", () => undefined);
    socket.on("data", (chunk: string) => {
      const parts = (rest + chunk).split("\r\n");
      rest = parts.pop() ?? "";
      lines.push(...parts);
      for (const check of changed.splice(0)) check();
    });
    let cursor = 0;
    const next = async (pattern: RegExp): Promise<string> => {
      for (;;) {
        while (cursor < lines.length) {
          const line = lines[cursor++] ?? "";
          if (pattern.test(line)) return line;
        }
        await new Promise<void>((resolve) => changed.push(resolve));
      }
    };
    peers.push({ socket, lines, next, say: (line) => socket.write(`${line}\r\n`) });
    for (const resolve of waiting.splice(0)) resolve();
  });
  servers.push(server);
  server.listen(at, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const peer = async (nth: number): Promise<Peer> => {
    for (;;) {
      const found = peers[nth];
      if (found !== undefined) return found;
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
  };
  return { port, peer, peers };
};

// Registered, an operator, in its rooms: the conversation Ergo holds with a new client (3b).
export const welcome = async (peer: Peer): Promise<void> => {
  await peer.next(/^CAP REQ /);
  peer.say(":ergo.test CAP * ACK :message-tags account-tag");
  await peer.next(/^CAP END$/);
  peer.say(":ergo.test 001 gnoworld :Welcome");
  await peer.next(new RegExp(`^OPER admin ${PASSWORD}$`));
  peer.say(":ergo.test 381 gnoworld :You are now an IRC operator");
  await peer.next(/^JOIN /);
};

// A PRIVMSG as Ergo relays it: "tags" without the @, the source as nick!user@host.
export const message = (tags: string, source: string, [target, text]: readonly [string, string]): string =>
  `${tags === "" ? "" : `@${tags} `}:${source} PRIVMSG ${target} :${text}`;
