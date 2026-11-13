// The link reader's client (slice 13, L3; docs/plans/link-previews.md §3 step 3): `POST /card {url}` to the reader on the network only the two
// share. The body is the page's URL and nothing else (no cookie, no account, no line); the call has a timeout and follows no redirect (the one way
// out, net.ts); the answer is read up to a cap before it is parsed; anything but a 200 of JSON is the reader being down.
import { Failure, readJson, send as netSend } from "@gnoworld/service/net";

const READER_MS = 8000;
const READER_BYTES = 64 * 1024;

/** The reader's answer for a page, unchecked data; it rejects when the reader is down. */
export function readerClient({
  url,
  send = netSend,
}: {
  url: string;
  send?: typeof netSend;
}): (page: string) => Promise<unknown> {
  return async (page) => {
    const response = await send(
      `${url}/card`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: page }) },
      READER_MS,
    );
    // Not a 200, not JSON or past the cap: the reader is down for this page.
    const answer = await readJson(response, READER_BYTES);
    if (answer === undefined) throw new Failure("status");
    return answer;
  };
}
