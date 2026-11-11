// A fake gnomcp on a local socket, as the reader container serves it: each connection gets one fake gnomcp child
// (fakeGnomcp.ts) whose stdio is the socket, and the child's end closes the connection.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:net";
import { afterEach } from "vitest";
import { fakeGnomcp, type Scenario } from "./fakeGnomcp.ts";

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

export const fakeGnomcpTcp = async (scenario: Scenario = {}) => {
  const fake = fakeGnomcp(scenario);
  let connections = 0;
  let open = 0;
  const server = createServer((socket) => {
    connections += 1;
    open += 1;
    socket.on("close", () => {
      open -= 1;
    });
    const child = spawn(fake.command, [], { stdio: ["pipe", "pipe", "ignore"] });
    socket.pipe(child.stdin);
    child.stdout.pipe(socket);
    child.on("close", () => socket.destroy());
    socket.on("close", () => child.kill());
    socket.on("error", () => undefined);
    child.stdin.on("error", () => undefined);
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { fake, address: { host: "127.0.0.1", port: address.port }, connections: () => connections, open: () => open };
};
