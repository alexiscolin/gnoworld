// A fake's HTTP server for jarvis's tests: on the loopback, on a port of its own, answering each request with the
// fake's `handle` (a fault answered 500 when nothing was written yet), with its origin and its close; and a request's
// body as text.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/** A request's whole body, as UTF-8 text. */
export const bodyOf = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString("utf8");
};

/** A server answering with `handle`, listening on the loopback: its origin, and its close, which cuts every connection. */
export async function onLoopback(handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>) {
  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      if (!response.headersSent) response.writeHead(500).end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("a fake on the loopback has no port");
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
