import AxeBuilder from "@axe-core/playwright";
import { word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box } from "./geometry.ts";
import { logIn } from "./irc.ts";
import { scriptedErgo } from "./scripted.ts";
import { countShifts, running, shifted, stats } from "./sceneStage.ts";
import type { WebSocketRoute } from "@playwright/test";

// The Earth's life (frames 43 to 55, 85): what people say, where they say it from, over the globe, on a scripted Ergo so every run shows the
// same words. Each line declares its country as 7j's will: a tag on the wire. The hour is fixed: at 21:30 UTC, Europe is in the night.
const EARTH = "/earth?test-gpu";
const SLOW = { timeout: 90_000 };
const COMPUTER = { width: 1728, height: 1080 };
const PHONE = { width: 390, height: 844 };
const NIGHT = "2026-11-02T21:30:00.000Z";
const LATER = "2026-11-02T21:30:01.000Z";
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const INES = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const HOUR = 3_600_000;
const ROOMS = {
  world: "earth",
  sections: [
    {
      name: null,
      rooms: [
        { room: "#earth", type: "open" },
        { room: "#earth/help", type: "open" },
        { room: "#earth/lisbon", type: "open" },
        { room: "#earth/kyoto", type: "open" },
      ],
    },
  ],
};

test.describe.configure({ timeout: 180_000 });

interface Said {
  id: string;
  text: string;
  country: string;
  from?: string;
  at?: string;
  room?: string;
}
const raw = ({ id, text, country, from = INES, at = NIGHT, room = "#earth" }: Said) =>
  `@msgid=${id};time=${at};account=${from};+gnoworld/country=${country} :${from}!u@h PRIVMSG ${room} :${text}`;
const redaction = (id: string) => `:ergo REDACT #earth ${id}`;

interface Opened {
  socket: () => WebSocketRoute;
  /** Each line the page sent. */
  sent: string[];
}

// /earth on a scripted Ergo, at a fixed hour, as `me`; the rooms as the real server would list them.
async function onEarth(
  page: Page,
  { me = "guest-77", path = EARTH, replayed = [] as readonly string[], motion = false } = {},
): Promise<Opened> {
  let socket: WebSocketRoute | undefined;
  const sent: string[] = [];
  await page.clock.setFixedTime(new Date(NIGHT));
  if (!motion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/rooms?world=earth", (route) => route.fulfill({ json: ROOMS }));
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    socket = ergo;
    scriptedErgo(ergo, me, {
      room: "#earth",
      history: [],
      replayed,
      heard: (line) => {
        sent.push(line);
      },
    });
  });
  await page.goto(path);
  await hydrated(page);
  await expect(page.locator("[data-earth='drawn']")).toBeAttached(SLOW);
  await expect.poll(() => sent.some((line) => line.startsWith("JOIN "))).toBe(true);
  return {
    sent,
    socket: () => {
      if (socket === undefined) throw new Error("the page opened no socket");
      return socket;
    },
  };
}

const near = (actual: number, wanted: number, slack = 2) => {
  expect(Math.abs(actual - wanted), `${String(actual)}, the frame's ${String(wanted)}`).toBeLessThanOrEqual(slack);
};
const bubble = (page: Page, text: string) => page.locator("[data-bubble]").filter({ hasText: text });
const pinOf = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Rooms on the globe" }).getByRole("link", { name });
const bubbleBoxes = async (page: Page) => {
  const boxes = await Promise.all((await page.locator("[data-bubble]").all()).map((each) => each.boundingBox()));
  return boxes.flatMap((found) => found ?? []);
};
const signsReady = (page: Page) => expect(page.getByRole("navigation", { name: "Rooms on the globe" })).toBeAttached();
// The Earth, with your own line from Paris said on it: the globe has turned to Europe.
async function parisSaid(page: Page) {
  const { socket } = await onEarth(page, { me: ME });
  await signsReady(page);
  socket().send(raw({ id: "m1", text: "gm from Paris!", country: "FR", from: ME }));
  return socket;
}

const earthOf = async (page: Page) =>
  (await stats(page)) as unknown as { earth: { x: number; y: number; radius: number } };

test.describe("a computer, as the frames", () => {
  test.use({ viewport: COMPUTER });

  test("docks the general chat beside the globe, as frame 43", async ({ page }) => {
    await onEarth(page);
    const dock = await box(page, "[data-chat-layout]");
    near(dock.x, 1344);
    near(dock.y, 98);
    near(dock.width, 360);
    near(dock.y + dock.height, 1056);
    await expect(page.getByRole("heading", { level: 2, name: "#general" })).toBeVisible();
  });

  test("joins the general chat and the side rooms the list gives, so their lines reach the globe", async ({ page }) => {
    const { sent, socket } = await onEarth(page, { me: ME });
    const joined = () => sent.flatMap((line) => (line.startsWith("JOIN ") ? line.slice(5).split(",") : []));
    await expect.poll(joined).toContain("#earth/lisbon");
    expect(joined()).toContain("#earth");
    await signsReady(page);
    socket().send(raw({ id: "m1", text: "from a side room", country: "JP", from: "p2", room: "#earth/lisbon" }));
    await expect(bubble(page, "from a side room")).toBeAttached();
  });

  test("shows a person's line over their country, with their name and country, as frame 47", async ({ page }) => {
    await parisSaid(page);
    const shown = bubble(page, "gm from Paris!");
    await expect(shown).toBeVisible();
    await expect(shown).toContainText(/FRANCE/i);
    const found = await shown.boundingBox();
    if (found === null) throw new Error("no bubble");
    near(found.width, 258, 6);
    near(found.height, 56, 8);
    const { earth } = await earthOf(page);
    expect(found.x).toBeGreaterThan(earth.x - earth.radius);
    expect(found.x + found.width).toBeLessThan(earth.x + earth.radius * 1.2);
  });

  test("turns the globe to your own line: Paris comes to the disc's middle, at its true hour, in the dark", async ({
    page,
  }) => {
    const { socket } = await onEarth(page, { me: ME });
    await signsReady(page);
    const before = await page.evaluate(() => {
      const scene = Reflect.get(globalThis, "__gnoworldScene") as { ground: { facing: () => { lon: number } } };
      return scene.ground.facing().lon;
    });
    socket().send(raw({ id: "m1", text: "gm from Paris!", country: "FR", from: ME }));
    await expect(bubble(page, "gm from Paris!")).toBeVisible();
    const after = await page.evaluate(() => {
      const scene = Reflect.get(globalThis, "__gnoworldScene") as { ground: { facing: () => { lon: number } } };
      return scene.ground.facing().lon;
    });
    expect(Math.abs(after - before)).toBeGreaterThan(1);
    near(after, 2.6, 8);
  });

  test("keeps every bubble off the plate's words and off the dock", async ({ page }) => {
    const socket = await parisSaid(page);
    const words = [
      ["m2", "good evening from Germany", "DE", "p2"],
      ["m3", "and from Italy", "IT", "p3"],
      ["m4", "and from Greece", "GR", "p4"],
      ["m5", "from far in the east of Europe", "UA", "p5"],
      ["m6", "morning from Turkey", "TR", "p6"],
    ] as const;
    for (const [id, text, country, from] of words) socket().send(raw({ id, text, country, from }));
    await expect(page.locator("[data-bubble]")).toHaveCount(6);
    const dock = await box(page, "[data-chat-layout]");
    for (const found of await bubbleBoxes(page)) {
      expect(found.x).toBeGreaterThanOrEqual(578);
      expect(found.x + found.width).toBeLessThanOrEqual(dock.x);
    }
  });

  test("counts a country on the far side under the ring, as frame 47", async ({ page }) => {
    const socket = await parisSaid(page);
    await expect(bubble(page, "gm from Paris!")).toBeVisible();
    socket().send(raw({ id: "m2", text: "evening from Sydney", country: "AU", from: "p2" }));
    const count = page.getByText("Australia · 1, far side");
    await expect(count).toBeVisible();
    await expect(bubble(page, "evening from Sydney")).toHaveCount(0);
    const found = await count.boundingBox();
    if (found === null) throw new Error("no count");
    near(found.x, 912, 8);
    near(found.y + found.height / 2, 979, 8);
  });

  test("takes a redacted line's bubble off at once", async ({ page }) => {
    const socket = await parisSaid(page);
    await expect(bubble(page, "gm from Paris!")).toBeVisible();
    socket().send(redaction("m1"));
    await expect(bubble(page, "gm from Paris!")).toHaveCount(0, { timeout: 500 });
  });

  test("draws no bubble for a line with no country", async ({ page }) => {
    const { socket } = await onEarth(page);
    await signsReady(page);
    socket().send(`@msgid=m1;time=${NIGHT};account=${INES} :${INES}!u@h PRIVMSG #earth :gm from nowhere`);
    await expect(page.getByRole("list", { name: "Messages" }).getByText("gm from nowhere")).toBeVisible();
    await expect(bubble(page, "gm from nowhere")).toHaveCount(0);
  });

  test("draws a hostile line as text", async ({ page }) => {
    const { socket } = await onEarth(page, { me: ME });
    await signsReady(page);
    socket().send(raw({ id: "m1", text: "<img src=x onerror=alert(1)>", country: "FR", from: ME }));
    await expect(bubble(page, "<img src=x onerror=alert(1)>")).toBeVisible();
    await expect(page.locator("[data-mark] img[src='x']")).toHaveCount(0);
  });

  test("shows a country's hour as a pill on its country, its ring and dot around the place, as frame 49", async ({
    page,
  }) => {
    const at = (back: number) => new Date(Date.parse(NIGHT) - back).toISOString();
    const replayed = [
      raw({ id: "old", text: "old", country: "FR", at: at(3 * HOUR) }),
      ...Array.from({ length: 10 }, (_, n) =>
        raw({ id: `b${String(n)}`, text: "before", country: "FR", at: at(HOUR + (n + 1) * 60_000) }),
      ),
      ...Array.from({ length: 12 }, (_, n) =>
        raw({ id: `a${String(n)}`, text: "now", country: "FR", at: at((n + 10) * 60_000) }),
      ),
    ];
    const { socket } = await onEarth(page, { me: ME, replayed });
    await signsReady(page);
    socket().send(raw({ id: "m1", text: "gm from Brussels!", country: "BE", from: ME }));
    const pill = page.getByText("+20% · 1 h");
    await expect(pill).toBeVisible();
    const found = await pill.boundingBox();
    if (found === null) throw new Error("no pill");
    near(found.height, 20, 3);
    await expect(page.locator("[data-trend='up'] [data-dot]")).toBeVisible();
  });

  test("shows a pin of a room with a place, and opens the room in the dock", async ({ page }) => {
    await parisSaid(page);
    const pin = pinOf(page, "#lisbon");
    await expect(pin).toBeVisible();
    await pin.click();
    await expect(page).toHaveURL(/[?&]room=lisbon/);
    await expect(page.getByRole("heading", { level: 2, name: "#lisbon" })).toBeVisible();
  });

  test("keeps a room with no place in the list, off the globe", async ({ page }) => {
    await onEarth(page, { me: ME });
    await signsReady(page);
    await expect(
      page.getByRole("navigation", { name: "Room shortcuts" }).getByRole("link", { name: /help/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Rooms on the globe" }).getByRole("link", { name: /help/ }),
    ).toHaveCount(0);
  });

  test("hides a pin behind the globe from the keyboard too, and gives it back as the globe turns to it", async ({
    page,
  }) => {
    const socket = await parisSaid(page);
    await expect(pinOf(page, "#lisbon")).toBeVisible();
    await expect(pinOf(page, "#kyoto")).toHaveCount(0);
    socket().send(raw({ id: "m2", text: "gm from Tokyo!", country: "JP", from: ME, at: LATER }));
    await expect(pinOf(page, "#kyoto")).toBeVisible();
    await expect(pinOf(page, "#lisbon")).toHaveCount(0);
  });

  test("passes axe with bubbles, counts and pins on the globe", async ({ page }) => {
    const socket = await parisSaid(page);
    socket().send(raw({ id: "m2", text: "evening from Sydney", country: "AU", from: "p2" }));
    await expect(page.getByText("Australia · 1, far side")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("lets a bubble pop in with motion on", async ({ page }) => {
    const { socket } = await onEarth(page, { me: ME, motion: true });
    await signsReady(page);
    socket().send(raw({ id: "m1", text: "gm from Paris!", country: "FR", from: ME }));
    await expect(bubble(page, "gm from Paris!")).toBeAttached();
    const animation = await page
      .locator("[data-bubble]")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName);
    expect(animation).not.toBe("none");
  });

  test("shows a bubble without its pop under reduced motion", async ({ page }) => {
    await parisSaid(page);
    await expect(bubble(page, "gm from Paris!")).toBeVisible();
    const animation = await page
      .locator("[data-bubble]")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName);
    expect(animation).toBe("none");
  });

  test("takes the signs off with the page", async ({ page }) => {
    await parisSaid(page);
    await expect(bubble(page, "gm from Paris!")).toBeVisible();
    await page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "Cosmos" }).click();
    await expect(page.locator("[data-signs]")).toHaveCount(0);
  });
});

test.describe("frame 85", () => {
  test.use({ viewport: COMPUTER });

  test("a direct message docked shows no bubble of it, though it declares a country, and the room's lines still do", async ({
    page,
  }) => {
    const me = await logIn(page, word("earth-dm"));
    const { socket } = await onEarth(page, { me, path: `/earth?test-gpu&dm=${INES}` });
    await signsReady(page);
    socket().send(
      `@msgid=d1;time=${NIGHT};account=${INES};+gnoworld/country=FR :${INES}!u@h PRIVMSG ${me} :what are you building?`,
    );
    socket().send(raw({ id: "m1", text: "a room's line", country: "JP", from: "p2" }));
    await expect(bubble(page, "a room's line")).toBeVisible();
    await expect(page.locator("[data-bubble]")).toHaveCount(1);
    await expect(bubble(page, "what are you building?")).toHaveCount(0);
    await expect(page.getByText(/France · \d/)).toHaveCount(0);
  });
});

// What lies under the pointer at a point of the page: a covered element still passes `toBeVisible`.
const onTop = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([left, top]) => document.elementFromPoint(left ?? 0, top ?? 0)?.closest("[data-chat-layout]") === null,
    [x, y],
  );

// Asks the chat's code late, and holds it until the test lets it go: what the page shows meanwhile is the empty state.
async function chatHeld(page: Page) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route(/\/assets\/ChatPanel-[\w-]+\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

for (const viewport of [COMPUTER, { width: 1100, height: 800 }, PHONE]) {
  test.describe(`the chat's wait at ${String(viewport.width)} px`, () => {
    test.use({ viewport, serviceWorkers: "block" });

    test("says it is coming, and moves nothing of the page when it comes", async ({ page }) => {
      await countShifts(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.routeWebSocket(/\/ws$/, () => undefined);
      const release = await chatHeld(page);
      await page.goto("/earth");
      await hydrated(page);
      await expect(page.locator("#chat")).toContainText("Loading the chat");
      const [title, slot] = [await box(page, "h1"), await box(page, "#chat")];
      // The page's own moves reach the observer a task late: they must not count as the chat's.
      await expect(page.locator("[data-globe]")).toHaveAttribute("data-earth", /none|drawn/, SLOW);
      await page.evaluate(
        () =>
          new Promise<void>((done) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  Reflect.set(globalThis, "__shift", 0);
                  done();
                }, 100);
              });
            });
          }),
      );
      release();
      await expect(page.locator("[data-chat-layout]")).toBeAttached();
      expect(await box(page, "h1")).toEqual(title);
      expect(await box(page, "#chat")).toEqual(slot);
      expect(await shifted(page)).toBeLessThan(0.01);
    });
  });
}

test.describe("a window under the dock's breakpoint", () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test("brings the chat to the reader when a pin opens a room: a room that changes out of sight says nothing", async ({
    page,
  }) => {
    await parisSaid(page);
    await pinOf(page, "#lisbon").click();
    await expect(page.getByRole("heading", { level: 2, name: "#lisbon" })).toBeInViewport();
  });

  test("takes the signs off when the page scrolls the globe away: no pin lies over the chat", async ({ page }) => {
    await onEarth(page, { me: ME });
    await signsReady(page);
    await page.locator("#chat").scrollIntoViewIfNeeded();
    await expect(page.locator("[data-signs]")).toBeHidden();
    await page.evaluate(() => {
      scrollTo(0, 0);
    });
    await expect(page.locator("[data-signs]")).toBeVisible();
  });

  test("keeps the chat in the page, under the globe: the Earth is what the page shows", async ({ page }) => {
    await onEarth(page, { me: ME });
    await signsReady(page);
    const { earth } = await earthOf(page);
    expect(await onTop(page, earth.x, earth.y)).toBe(true);
    const chat = await box(page, "[data-chat-layout]");
    expect(chat.y).toBeGreaterThanOrEqual(earth.y + earth.radius);
  });
});

test.describe("a narrower computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps a bubble off the dock: it opens to the left of its place", async ({ page }) => {
    const socket = await parisSaid(page);
    socket().send(raw({ id: "m2", text: "from far in the east of Europe", country: "UA", from: "p2" }));
    socket().send(raw({ id: "m3", text: "hello from Kazakhstan", country: "KZ", from: "p3" }));
    await expect(page.locator("[data-bubble]")).not.toHaveCount(0);
    const dock = await box(page, "[data-chat-layout]");
    for (const found of await bubbleBoxes(page)) expect(found.x + found.width).toBeLessThanOrEqual(dock.x);
  });
});

test.describe("a phone", () => {
  test.use({ viewport: PHONE });

  test("loads no sign before View in space, and then keeps each on the screen, axe clean", async ({ page }) => {
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/rooms?world=earth", (route) => route.fulfill({ json: ROOMS }));
    let socket: WebSocketRoute | undefined;
    const sent: string[] = [];
    const asked: string[] = [];
    page.on("request", (request) => {
      if (/EarthSigns-[\w-]+\.js$/.test(request.url())) asked.push(request.url());
    });
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      socket = ergo;
      scriptedErgo(ergo, ME, {
        room: "#earth",
        history: [],
        heard: (line) => {
          sent.push(line);
        },
      });
    });
    await page.goto(EARTH);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 2, name: "#general" })).toBeAttached();
    await expect(page.locator("[data-signs]")).toHaveCount(0);
    expect(asked, "no code of the signs before View in space").toEqual([]);
    await page.getByRole("button", { name: "View in space" }).click();
    await running(page);
    await expect(page.locator("[data-earth='drawn']")).toBeAttached(SLOW);
    await signsReady(page);
    await expect.poll(() => sent.some((line) => line.startsWith("JOIN "))).toBe(true);
    socket?.send(raw({ id: "m1", text: "gm from Paris!", country: "FR", from: ME }));
    const shown = bubble(page, "gm from Paris!");
    await expect(shown).toBeVisible();
    const found = await shown.boundingBox();
    if (found === null) throw new Error("no bubble");
    expect(found.x).toBeGreaterThanOrEqual(0);
    expect(found.x + found.width).toBeLessThanOrEqual(PHONE.width);
    expect(await onTop(page, found.x + found.width / 2, found.y + found.height / 2)).toBe(true);
    await page.getByRole("button", { name: "Credits", exact: true }).click({ trial: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
