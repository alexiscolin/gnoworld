// The real server behind the journeys' /api (slice 4's 4a), as nginx puts it behind the demo's: started on a
// free port with a database of its own, each request relayed with the visitor's address in X-Real-IP, which
// it believes from this host alone. Each request gets an address of its own, so its rate limits, per visitor,
// never refuse the journeys. And a test wallet that signs as Adena would (signer.ts, the server's own).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { wallet } from "../../../server/src/testing/signer.ts";

const ENTRY = fileURLToPath(new URL("../../../server/src/main.ts", import.meta.url));
const LISTENING = /"event":"listening".*"port":(\d+)/;

/** Starts the server, allowing a POST from `origins`; resolves to its port once it listens. */
export async function startApi(origins) {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-e2e-"));
  writeFileSync(join(dir, "pepper"), "a-pepper-of-forty-characters-0123456789");
  const child = spawn(process.execPath, ["--disallow-code-generation-from-strings", ENTRY], {
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE: join(dir, "server.db"),
      LOG_PEPPER_FILE: join(dir, "pepper"),
      PORT: "0",
      ORIGINS: origins.join(","),
      TRUSTED_PROXY: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const stop = () => {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  };
  process.once("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      stop();
      process.exit(0);
    });
  }
  return new Promise((resolve, reject) => {
    let heard = "";
    // Read to the end: a child whose output nobody reads stops once its pipe is full.
    child.stdout.on("data", (chunk) => {
      if (heard === undefined) return;
      heard += String(chunk);
      const port = LISTENING.exec(heard)?.[1];
      if (port === undefined) return;
      heard = undefined;
      resolve(Number(port));
    });
    child.once("exit", (code) => {
      reject(new Error(`serve.mjs: the server exited before it listened (${String(code)})`));
    });
  });
}

let visitors = 0;
/** Relays one request to the server, as nginx does, the visitor's address in X-Real-IP. */
export function relay(port, incoming, outgoing) {
  visitors += 1;
  const visitor = `198.18.${String((visitors >> 8) & 255)}.${String(visitors & 255)}`;
  const upstream = request(
    {
      host: "127.0.0.1",
      port,
      method: incoming.method,
      path: incoming.url,
      headers: { ...incoming.headers, "x-real-ip": visitor },
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

const testWallet = wallet();
/** The stand-in for Adena's account and signature: GET /__wallet, POST /__sign { chainId, signer, data }. */
export function walletAnswer(incoming, outgoing, pathname) {
  if (pathname === "/__wallet") {
    outgoing
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ address: testWallet.address }));
    return;
  }
  let body = "";
  incoming.on("data", (chunk) => (body += String(chunk)));
  incoming.on("end", () => {
    const { chainId, signer, data } = JSON.parse(body);
    outgoing
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(testWallet.sign(chainId, data, signer)));
  });
}
