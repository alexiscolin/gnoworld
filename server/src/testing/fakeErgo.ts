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

const servers: { server: Server; sockets: Socket[] }[] = [];
// Each server's connections ended and its port freed before the next test.
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async ({ server, sockets }) => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }),
  );
});

export const fakeErgo = async (at = 0) => {
  const peers: Peer[] = [];
  const waiting: (() => void)[] = [];
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
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
  servers.push({ server, sockets });
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

// Registered, up to Ergo's welcome, the capabilities asked acknowledged (3b); its account by SASL when the
// link asks one (the max review), which the operator's password logs in.
export const register = async (peer: Peer): Promise<void> => {
  const asked = await peer.next(/^CAP REQ /);
  peer.say(`:ergo.test CAP * ACK :${asked.replace(/^CAP REQ :?/, "")}`);
  if ((await peer.next(/^(CAP END|AUTHENTICATE PLAIN)$/)) !== "CAP END") {
    peer.say("AUTHENTICATE +");
    await peer.next(/^AUTHENTICATE /);
    peer.say(":ergo.test 903 gnoworld :SASL authentication successful");
    await peer.next(/^CAP END$/);
  }
  peer.say(":ergo.test 001 gnoworld :Welcome");
};

// Registered, an operator, in its rooms: the conversation Ergo holds with a new client (3b). Ergo answers a
// JOIN with the bot's own JOIN of each room it is in; echo false holds that back.
export const welcome = async (peer: Peer, { echo = true } = {}): Promise<void> => {
  await register(peer);
  await peer.next(new RegExp(`^OPER admin ${PASSWORD}$`));
  peer.say(":ergo.test 381 gnoworld :You are now an IRC operator");
  const join = await peer.next(/^JOIN /);
  if (echo) for (const room of join.slice("JOIN ".length).split(",")) peer.say(`:gnoworld!u@h JOIN ${room}`);
};

// A PRIVMSG as Ergo relays it: "tags" without the @, the source as nick!user@host.
export const message = (tags: string, source: string, [target, text]: readonly [string, string]): string =>
  `${tags === "" ? "" : `@${tags} `}:${source} PRIVMSG ${target} :${text}`;
