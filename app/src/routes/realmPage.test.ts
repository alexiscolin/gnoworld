import { describe, expect, test } from "vitest";
import { roomListed } from "./realmPage.tsx";

const ids = { ok: true, value: { world: "gns", sections: [{ rooms: [{ room: "#gns" }] }] } };
const at = { realm: "gno.land/r/x/gns", world: "gns", room: "#gns" };

describe("a realm's room made for its dock", () => {
  test("is failed when the server refuses to make it, so the dock says so", async () => {
    const api = {
      rooms: () => Promise.resolve({ ok: true, value: { world: "gns", sections: [] } }),
      realm: () => Promise.resolve({ ok: false, reason: "refused" }),
    };
    expect(await roomListed(at, () => true, api as never)).toBe(false);
  });

  test("is made once the world lists the room", async () => {
    const api = { rooms: () => Promise.resolve(ids), realm: () => Promise.resolve({ ok: true }) };
    expect(await roomListed(at, () => true, api as never)).toBe(true);
  });
});
