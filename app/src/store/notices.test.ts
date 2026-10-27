import { parseLine, type IrcMessage, type Notice, type NoticeMode } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { NoticePrefs } from "../lib/notices/prefs.ts";
import { createAppStore } from "./index.ts";
import { badgeOf, modeOf, NOTICES_KEPT, totalUnseen, unseenNotices } from "./notices.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1f6dcp6he2vq9gymrm4yrnyx66n0578vf7fsksl";
const GAMES = "#bubble/games";
const MAIN = "#bubble";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};

// 4f-n (docs/decisions.md, 2026-10-26): the notices a page holds, which of them are unseen, and what each room counts.
describe("the store's notices slice", () => {
  const setup = (rooms: readonly string[] = [GAMES, MAIN]) => {
    const store = createAppStore();
    store.getState().chatActions.connected(ME);
    store.getState().chatActions.follow(rooms);
    const state = () => store.getState();
    const { noticeActions: notices, chatActions } = store.getState();
    // A line of a room, by an account, `minute` past 10:00.
    const said = (room: string, [id, minute]: readonly [string, number], { text = id, from = ALICE } = {}) => {
      chatActions.heard(read(`@msgid=${id};time=${T(minute)};account=${from} :${from}!u@h PRIVMSG ${room} :${text}`));
    };
    // A NOTICE of the moderation bot, which counts as no unread line.
    const noticed = (room: string, id: string, minute: number) => {
      chatActions.heard(read(`@msgid=${id};time=${T(minute)} :gnoworld!u@h NOTICE ${room} :a verdict`));
    };
    const marked = (room: string, minute: number) => {
      chatActions.heard(read(`:ergo.test MARKREAD ${room} timestamp=${T(minute)}`));
    };
    const heard = () => {
      let count = 0;
      store.subscribe(() => {
        count += 1;
      });
      return () => count;
    };
    return { store, state, notices, said, noticed, marked, heard };
  };
  const notice = (over: Partial<Notice> = {}): Notice => ({
    id: "n1",
    kind: "mention",
    where: GAMES,
    time: T(5),
    by: ALICE,
    ...over,
  });
  const ids = (list: readonly Notice[]) => list.map(({ id }) => id);

  describe("what it keeps", () => {
    it("keeps each notice once, in the order they came, notifying no one of one it holds", () => {
      const t = setup();
      t.notices.add(notice({ id: "a" }));
      t.notices.add(notice({ id: "b", time: T(6) }));
      const heard = t.heard();
      t.notices.add(notice({ id: "a" }));
      expect(heard()).toBe(0);
      expect(ids(t.state().notices)).toEqual(["a", "b"]);
    });

    it("keeps the newest NOTICES_KEPT, the oldest going first", () => {
      const t = setup();
      for (let at = 0; at <= NOTICES_KEPT; at += 1) t.notices.add(notice({ id: `n${String(at)}` }));
      expect(t.state().notices).toHaveLength(NOTICES_KEPT);
      expect(t.state().notices[0]?.id).toBe("n1");
      expect(t.state().notices.at(-1)?.id).toBe(`n${String(NOTICES_KEPT)}`);
    });

    // R10: past the cap a notice already seen goes first, since none counts it; else the oldest; and what a room or a
    // conversation counts is what the store holds, so no badge keeps a notice that is gone.
    it("drops a seen notice before an unseen one when it holds more than NOTICES_KEPT", () => {
      const t = setup();
      t.notices.add(notice({ id: "dm", kind: "dm", where: ALICE, time: T(1) }));
      t.notices.add(notice({ id: "seen", where: GAMES, time: T(1) }));
      t.notices.seen(GAMES, T(1));
      for (let at = 0; at < NOTICES_KEPT - 2; at += 1) t.notices.add(notice({ id: `n${String(at)}`, where: MAIN }));
      expect(t.state().notices).toHaveLength(NOTICES_KEPT);
      t.notices.add(notice({ id: "last", where: MAIN }));
      expect(t.state().notices).toHaveLength(NOTICES_KEPT);
      expect(ids(t.state().notices)).toContain("dm");
      expect(ids(t.state().notices)).not.toContain("seen");
      expect(ids(t.state().notices).at(-1)).toBe("last");
    });

    it("drops the oldest unseen notice once none is seen, and keeps each badge equal to what it holds", () => {
      const t = setup();
      t.notices.add(notice({ id: "dm", kind: "dm", where: ALICE }));
      for (let at = 0; at < NOTICES_KEPT; at += 1) t.notices.add(notice({ id: `n${String(at)}`, where: MAIN }));
      expect(ids(t.state().notices)).not.toContain("dm");
      expect(badgeOf(t.state(), ALICE)).toBe(0);
      expect(badgeOf(t.state(), MAIN)).toBe(NOTICES_KEPT);
      expect(totalUnseen(t.state())).toBe(unseenNotices(t.state()).length);
    });

    it("drops a notice by its line's id, as a deleted or a hidden line goes, and notifies no one of an unknown id", () => {
      const t = setup();
      t.notices.add(notice({ id: "a" }));
      t.notices.add(notice({ id: "b" }));
      t.notices.drop("a");
      expect(ids(t.state().notices)).toEqual(["b"]);
      const heard = t.heard();
      t.notices.drop("zzz");
      expect(heard()).toBe(0);
    });
  });

  describe("which are unseen", () => {
    it("holds a notice unseen until the reader has seen its room up to its time, a mark moving only forward", () => {
      const t = setup();
      t.notices.add(notice());
      expect(ids(unseenNotices(t.state()))).toEqual(["n1"]);
      t.notices.seen(GAMES, T(4));
      expect(ids(unseenNotices(t.state()))).toEqual(["n1"]);
      t.notices.seen(GAMES, T(5));
      expect(unseenNotices(t.state())).toEqual([]);
      t.notices.seen(GAMES, T(1));
      expect(t.state().noticeSeen[GAMES]).toBe(T(5));
      expect(unseenNotices(t.state())).toEqual([]);
    });

    // R11: React reads a selector's answer on every render (zustand's useSyncExternalStore), and draws again for a new
    // array each time: the same list while it holds the same notices.
    it("gives the same list while it holds the same notices, whatever else the store changes", () => {
      const t = setup();
      t.notices.add(notice({ id: "a" }));
      const first = unseenNotices(t.state());
      expect(unseenNotices(t.state())).toBe(first);
      t.said(MAIN, ["m1", 1]);
      t.store.getState().chatActions.heard(read(":ergo.test TOPIC #bubble/games :a topic"));
      expect(unseenNotices(t.state())).toBe(first);
      t.notices.add(notice({ id: "b", time: T(6) }));
      expect(unseenNotices(t.state())).not.toBe(first);
      expect(ids(unseenNotices(t.state()))).toEqual(["a", "b"]);
    });

    it("notifies once for a mark that moves, and no one for one that does not", () => {
      const t = setup();
      const heard = t.heard();
      t.notices.seen(GAMES, T(5));
      expect(heard()).toBe(1);
      t.notices.seen(GAMES, T(5));
      t.notices.seen(GAMES, T(2));
      expect(heard()).toBe(1);
    });

    it("keeps a mark for each place: a room seen hides another's notices not at all", () => {
      const t = setup();
      t.notices.add(notice({ id: "a", where: GAMES }));
      t.notices.add(notice({ id: "b", where: MAIN }));
      t.notices.seen(GAMES, T(9));
      expect(ids(unseenNotices(t.state()))).toEqual(["b"]);
    });

    // Ergo keeps the reading place of the account for all its devices (draft/read-marker): a room read on a phone
    // is seen here, with no mark of the page's own.
    it("holds a notice seen once Ergo's reading place of its room is at its line or past it", () => {
      const t = setup();
      t.notices.add(notice({ id: "a", time: T(5) }));
      t.notices.add(notice({ id: "b", time: T(7) }));
      t.notices.add(notice({ id: "c", time: T(7), where: MAIN }));
      t.marked(GAMES, 5);
      expect(ids(unseenNotices(t.state()))).toEqual(["b", "c"]);
      t.marked(GAMES, 8);
      expect(ids(unseenNotices(t.state()))).toEqual(["c"]);
    });

    it("leaves out the notices of a room the page no longer follows, which no list could open", () => {
      const t = setup([GAMES]);
      t.notices.add(notice({ where: MAIN }));
      expect(unseenNotices(t.state())).toEqual([]);
      t.store.getState().chatActions.follow([GAMES, MAIN]);
      expect(ids(unseenNotices(t.state()))).toEqual(["n1"]);
    });

    // G6 (F1505): the same count with other content is a new list, though one place of the old list holds the same notice.
    it("answers the new list when one notice left and another came, the count the same, the first kept", () => {
      const t = setup();
      t.notices.add(notice({ id: "a", where: GAMES, time: T(5) }));
      t.notices.add(notice({ id: "b", where: MAIN, time: T(5) }));
      expect(ids(unseenNotices(t.state()))).toEqual(["a", "b"]);
      t.notices.seen(MAIN, T(5));
      t.notices.add(notice({ id: "c", where: GAMES, time: T(6) }));
      expect(ids(unseenNotices(t.state()))).toEqual(["a", "c"]);
    });

    it("keeps a direct message's notice under its partner's address, which no room's reading place reaches", () => {
      const t = setup();
      t.notices.add(notice({ id: "d", kind: "dm", where: ALICE }));
      expect(ids(unseenNotices(t.state()))).toEqual(["d"]);
      t.notices.seen(ALICE, T(5));
      expect(unseenNotices(t.state())).toEqual([]);
    });
  });

  describe("a room's mode", () => {
    it("is mentions, the default, until the reader chooses another, and is read by its own key only", () => {
      const t = setup();
      expect(modeOf(t.state(), GAMES)).toBe("mentions");
      expect(modeOf(t.state(), "constructor")).toBe("mentions");
      t.notices.setMode(GAMES, "all");
      expect(modeOf(t.state(), GAMES)).toBe("all");
      expect(modeOf(t.state(), MAIN)).toBe("mentions");
    });

    it("hides the notices of a room that is none, and brings them back with the mode", () => {
      const t = setup();
      t.notices.add(notice({ id: "a", where: GAMES }));
      t.notices.add(notice({ id: "b", where: MAIN }));
      t.notices.add(notice({ id: "d", kind: "dm", where: ALICE }));
      t.notices.setMode(GAMES, "none");
      expect(ids(unseenNotices(t.state()))).toEqual(["b", "d"]);
      t.notices.setMode(GAMES, "mentions");
      expect(ids(unseenNotices(t.state()))).toEqual(["a", "b", "d"]);
    });

    it("notifies no one of a mode it already holds", () => {
      const t = setup();
      const heard = t.heard();
      t.notices.setMode(GAMES, "mentions");
      expect(heard()).toBe(0);
      t.notices.setMode(GAMES, "none");
      t.notices.setMode(GAMES, "none");
      expect(heard()).toBe(1);
    });
  });

  describe("what a room counts, and the total", () => {
    it("counts a room in mentions mode by its unseen notices", () => {
      const t = setup();
      t.notices.add(notice({ id: "a", time: T(5) }));
      t.notices.add(notice({ id: "b", time: T(7) }));
      t.notices.add(notice({ id: "c", where: MAIN }));
      expect(badgeOf(t.state(), GAMES)).toBe(2);
      t.notices.seen(GAMES, T(5));
      expect(badgeOf(t.state(), GAMES)).toBe(1);
    });

    it("counts a room in all mode by its unseen lines: the others' only, no notice among them, no line of the account's", () => {
      const t = setup();
      t.notices.setMode(GAMES, "all");
      t.said(GAMES, ["m1", 1]);
      t.said(GAMES, ["m2", 2], { text: "hi", from: BOB });
      t.said(GAMES, ["m3", 3], { text: "mine", from: ME });
      t.noticed(GAMES, "bot", 4);
      expect(badgeOf(t.state(), GAMES)).toBe(2);
    });

    it("counts a line once in all mode though a notice names it too", () => {
      const t = setup();
      t.notices.setMode(GAMES, "all");
      t.said(GAMES, ["m1", 5]);
      t.notices.add(notice({ id: "m1", time: T(5) }));
      expect(badgeOf(t.state(), GAMES)).toBe(1);
      expect(totalUnseen(t.state())).toBe(1);
    });

    // G7 (F1506): an edit is a line of its own that shows in its target's place, so it is no new unread line.
    it("counts no edit in all mode: it corrects a line the reader has or has not had", () => {
      const t = setup();
      t.notices.setMode(GAMES, "all");
      t.said(GAMES, ["m1", 1]);
      t.store
        .getState()
        .chatActions.heard(
          read(`@msgid=e1;time=${T(2)};account=${ALICE};+gnoworld/edit=m1 :${ALICE}!u@h PRIVMSG ${GAMES} :changed`),
        );
      expect(badgeOf(t.state(), GAMES)).toBe(1);
    });

    it("counts the lines past the later of the page's mark and Ergo's reading place", () => {
      const t = setup();
      t.notices.setMode(GAMES, "all");
      for (const at of [1, 2, 3, 4]) t.said(GAMES, [`m${String(at)}`, at]);
      t.marked(GAMES, 1);
      expect(badgeOf(t.state(), GAMES)).toBe(3);
      t.notices.seen(GAMES, T(3));
      expect(badgeOf(t.state(), GAMES)).toBe(1);
      t.marked(GAMES, 4);
      expect(badgeOf(t.state(), GAMES)).toBe(0);
    });

    it("counts nothing in a room that is none, lines or notices", () => {
      const t = setup();
      t.said(GAMES, ["m1", 1]);
      t.notices.add(notice());
      expect(badgeOf(t.state(), GAMES)).toBe(1);
      t.notices.setMode(GAMES, "all");
      expect(badgeOf(t.state(), GAMES)).toBe(1);
      t.notices.setMode(GAMES, "none");
      expect(badgeOf(t.state(), GAMES)).toBe(0);
      expect(totalUnseen(t.state())).toBe(0);
    });

    it("counts a conversation by its partner's unseen notices, whatever any room's mode", () => {
      const t = setup();
      t.notices.setMode(GAMES, "none");
      t.notices.add(notice({ id: "d1", kind: "dm", where: ALICE, time: T(1) }));
      t.notices.add(notice({ id: "d2", kind: "dm", where: ALICE, time: T(2) }));
      expect(badgeOf(t.state(), ALICE)).toBe(2);
      expect(badgeOf(t.state(), BOB)).toBe(0);
      t.notices.seen(ALICE, T(1));
      expect(badgeOf(t.state(), ALICE)).toBe(1);
    });

    it("counts nothing for a place it does not know", () => {
      const t = setup();
      expect(badgeOf(t.state(), "#nowhere")).toBe(0);
      expect(badgeOf(t.state(), "constructor")).toBe(0);
    });

    it("totals the rooms followed and the conversations, each by its own count", () => {
      const t = setup();
      t.notices.setMode(MAIN, "all");
      t.said(MAIN, ["m1", 1]);
      t.said(MAIN, ["m2", 2]);
      t.notices.add(notice({ id: "a", where: GAMES }));
      t.notices.add(notice({ id: "d1", kind: "dm", where: ALICE }));
      t.notices.add(notice({ id: "d2", kind: "dm", where: BOB }));
      expect(totalUnseen(t.state())).toBe(2 + 1 + 1 + 1);
    });

    it("totals none for the notices of a room no longer followed", () => {
      const t = setup([GAMES, MAIN]);
      t.notices.add(notice({ where: MAIN }));
      expect(totalUnseen(t.state())).toBe(1);
      t.store.getState().chatActions.follow([GAMES]);
      expect(totalUnseen(t.state())).toBe(0);
    });
  });

  // R3: a room the account was taken out of (a KICK, a PART from another session) opens on nothing it can read.
  describe("left", () => {
    it("drops the notices of that room alone, and notifies no one when it holds none", () => {
      const t = setup();
      t.notices.add(notice({ id: "a", where: GAMES }));
      t.notices.add(notice({ id: "b", where: MAIN }));
      t.notices.add(notice({ id: "d", kind: "dm", where: ALICE }));
      t.notices.left(GAMES);
      expect(ids(t.state().notices)).toEqual(["b", "d"]);
      const heard = t.heard();
      t.notices.left(GAMES);
      expect(heard()).toBe(0);
    });
  });

  // G12 (F1509): in all mode the room's lines stay held, and the room it left must not keep counting them.
  describe("left, in all mode", () => {
    it("keeps counting no unread line of a room left in all mode, its lines still held, and counts again what comes once back", () => {
      const t = setup();
      t.notices.setMode(GAMES, "all");
      t.said(GAMES, ["m1", 1]);
      t.said(GAMES, ["m2", 2]);
      t.notices.add(notice({ id: "a", time: T(3) }));
      expect(badgeOf(t.state(), GAMES)).toBe(2);
      t.notices.left(GAMES);
      expect(badgeOf(t.state(), GAMES)).toBe(0);
      expect(totalUnseen(t.state())).toBe(0);
      t.said(GAMES, ["m3", 4]);
      expect(badgeOf(t.state(), GAMES)).toBe(1);
    });
  });

  describe("clear", () => {
    it("sees every place up to its newest notice and its newest line, counting what comes after", () => {
      const t = setup();
      t.notices.setMode(MAIN, "all");
      t.said(MAIN, ["m1", 1]);
      t.said(MAIN, ["m2", 2]);
      t.notices.add(notice({ id: "a", where: GAMES, time: T(5) }));
      t.notices.add(notice({ id: "d", kind: "dm", where: ALICE, time: T(6) }));
      t.notices.clear();
      expect(totalUnseen(t.state())).toBe(0);
      expect(unseenNotices(t.state())).toEqual([]);
      t.said(MAIN, ["m3", 7]);
      t.notices.add(notice({ id: "b", where: GAMES, time: T(8) }));
      expect(totalUnseen(t.state())).toBe(2);
    });

    // G10 (F1508): each place's mark is its own newest time, not another place's.
    it("marks each place at its own newest unseen time", () => {
      const t = setup();
      t.notices.add(notice({ id: "a", where: GAMES, time: T(5) }));
      t.notices.add(notice({ id: "b", where: GAMES, time: T(9) }));
      t.notices.add(notice({ id: "c", where: MAIN, time: T(3) }));
      t.notices.add(notice({ id: "d", kind: "dm", where: ALICE, time: T(7) }));
      t.notices.clear();
      expect(t.state().noticeSeen).toEqual({ [GAMES]: T(9), [MAIN]: T(3), [ALICE]: T(7) });
    });

    it("notifies no one when nothing is unseen", () => {
      const t = setup();
      const heard = t.heard();
      t.notices.clear();
      expect(heard()).toBe(0);
    });
  });

  describe("a session", () => {
    // The device's modes: what it holds and what was written to it.
    const device = (held: Record<string, NoticeMode> | undefined, writes: Record<string, NoticeMode>[] = []) => {
      const prefs: NoticePrefs = {
        modes: () => held,
        setModes: (modes) => {
          writes.push({ ...modes });
          return true;
        },
      };
      return { prefs, writes };
    };

    it("starts with no notice and no mark, and the modes the account's device holds", () => {
      const t = setup();
      t.notices.add(notice());
      t.notices.seen(GAMES, T(1));
      t.notices.begin(device({ [GAMES]: "none", [MAIN]: "all" }).prefs);
      expect(t.state().notices).toEqual([]);
      expect(t.state().noticeSeen).toEqual({});
      expect(modeOf(t.state(), GAMES)).toBe("none");
      expect(modeOf(t.state(), MAIN)).toBe("all");
    });

    it("starts a guest, or an account with no device, with the default for every room", () => {
      const t = setup();
      t.notices.setMode(GAMES, "all");
      t.notices.begin(undefined);
      expect(modeOf(t.state(), GAMES)).toBe("mentions");
      expect(t.state().noticeNotKept).toBe(false);
    });

    it("keeps a mode on the device, and only the modes that are not the default", () => {
      const t = setup();
      const { prefs, writes } = device({});
      t.notices.begin(prefs);
      t.notices.setMode(GAMES, "none");
      t.notices.setMode(MAIN, "all");
      t.notices.setMode(GAMES, "mentions");
      expect(writes).toEqual([{ [GAMES]: "none" }, { [GAMES]: "none", [MAIN]: "all" }, { [MAIN]: "all" }]);
    });

    it("says the device did not keep a mode it refused, the mode held for the page all the same", () => {
      const t = setup();
      t.notices.begin({ modes: () => ({}), setModes: () => false });
      expect(t.state().noticeNotKept).toBe(false);
      t.notices.setMode(GAMES, "none");
      expect(t.state().noticeNotKept).toBe(true);
      expect(modeOf(t.state(), GAMES)).toBe("none");
    });

    it("writes nothing over a device it could not read, and says so from the start", () => {
      const t = setup();
      const { prefs, writes } = device(undefined);
      t.notices.begin(prefs);
      expect(t.state().noticeNotKept).toBe(true);
      t.notices.setMode(GAMES, "none");
      expect(writes).toEqual([]);
      expect(modeOf(t.state(), GAMES)).toBe("none");
    });

    it("notifies no one when it begins on a store that holds nothing", () => {
      const t = setup();
      const heard = t.heard();
      t.notices.begin(undefined);
      expect(heard()).toBe(0);
    });
  });
});
