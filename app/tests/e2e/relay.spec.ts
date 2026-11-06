// The journeys' relay (api.mjs) stands for nginx: a page gone ends its request upstream, or each stream it held keeps one
// of the server's 1,000 slots for good, and late journeys meet a 429 (F5763: typing.spec.ts, once 9g's pages opened more).
import { createServer, get, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { relay } from "./api.mjs";

const listening = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });

test("the relay ends a request upstream once its page is gone", async () => {
  let open = 0;
  const upstream = createServer((_incoming, outgoing) => {
    open += 1;
    outgoing.on("close", () => {
      open -= 1;
    });
    outgoing.writeHead(200);
    outgoing.write(": a stream that never ends\n\n");
  });
  const port = await listening(upstream);
  const front = createServer((incoming, outgoing) => {
    relay(port, incoming, outgoing);
  });
  const page = get(`http://127.0.0.1:${String(await listening(front))}/`, () => undefined);
  page.on("error", () => undefined);
  await expect.poll(() => open).toBe(1);
  page.destroy();
  await expect.poll(() => open).toBe(0);
  front.closeAllConnections();
  upstream.closeAllConnections();
  front.close();
  upstream.close();
});
