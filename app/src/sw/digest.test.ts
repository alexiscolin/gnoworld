import { expect, test } from "vitest";
import { integrity } from "./digest.ts";

// The one spelling of a file's digest, the build's and the worker's both: subresource integrity's,
// sha384 in base64 (F342). Each value is node's own createHash.
test("writes a file's digest as subresource integrity does, sha384 in base64", async () => {
  expect(await integrity(new TextEncoder().encode("abc"))).toBe(
    "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
  );
  expect(await integrity(new Uint8Array())).toBe(
    "sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb",
  );
});

// The build reads files as node's Buffers, often views into a larger pool: only the view counts.
test("digests only the bytes a view shows, not the buffer around it", async () => {
  const pool = new TextEncoder().encode("xxabcyy");
  expect(await integrity(new Uint8Array(pool.buffer, 2, 3))).toBe(await integrity(new TextEncoder().encode("abc")));
});
