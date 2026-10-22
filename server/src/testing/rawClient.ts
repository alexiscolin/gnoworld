// A test's IRC connection: it sends lines and waits for lines, and parses nothing.
// ponytail: core/irc's parser takes over once the bot's link reads IRC (3h).
import { once } from "node:events";
import { connect } from "node:net";

export interface Raw {
  send: (line: string) => void;
  // The first line from the cursor on that matches; the lines before it are taken too.
  expect: (pattern: RegExp, ms?: number) => Promise<string>;
  lines: () => string[];
  close: () => Promise<void>;
}

export async function rawClient(port: number): Promise<Raw> {
  const socket = connect(port, "127.0.0.1");
  socket.setEncoding("utf8");
  const lines: string[] = [];
  const waiting = new Set<() => void>();
  let rest = "";
  let next = 0;
  let closed = false;
  socket.on("data", (chunk: string) => {
    const parts = (rest + chunk).split(/\r?\n/);
    rest = parts.pop() ?? "";
    lines.push(...parts);
    for (const check of waiting) check();
  });
  // A reset is a close like any other here: what waits is refused, and nothing crashes. Not events.once,
  // which rejects on the error that comes before the close.
  socket.on("error", () => undefined);
  const ended = new Promise<void>((resolve) => {
    socket.once("close", () => {
      closed = true;
      for (const check of waiting) check();
      resolve();
    });
  });
  await once(socket, "connect");

  const expect = (pattern: RegExp, ms = 2000): Promise<string> =>
    new Promise((resolve, reject) => {
      const seen = (): string => lines.join("\n");
      const done = (): void => {
        clearTimeout(timer);
        waiting.delete(check);
      };
      const check = (): void => {
        for (; next < lines.length; next++) {
          const line = lines[next] ?? "";
          if (pattern.test(line)) {
            next++;
            done();
            resolve(line);
            return;
          }
        }
        if (closed) {
          done();
          reject(new Error(`closed before a line matched ${String(pattern)}:\n${seen()}`));
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`no line matched ${String(pattern)} in ${String(ms)} ms:\n${seen()}`));
      }, ms);
      waiting.add(check);
      check();
    });

  return {
    send: (line) => {
      socket.write(`${line}\r\n`);
    },
    expect,
    lines: () => [...lines],
    close: async () => {
      socket.destroy();
      await ended;
    },
  };
}
