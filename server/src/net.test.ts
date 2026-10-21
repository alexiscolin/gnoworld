import { once } from "node:events";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { send } from "./net.ts";

const servers: Server[] = [];
const far = async (listener: RequestListener): Promise<string> => {
  const server = createServer(listener);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(port)}/`;
};

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

describe("send", () => {
  it("passes the call through, method and body", async () => {
    const url = await far((req, res) => {
      req.pipe(res);
    });
    const response = await send(url, { method: "POST", body: "checked" }, 1000);
    expect(await response.text()).toBe("checked");
  });

  it("cuts a call the far end leaves hanging, at its timeout", async () => {
    const url = await far(() => undefined);
    const started = performance.now();
    await expect(send(url, {}, 100)).rejects.toMatchObject({ name: "TimeoutError" });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("cuts a body that stalls once the headers came", async () => {
    const url = await far((_, res) => {
      res.writeHead(200).write("half");
    });
    const response = await send(url, {}, 200);
    await expect(response.text()).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("follows no redirect, which could lead anywhere", async () => {
    let reached = false;
    const elsewhere = await far((_, res) => {
      reached = true;
      res.end();
    });
    const url = await far((_, res) => {
      res.writeHead(302, { location: elsewhere }).end();
    });
    await expect(send(url, {}, 1000)).rejects.toSatisfy(
      (error: unknown) => error instanceof TypeError && String(error.cause).includes("redirect"),
    );
    expect(reached).toBe(false);
  });

  it("keeps its timeout and its refusal of redirects whatever the caller asks", async () => {
    let reached = false;
    const elsewhere = await far((_, res) => {
      reached = true;
      res.end();
    });
    const moved = await far((_, res) => {
      res.writeHead(302, { location: elsewhere }).end();
    });
    const hangs = await far(() => undefined);
    const never = new AbortController().signal;
    await expect(send(moved, { redirect: "follow" }, 1000)).rejects.toThrow(TypeError);
    expect(reached).toBe(false);
    await expect(send(hangs, { signal: never }, 100)).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
