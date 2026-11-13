import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { send as netSend } from "@gnoworld/service/net";
import { describe, expect, it, vi } from "vitest";
import { readerClient } from "./reader.ts";

// L3 (docs/plans/link-previews.md §3 step 3, §4 "A compromised reader"): the call to the link reader carries the page's URL and nothing else,
// has a timeout, follows no redirect (net.ts's send), reads a capped body, and takes anything but a 200 of JSON for the reader being down.
const URL_ = "http://link_reader:8084";
const reply = (body: string, status = 200) =>
  vi.fn<typeof netSend>(() => Promise.resolve(new Response(body, { status })));

describe("readerClient", () => {
  it("posts {url} alone to the reader's /card, as JSON, with a timeout", async () => {
    const send = reply('{"title":"t"}');
    expect(await readerClient({ url: URL_, send })("https://example.com/a")).toEqual({ title: "t" });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      `${URL_}/card`,
      { method: "POST", headers: { "content-type": "application/json" }, body: '{"url":"https://example.com/a"}' },
      expect.any(Number) as unknown,
    );
    expect(send.mock.calls[0]?.[2]).toBeGreaterThan(0);
    expect(send.mock.calls[0]?.[2]).toBeLessThanOrEqual(10_000);
  });

  it("sends no cookie, no account, no line: the headers are the content type alone", async () => {
    const send = reply("{}");
    await readerClient({ url: URL_, send })("https://example.com/a");
    expect(send.mock.calls[0]?.[1].headers).toEqual({ "content-type": "application/json" });
  });

  it.each([
    ["a 500", reply("{}", 500)],
    ["a 404", reply("{}", 404)],
    ["a body that is not JSON", reply("<html>")],
    ["an empty body", reply("")],
    ["a body past the cap", reply(`{"title":"${"a".repeat(70_000)}"}`)],
  ])("rejects for %s: the reader is down for this page", async (_name, send) => {
    await expect(readerClient({ url: URL_, send })("https://example.com/a")).rejects.toThrow();
  });

  it("rejects when the call itself fails or times out, and calls nowhere but the reader's address", async () => {
    const send = vi.fn<typeof netSend>(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(readerClient({ url: URL_, send })("https://example.com/a")).rejects.toThrow();
    expect(send.mock.calls.every(([url]) => url.startsWith(`${URL_}/`))).toBe(true);
  });

  it("gives up at its own deadline on a reader that sends its headers, then stalls mid-body", async () => {
    const stalled = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"title":');
    });
    await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
    const { port } = stalled.address() as AddressInfo;
    try {
      const begun = Date.now();
      const send: typeof netSend = (url, init) => netSend(url, init, 200);
      await expect(
        readerClient({ url: `http://127.0.0.1:${String(port)}`, send })("https://example.com/a"),
      ).rejects.toThrow();
      expect(Date.now() - begun).toBeLessThan(2000);
    } finally {
      stalled.closeAllConnections();
      stalled.close();
    }
  });
});
