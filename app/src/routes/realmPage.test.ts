import { describe, expect, test, vi } from "vitest";
import { realmRoom } from "@gnoworld/core";
import { realmTalk, roomListed } from "./realmPage.tsx";

const ids = { ok: true, value: { world: "gns", sections: [{ rooms: [{ room: "#gns" }] }] } };
const at = { realm: "gno.land/r/x/gns", world: "gns", room: "#gns" };

describe("a realm's room made for its dock", () => {
  test("is failed when the server refuses to make it, so the dock says so", async () => {
    const api = {
      rooms: () => Promise.resolve({ ok: true, value: { world: "gns", sections: [] } }),
      realm: () => Promise.resolve({ ok: false, reason: "refused" }),
    };
    expect(await roomListed(at, () => true, { api: api as never })).toBe(false);
  });

  test("tells the page's lists only once it had to ask for the room: a room the world already lists changes none", async () => {
    const listedAt = (first: number) => {
      let asked = 0;
      return {
        rooms: () => Promise.resolve((asked += 1) > first ? ids : { ok: true, value: { world: "gns", sections: [] } }),
        realm: () => Promise.resolve({ ok: true }),
      };
    };
    const already = vi.fn();
    expect(await roomListed(at, () => true, { api: listedAt(0) as never, changed: already })).toBe(true);
    expect(already).not.toHaveBeenCalled();
    const made = vi.fn();
    expect(await roomListed(at, () => true, { api: listedAt(1) as never, changed: made })).toBe(true);
    expect(made).toHaveBeenCalledOnce();
  });

  test("is made once the world lists the room", async () => {
    const api = { rooms: () => Promise.resolve(ids), realm: () => Promise.resolve({ ok: true }) };
    expect(await roomListed(at, () => true, { api: api as never })).toBe(true);
  });
});

describe("a realm's talk", () => {
  test("hands the plate the realm's room by its whole id, as the chat keys it, and the chat's link its name in its world", () => {
    const realm = "gno.land/r/samcrew/memba_appstore_v3";
    const { world, room } = realmRoom(realm, []);
    expect(realmTalk(realm, [])).toEqual({ talk: world, room, inWorld: room.split("/")[1] });
    expect(room).toMatch(/^#[^/]+\/[^/]+$/);
  });
});
