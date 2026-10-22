import { once } from "node:events";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { rawClient } from "./rawClient.ts";

const servers: Server[] = [];
// A fake server: the test writes to the client's socket and reads what it sent.
const far = async (): Promise<{ port: number; peer: Promise<Socket>; heard: () => string }> => {
  let heard = "";
  const server = createServer();
  servers.push(server);
  const peer = new Promise<Socket>((resolve) => {
    server.once("connection", (socket) => {
      socket.on("data", (chunk: Buffer) => (heard += chunk.toString()));
      resolve(socket);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { port: (server.address() as AddressInfo).port, peer, heard: () => heard };
};

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe("rawClient", () => {
  it("sends each line ended with CRLF", async () => {
    const { port, peer, heard } = await far();
    const client = await rawClient(port);
    await peer;
    client.send("NICK alice");
    client.send("USER a 0 * :a");
    await expect.poll(heard).toBe("NICK alice\r\nUSER a 0 * :a\r\n");
    await client.close();
  });

  it("splits what arrives into lines, whatever the chunks: a CRLF or a character cut in two", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    const socket = await peer;
    const pieces = [":a 001 alice :hi\r", "\n:a 0", "02 alice :host\n:a 003 alice :", Buffer.from("👍").subarray(0, 2)];
    for (const piece of pieces) {
      socket.write(piece);
      // Each write its own chunk: the client has read it before the next one leaves.
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    socket.write(Buffer.concat([Buffer.from("👍").subarray(2), Buffer.from("\r\n")]));
    await expect(client.expect(/ 003 /)).resolves.toBe(":a 003 alice :👍");
    expect(client.lines()).toEqual([":a 001 alice :hi", ":a 002 alice :host", ":a 003 alice :👍"]);
    await client.close();
  });

  it("matches a line already received and not yet taken, and never the same line twice", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    const socket = await peer;
    socket.write("PING :one\r\nPING :two\r\n");
    await expect.poll(() => client.lines().length).toBe(2);
    await expect(client.expect(/^PING/)).resolves.toBe("PING :one");
    await expect(client.expect(/^PING/)).resolves.toBe("PING :two");
    await expect(client.expect(/^PING/, 100)).rejects.toThrow(/PING :one/);
    await client.close();
  });

  it("hands a line that comes after a match to the next wait, not to the one that ended", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    const socket = await peer;
    socket.write("PING :one\r\n");
    await expect(client.expect(/^PING/)).resolves.toBe("PING :one");
    socket.write("PING :two\r\n");
    await expect.poll(() => client.lines().length).toBe(2);
    await expect(client.expect(/^PING/, 500)).resolves.toBe("PING :two");
    await client.close();
  });

  it("takes the lines it skipped to reach a match", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    (await peer).write(":a 001 alice :hi\r\n:a 002 alice :host\r\n:a 003 alice :made\r\n");
    await expect(client.expect(/ 003 /)).resolves.toBe(":a 003 alice :made");
    await expect(client.expect(/ 001 /, 100)).rejects.toThrow(/no line matched/);
    await client.close();
  });

  it("waits for a line that comes within its time", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    const socket = await peer;
    setTimeout(() => socket.write(":a 001 alice :late\r\n"), 100);
    await expect(client.expect(/ 001 /, 1000)).resolves.toBe(":a 001 alice :late");
    await client.close();
  });

  it("gives up after its time with the lines it saw, and never hangs", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    (await peer).write("NOTICE * :hello\r\n");
    const started = performance.now();
    await expect(client.expect(/ 001 /, 150)).rejects.toThrow(/NOTICE \* :hello/);
    expect(performance.now() - started).toBeLessThan(1000);
    await client.close();
  });

  it("still finds a line that came before the far end closed, then refuses to wait", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    (await peer).end("ERROR :Closing link\r\n");
    await expect(client.expect(/^ERROR/, 5000)).resolves.toBe("ERROR :Closing link");
    const started = performance.now();
    await expect(client.expect(/ 001 /, 5000)).rejects.toThrow(/closed/);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("refuses to wait when the far end resets, and does not crash", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    const waiting = client.expect(/ 001 /, 5000);
    (await peer).resetAndDestroy();
    await expect(waiting).rejects.toThrow(/closed/);
  });

  it("closes as often as asked, before or after the far end", async () => {
    const { port, peer } = await far();
    const client = await rawClient(port);
    (await peer).end();
    await expect(client.expect(/x/, 5000)).rejects.toThrow(/closed/);
    await client.close();
    await client.close();
    const other = await far();
    const second = await rawClient(other.port);
    await second.close();
    await expect(second.close()).resolves.toBeUndefined();
  });

  it("refuses a port nothing listens on", async () => {
    const { port } = await far();
    for (const server of servers.splice(0)) server.close();
    await expect(rawClient(port)).rejects.toThrow(/ECONNREFUSED/);
  });
});
