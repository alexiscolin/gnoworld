// The real server behind the journeys' /api (slice 4's 4a) and the real Ergo behind their /ws (4b), as nginx puts
// them behind the demo's: each started on free ports with a database or a folder of its own, the server linked
// to Ergo as the stack links it, and each request or upgrade relayed with the visitor's address (X-Real-IP for the
// server, which it believes from this host alone; X-Forwarded-For for Ergo, which does from localhost). Each
// connection gets an address of its own, so the limits, per visitor, never refuse the journeys. And a test wallet
// that signs as Adena would (signer.ts, the server's own).
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { freePort, startErgo } from "../../../server/src/testing/ergo.ts";
import { rawClient } from "../../../server/src/testing/rawClient.ts";
import { wallet } from "../../../server/src/testing/signer.ts";

const ENTRY = fileURLToPath(new URL("../../../server/src/main.ts", import.meta.url));
const AUTH_PORT = fileURLToPath(new URL("authPort.mjs", import.meta.url));
const ROLES = fileURLToPath(new URL("../../../server/roles.json", import.meta.url));
// The journeys' rooms (4b), added to the shipped roles file's Bubble: a section, Talk, of #games then the main
// room, and #news outside it; so the first room listed is not the main one.
const BUBBLE = {
  rooms: [
    { room: "#bubble/games", type: "open" },
    { room: "#bubble/news", type: "announcement" },
  ],
  sections: [{ name: "Talk", rooms: ["#bubble/games", "#bubble"] }],
};

// The shipped roles file with the journeys' rooms, and Bubble's moderators (4d's pins): the test wallets named
// moderator0 to moderator8 (/__wallet?as=moderator0), one a worker and the last for the cap's test, known before the server starts so their addresses
// are in the file. Written where the server reads it; its worlds.
function writeRoles(path) {
  const roles = JSON.parse(readFileSync(ROLES, "utf8"));
  const moderators = Array.from({ length: 9 }, (_, n) => walletOf({ url: `/?as=moderator${String(n)}` }).address);
  roles.worlds = roles.worlds.map((world) => (world.slug === "bubble" ? { ...world, ...BUBBLE, moderators } : world));
  writeFileSync(path, JSON.stringify(roles));
  return roles.worlds;
}
const LISTENING = /"event":"listening".*"port":(\d+)/;
const LINKED = /"event":"irc_ready"/;

/**
 * Starts Ergo, then the server linked to it, allowing a POST and a WebSocket from `origins`; resolves to the
 * server's port and Ergo's WebSocket port once the server listens and its bot has opened the rooms. Both stop, and
 * their folders go, when the process ends.
 */
export async function startBackend(origins) {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-e2e-"));
  writeFileSync(join(dir, "pepper"), "a-pepper-of-forty-characters-0123456789");
  // The server takes the operator's password from a file, 32 characters at least (config.ts).
  const operPassword = randomBytes(16).toString("hex");
  writeFileSync(join(dir, "oper"), operPassword);
  // The ticket logins reach the server's auth handler through a port (authPort.mjs), on which Ergo's script dials.
  const authPort = await freePort();
  const worlds = writeRoles(join(dir, "roles.json"));
  const ergo = await startErgo({ origins, operPassword, authScript: { forward: authPort } }).catch((error) => {
    rmSync(dir, { recursive: true, force: true });
    throw new Error("serve.mjs: Ergo did not start; sh scripts/ergo.sh builds the binary the journeys need", {
      cause: error,
    });
  });
  const child = spawn(process.execPath, ["--disallow-code-generation-from-strings", "--import", AUTH_PORT, ENTRY], {
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE: join(dir, "server.db"),
      LOG_PEPPER_FILE: join(dir, "pepper"),
      PORT: "0",
      ORIGINS: origins.join(","),
      TRUSTED_PROXY: "127.0.0.1",
      AUTH_SOCKET: join(dir, "auth.sock"),
      E2E_AUTH_PORT: String(authPort),
      ERGO_PORT: String(ergo.port),
      ERGO_OPER_PASSWORD_FILE: join(dir, "oper"),
      ROLES_FILE: join(dir, "roles.json"),
      // D218: only GovDAO can be first charted, which arrival.spec.ts owns: the worlds the other journeys open, Bubble and
      // Earth, are never charted, so their plates and pictures stay as they were and no journey earns a banner by its order.
      FIRST_TO_CHART_WORLDS: "govdao",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  // The server leaves Ergo as it stops; the folder goes last, and a server that ignores TERM is killed.
  let stopping;
  const stop = () =>
    (stopping ??= (async () => {
      child.kill("SIGTERM");
      const patience = setTimeout(() => child.kill("SIGKILL"), 3000);
      await exited;
      clearTimeout(patience);
      await ergo.stop();
      rmSync(dir, { recursive: true, force: true });
    })());
  // startErgo's own exit handler kills Ergo and removes its folder.
  process.once("exit", () => {
    child.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      stop().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }
  try {
    const api = await new Promise((resolve, reject) => {
      let heard = "";
      const timer = setTimeout(() => {
        reject(new Error(`serve.mjs: the server did not listen and link to Ergo in 15 s:\n${String(heard)}`));
      }, 15_000);
      // Read to the end: a child whose output nobody reads stops once its pipe is full.
      child.stdout.on("data", (chunk) => {
        if (heard === undefined) return;
        heard += String(chunk);
        const port = LISTENING.exec(heard)?.[1];
        if (port === undefined || !LINKED.test(heard)) return;
        heard = undefined;
        clearTimeout(timer);
        resolve(Number(port));
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`serve.mjs: the server exited before it listened (${String(code)})`));
      });
    });
    await joinable(
      ergo.port,
      worlds.flatMap(({ slug, rooms = [] }) => [`#${slug}`, ...rooms.map(({ room }) => room)]),
    );
    return { api, ws: ergo.wsPort };
  } catch (error) {
    await stop();
    throw error;
  }
}

// Waits until a guest can join each room: the server's bot has made it, and its reconciler has opened it (a room
// is invite-only until then), which Ergo does a moment after the server says its link is ready.
async function joinable(port, rooms) {
  const guest = await rawClient(port);
  try {
    guest.send("NICK ready");
    guest.send("USER ready 0 * :ready");
    await guest.expect(/ 001 /, 5000);
    const end = Date.now() + 10_000;
    for (const room of rooms) {
      for (;;) {
        guest.send(`JOIN ${room}`);
        const answer = await guest.expect(new RegExp(` (366|4\\d\\d|5\\d\\d) \\S+ ${room} `));
        if (answer.includes(" 366 ")) break;
        if (Date.now() > end) throw new Error(`serve.mjs: the server's bot has not opened ${room} in 10 s: ${answer}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  } finally {
    await guest.close();
  }
}

// The WebSockets relayed and still open, by the e2e-tag cookie their page's context set, which dropSockets ends at
// once, as a network gone would: a test drops its own pages' alone, never another worker's.
const open = new Map();
const tagOf = (incoming) => /(?:^|;\s*)e2e-tag=([\w-]+)/.exec(incoming.headers.cookie ?? "")?.[1];
/** Ends every WebSocket relayed to Ergo from the pages that carry this tag. */
export function dropSockets(tag) {
  for (const socket of open.get(tag) ?? []) socket.destroy();
}

let visitors = 0;
/** The next visitor's address, one of its own for each request or connection. */
const nextVisitor = () => {
  visitors += 1;
  return `198.18.${String((visitors >> 8) & 255)}.${String(visitors & 255)}`;
};

/** Relays one request to the server, as nginx does, the visitor's address in X-Real-IP. */
export function relay(port, incoming, outgoing) {
  const upstream = request(
    {
      host: "127.0.0.1",
      port,
      method: incoming.method,
      path: incoming.url,
      headers: { ...incoming.headers, "x-real-ip": nextVisitor() },
    },
    (answer) => {
      outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(outgoing);
    },
  );
  upstream.on("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(502);
    outgoing.end();
  });
  incoming.pipe(upstream);
}

// What nginx's /ws sets itself (deploy/web/nginx.conf): the visitor's address, from nothing the client sent, and no
// Authorization.
const SET_BY_HOST = new Set(["x-forwarded-for", "x-real-ip", "authorization"]);
/**
 * Relays a WebSocket's upgrade to Ergo's listener, as nginx's /ws does: the client's headers (its Origin among
 * them) handed on, the visitor's address in X-Forwarded-For, which Ergo believes from localhost; what follows is
 * Ergo's answer and the frames, byte for byte.
 */
export function relayUpgrade(port, incoming, socket, head) {
  const tag = tagOf(incoming);
  if (tag !== undefined) {
    const tagged = open.get(tag) ?? new Set();
    open.set(tag, tagged.add(socket));
    socket.on("close", () => tagged.delete(socket));
  }
  const visitor = nextVisitor();
  const lines = [`GET ${incoming.url} HTTP/1.1`];
  for (let n = 0; n < incoming.rawHeaders.length; n += 2) {
    const [name, value] = [incoming.rawHeaders[n], incoming.rawHeaders[n + 1]];
    if (!SET_BY_HOST.has(name.toLowerCase())) lines.push(`${name}: ${value}`);
  }
  const upstream = connect(port, "127.0.0.1");
  upstream.write([...lines, `X-Forwarded-For: ${visitor}`, `X-Real-IP: ${visitor}`, "", ""].join("\r\n"));
  upstream.write(head);
  socket.pipe(upstream);
  upstream.pipe(socket);
  for (const [from, to] of [
    [socket, upstream],
    [upstream, socket],
  ]) {
    from.on("error", () => to.destroy());
    from.on("close", () => to.destroy());
  }
}

// A wallet for each name a journey gives (?as=), the unnamed one the login journeys'; each an account of its own,
// so the server's ten tickets a minute an account, and Ergo's making of an account at its first login, are each
// test's alone.
const wallets = new Map();
const walletOf = (incoming) => {
  const name = new URL(incoming.url ?? "/", "http://host").searchParams.get("as") ?? "";
  if (!wallets.has(name)) wallets.set(name, wallet());
  return wallets.get(name);
};
/** The stand-in for Adena's account and signature: GET /__wallet, POST /__sign { chainId, signer, data }. */
export function walletAnswer(incoming, outgoing, pathname) {
  if (pathname === "/__wallet") {
    outgoing
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ address: walletOf(incoming).address }));
    return;
  }
  let body = "";
  incoming.on("data", (chunk) => (body += String(chunk)));
  incoming.on("end", () => {
    const { chainId, signer, data } = JSON.parse(body);
    outgoing
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(walletOf(incoming).sign(chainId, data, signer)));
  });
}
