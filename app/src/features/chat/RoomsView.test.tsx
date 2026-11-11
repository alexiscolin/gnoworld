import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { noticeSaid, NoticeStatus, RoomsView, type RoomsViewProps } from "./RoomsView.tsx";

const SECTIONS: RoomsViewProps["sections"] = [
  {
    name: "Talk",
    rooms: [
      { room: "#bubble", type: "open" },
      { room: "#bubble/games", type: "open" },
    ],
  },
  { name: null, rooms: [{ room: "#bubble/news", type: "announcement" }] },
];
const view = (over: Partial<RoomsViewProps> = {}) =>
  renderToStaticMarkup(
    <StoreProvider>
      <RoomsView sections={SECTIONS} current="#bubble/games" {...over} />
    </StoreProvider>,
  );
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
// Each section's name: a folding button's text for a room's section, a plain heading for the notifications.
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((m) => said(m[1] ?? ""));
const links = (html: string) => [...html.matchAll(/<a [^>]*>(.*?)<\/a>/gs)].map((m) => said(m[1] ?? ""));
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);

describe("RoomsView", () => {
  it("lists the rooms by section, in the server's order, under a navigation named Rooms", () => {
    const html = view();
    expect(html).toMatch(/^<nav[^>]*aria-label="Rooms"/);
    // 4e's UX review (U16): an account's navigation holds its direct messages too, and says so.
    expect(
      view({
        dms: { world: "bubble", partners: [], current: undefined, onlyKnown: false, onOnlyKnown: () => undefined },
      }),
    ).toMatch(/^<nav[^>]*aria-label="Rooms and direct messages"/);
    expect(headings(html)).toEqual(["Talk", "Rooms"]);
    expect(links(html)).toEqual(["bubble", "games", "news"]);
    expect(hrefs(html)).toEqual(["/w/bubble", "/w/bubble?room=games", "/w/bubble?room=news"]);
  });

  // G9 (F1510): the navigation takes the focus by code alone (the list's Clear), never into the tab order.
  it("is reached by code and not by the tab key: tabindex -1", () => {
    expect(view()).toMatch(/^<nav[^>]*tabindex="-1"/);
  });

  it("names the section of the others Rooms when there is no other section", () => {
    const html = view({ sections: [{ name: null, rooms: [{ room: "#bubble", type: "open" }] }] });
    expect(headings(html)).toEqual(["Rooms"]);
  });

  it.each([
    ["#bubble/games", "games"],
    ["#bubble", "bubble"],
  ])("marks the room shown (%s), and it alone", (current, label) => {
    const html = view({ current });
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<a [^>]*aria-current="true"[^>]*>.*?${label}.*?</a>`, "s"));
  });

  it.each([undefined, "#bubble/gone"])("marks no room when the one shown (%s) is not listed", (current) => {
    expect(view({ current })).not.toContain("aria-current");
  });

  it("shows a section's name as text, never as markup", () => {
    const html = view({
      sections: [{ name: "<img src=x onerror=alert(1)>", rooms: [{ room: "#bubble", type: "open" }] }],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it.each([
    ["no section", []],
    [
      "only empty sections",
      [
        { name: null, rooms: [] },
        { name: "Talk", rooms: [] },
      ],
    ],
  ])("says so when the world has no room a reader may see: %s", (_, sections) => {
    expect(said(view({ sections }))).toBe("Search rooms No room here yet.");
  });

  // /code-review on 4e (CR8): with the rooms failed and a direct message in view, the navigation said "No room here
  // yet." beside "The rooms could not load.".
  it("says the rooms' failure in their place, never that there is no room", () => {
    const html = view({ sections: [], failed: <p role="alert">The rooms could not load.</p> });
    expect(said(html)).toBe("Search rooms The rooms could not load.");
    // The search over the rooms stands first; the failure takes the list's place right after it.
    expect(html).toMatch(/^<nav [^>]*>.*<\/div><p role="alert">The rooms could not load\.<\/p>/);
  });

  it("leaves out a section with no room", () => {
    const html = view({ sections: [{ name: "Empty", rooms: [] }, ...SECTIONS] });
    expect(html).not.toContain("Empty");
  });

  it("lists 100 rooms, each a link of its own", () => {
    const rooms = Array.from({ length: 100 }, (_, n) => ({ room: `#bubble/r${String(n)}`, type: "open" as const }));
    expect(links(view({ sections: [{ name: null, rooms }] }))).toHaveLength(100);
  });
});

// 4e: an account's direct messages, under the rooms: each conversation a link to its page, the one shown marked;
// a choice to hear from those it talked with alone.
describe("RoomsView: direct messages", () => {
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const CAROL = "g1l6m6l6carqlqqqqqqqqqqqqqqqqqqqqqnkkanc";
  const dms = (over: Partial<NonNullable<RoomsViewProps["dms"]>> = {}) => ({
    world: "bubble",
    partners: [ALICE, CAROL],
    current: undefined,
    onlyKnown: false,
    onOnlyKnown: () => undefined,
    notKept: false,
    ...over,
  });

  it("lists each conversation by its partner's short address, a link to its page, after the rooms", () => {
    // A conversation in view: no room is.
    const html = view({ current: undefined, dms: dms({ current: CAROL }) });
    expect(headings(html)).toEqual(["Talk", "Rooms", "Direct messages"]);
    // 4e's UX review (U6), 5q: the rows are the partner's nebula and short address; that they are not encrypted is said once,
    // in the small grey note under the list, as the video's note is.
    expect(links(html).slice(-2)).toEqual(["g10gh7…3y5tv", "g1l6m6…kkanc"]);
    expect(html.match(/data-kind="person"/g)).toHaveLength(2);
    expect(said(html)).toContain("Not encrypted: the server can read these.");
    expect(hrefs(html).slice(-2)).toEqual([`/w/bubble?dm=${ALICE}`, `/w/bubble?dm=${CAROL}`]);
    expect(html).toMatch(new RegExp(`<a [^>]*href="/w/bubble\\?dm=${CAROL}"[^>]*aria-current="true"`));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  // Review 8 of 5q: both words sat behind the room menu's chevron, where nobody reads them before writing.
  it("says in view that these lines are kept only while the page is open, beside that they are not encrypted", () => {
    expect(said(view({ current: undefined, dms: dms() }))).toContain(
      "Not encrypted: the server can read these. Kept only while this page is open.",
    );
  });

  it("says in view, under the list, when the device did not keep the choices, and not otherwise", () => {
    expect(said(view({ dms: dms({ notKept: true }) }))).toContain("Not kept on this device");
    expect(said(view({ dms: dms({ notKept: true, partners: [] }) }))).toContain("Not kept on this device");
    expect(said(view({ dms: dms() }))).not.toContain("Not kept on this device");
  });

  it("says when there is none yet, and has no section for a guest", () => {
    // 4e's UX review (U4): the empty list says how to start one.
    expect(said(view({ dms: dms({ partners: [] }) })).replaceAll("&#x27;", "'")).toContain(
      "No direct messages yet Pick someone in Who's here to start one.",
    );
    expect(view()).not.toContain("Direct messages");
  });
});

// 4f-n: what the account has not seen, on each row, and what it was told in a list of its own.
describe("RoomsView: notifications", () => {
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const BOB = "g1f6dcp6he2vq9gymrm4yrnyx66n0578vf7fsksl";
  const dms = {
    world: "bubble",
    partners: [ALICE],
    current: undefined,
    onlyKnown: false,
    onOnlyKnown: () => undefined,
  };
  // The row's words of the room or conversation linked at `href`: its list item's, markup taken off.
  const rowAt = (html: string, href: string, last = false) => {
    const items = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].filter((m) => (m[1] ?? "").includes(`href="${href}"`));
    return said((last ? items.at(-1) : items[0])?.[1] ?? "");
  };
  const notices = (over: Partial<NonNullable<RoomsViewProps["notices"]>> = {}) => ({
    list: [],
    world: "bubble",
    said: "",
    onClear: () => undefined,
    ...over,
  });
  const note = (kind: "mention" | "group" | "reply" | "dm", where: string, by = ALICE) => ({
    id: `${kind}:${where}`,
    kind,
    where,
    time: "2026-10-25T10:05:00.000Z",
    by,
  });

  describe("the badges", () => {
    it("shows a room's unseen count on its row, said as unseen, and nothing on a row that has none", () => {
      const html = view({ badges: { "#bubble/games": 3, "#bubble": 0 } });
      expect(rowAt(html, "/w/bubble?room=games")).toBe("games 3 3 unread");
      expect(rowAt(html, "/w/bubble")).toBe("bubble");
      expect(rowAt(html, "/w/bubble?room=news")).toBe("news");
    });

    it("shows a conversation's unseen count on its row, the room's rows apart", () => {
      const html = view({ dms: dms, badges: { [ALICE]: 2, "#bubble": 1 } });
      expect(rowAt(html, `/w/bubble?dm=${ALICE}`)).toBe("g10gh7…3y5tv 2 unread");
      expect(rowAt(html, "/w/bubble")).toBe("bubble 1 1 unread");
    });

    it("says 99+ past 99", () => {
      expect(rowAt(view({ badges: { "#bubble": 100 } }), "/w/bubble")).toBe("bubble 99+ 99+ unread");
      expect(rowAt(view({ badges: { "#bubble": 99 } }), "/w/bubble")).toBe("bubble 99 99 unread");
    });

    it("draws no badge for a room not listed, a negative count or none", () => {
      expect(said(view({ badges: { "#nowhere": 4, "#bubble": -1 } }))).not.toContain("unread");
      expect(said(view())).not.toContain("unread");
    });

    it("keeps the row a link named by the room alone: the count is not in the link", () => {
      const html = view({ badges: { "#bubble/games": 3 } });
      expect(links(html)).toEqual(["bubble", "games", "news"]);
    });
  });

  describe("the notifications list", () => {
    it("lists each notice by who did what, with the room it was in, a link to that room", () => {
      const html = view({
        notices: notices({
          list: [note("mention", "#bubble/games"), note("group", "#bubble/news", BOB)],
        }),
      });
      // The notice's row is the room's link's last: the list comes after the rooms (U4).
      expect(rowAt(html, "/w/bubble?room=games", true)).toContain("g10gh7…3y5tv mentioned you #games");
      expect(rowAt(html, "/w/bubble?room=news", true)).toContain("g1f6dc…fsksl mentioned the room #news");
    });

    it("gives a notice of a realm world's room no link: that world has no page to open", () => {
      const ghost = "#nym-alexiscolin000-gnoradio-0123456789/home-0123456789";
      const html = view({ notices: notices({ list: [note("mention", ghost)] }) });
      expect(html).toContain("mentioned you");
      expect(html).not.toContain("/w/nym-");
    });

    it.each([
      ["reply", "replied to you"],
      ["dm", "wrote to you"],
    ] as const)("says a %s as %s", (kind, words) => {
      const where = kind === "dm" ? ALICE : "#bubble";
      const html = view({ dms, notices: notices({ list: [note(kind, where)] }) });
      expect(said(html)).toContain(`g10gh7…3y5tv ${words}`);
    });

    it("links a direct message's notice to its conversation, and says it is one", () => {
      // No conversation is listed, so the only link to it is the notice's own.
      const html = view({ dms: { ...dms, partners: [] }, notices: notices({ list: [note("dm", ALICE)] }) });
      expect(rowAt(html, `/w/bubble?dm=${ALICE}`)).toBe("g10gh7…3y5tv wrote to you Direct message");
    });

    it("names a guest author by its nick", () => {
      const html = view({ notices: notices({ list: [note("mention", "#bubble", "guest-ab12cd")] }) });
      expect(said(html)).toContain("guest-ab12cd mentioned you");
    });

    it("lists the newest first, under a heading of its own, beside the rooms", () => {
      const html = view({
        notices: notices({ list: [note("mention", "#bubble"), note("reply", "#bubble/games")] }),
      });
      expect(headings(html).toSorted()).toEqual(["Notifications", "Rooms", "Talk"]);
      expect(said(html).indexOf("replied to you")).toBeLessThan(said(html).indexOf("mentioned you"));
    });

    // U4: a first notice came in above the rooms and pushed every row down; it comes in after them.
    it("puts the list after the rooms and the direct messages, so a notice moves no row", () => {
      const html = view({ dms, notices: notices({ list: [note("mention", "#bubble")] }) });
      expect(headings(html)).toEqual(["Talk", "Rooms", "Direct messages", "Notifications"]);
    });

    it("offers to clear them, a button, and only while there is one", () => {
      const some = view({ notices: notices({ list: [note("mention", "#bubble")] }) });
      expect(some).toMatch(/<button[^>]*>Clear<\/button>/);
      expect(view({ notices: notices() })).not.toContain(">Clear<");
    });

    it("draws no list for a guest, none being given, and none while the list is empty", () => {
      expect(headings(view())).toEqual(["Talk", "Rooms"]);
      expect(view({ notices: notices() })).not.toContain("Notifications");
    });

    it("says each notice's author as text, never as markup", () => {
      const html = view({
        notices: notices({ list: [note("mention", "#bubble", "<img src=x onerror=alert(1)>")] }),
      });
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    });

    it("keeps a status for a screen reader, present before anything is said, outside the rooms' navigation", () => {
      const quiet = renderToStaticMarkup(<NoticeStatus notices={{ said: "" }} />);
      expect(quiet).toMatch(/<p[^>]*role="status"[^>]*><\/p>/);
      const told = renderToStaticMarkup(
        <NoticeStatus notices={{ said: "g10gh7…3y5tv mentioned you in #games", saidId: "n1" }} />,
      );
      expect(told).toMatch(/<p[^>]*role="status"[^>]*>g10gh7…3y5tv mentioned you in #games<\/p>/);
      expect(view({ notices: notices({ said: "told" }) })).not.toMatch(/<p[^>]*role="status"/);
      expect(renderToStaticMarkup(<NoticeStatus notices={undefined} />)).toBe("");
    });

    it("keeps a guest's navigation free of any status", () => {
      expect(view()).not.toMatch(/<p[^>]*role="status"/);
    });
  });
});

// G11 (F1511): what a screen reader is told of a notice: who did what, and where; a conversation has no "in".
describe("noticeSaid", () => {
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const at = (kind: "mention" | "group" | "reply" | "dm", by: string, where: string) => ({
    id: "n1",
    kind,
    where,
    time: "2026-10-25T10:05:00.000Z",
    by,
  });
  it.each([
    ["mention", "mentioned you in #games"],
    ["group", "mentioned the room in #games"],
    ["reply", "replied to you in #games"],
  ] as const)("says who and what, then where, of a %s", (kind, said) => {
    expect(noticeSaid(at(kind, ALICE, "#bubble/games"))).toBe(`g10gh7…3y5tv ${said}`);
  });

  it("says a direct message with no place, and a guest by its nick", () => {
    expect(noticeSaid(at("dm", ALICE, ALICE))).toBe("g10gh7…3y5tv wrote to you");
    expect(noticeSaid(at("mention", "guest-bbbbbb", "#bubble"))).toBe("guest-bbbbbb mentioned you in #bubble");
  });
});
