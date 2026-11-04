import { once } from "node:events";
import { createServer } from "node:http";
import { connect } from "node:net";
import { describe, expect, it } from "vitest";
import { serverOptions, stop, TIMEOUTS } from "./http.ts";

// server/src/app.test.ts and jarvis/src/http.test.ts read these through their servers; this file holds what the
// package's own tests must see, as StrykerJS counts them.
describe("serverOptions", () => {
  it("gives Node's server the timeouts: headers in 5 s, a request in 10 s, an idle connection 5 s, checked each second", () => {
    expect(serverOptions()).toEqual({
      headersTimeout: 5_000,
      requestTimeout: 10_000,
      keepAliveTimeout: 5_000,
      connectionsCheckingInterval: 1_000,
    });
    expect(serverOptions({ headers: 1, request: 2, keepAlive: 3, check: 4 })).toEqual({
      headersTimeout: 1,
      requestTimeout: 2,
      keepAliveTimeout: 3,
      connectionsCheckingInterval: 4,
    });
    expect(TIMEOUTS).toEqual({ headers: 5_000, request: 10_000, keepAlive: 5_000, check: 1_000 });
  });
});

describe("stop", () => {
  it("closes the server, then cuts a client stalled in its headers once its time is up", async () => {
    const server = createServer(serverOptions({ headers: 60_000, request: 60_000, keepAlive: 60_000, check: 1_000 }));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    const client = connect(address.port, "127.0.0.1");
    client.on("error", () => undefined);
    await once(client, "connect");
    const closed = new Promise((resolve) => client.on("close", resolve));
    client.write("GET / HTTP/1.1\r\nHost: localhost\r\n");
    const stopped = new Promise<void>((resolve) => {
      stop(server, resolve, 100);
    });
    await stopped;
    await closed;
    expect(server.listening).toBe(false);
  });
});
