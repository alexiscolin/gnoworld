import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { lineOf, word } from "./chat.ts";
import { another, logIn, ticketOf, type Launcher } from "./irc.ts";
import { goInPage, landed, running } from "./sceneStage.ts";
import type { Space } from "../../src/space/scene.ts";

// The chat wherever a place shows it, however the reader came (Alexis: "from every route and across several, always the chat with no bug"),
// with the real Ergo: every line said in a room shown once, in order, those said while the reader was away included (only its history
// brings them), and an account's line back once; places by ways in, and seeded walks, a guest and an account, a computer and a phone.
const PLACES = [
  { path: "/earth", room: "#earth", name: "Earth" },
  { path: "/w/bubble", room: "#bubble", name: "Bubble" },
  { path: "/w/govdao", room: "#govdao", name: "GovDAO" },
  { path: "/w/gnosh-ai", room: "#gnosh-ai", name: "gnosh.ai" },
] as const;
type Place = (typeof PLACES)[number];
// The pages with no chat of their own on a computer: the home, a system, the galaxy, the Map.
const AWAY = ["/", "/s/gnoland", "/universe", "/s/gnoland?view=map"] as const;
const DEVICES = { computer: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;
type Device = keyof typeof DEVICES;
type Who = "guest" | "account";
// How long a place's lines may take: a handshake's (lib/ergo/ergo.ts), well under a stalled link's ping and reconnection.
const LINES_COME = 20_000;

test.describe.configure({ timeout: 240_000 });

const placeAt = (page: Page): Place | undefined => PLACES.find(({ path }) => new URL(page.url()).pathname === path);
const escaped = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

// Another account, in a browser of its own, says lines in the rooms, two before the reader comes and more as it goes: every line of a
// room, in the order said.
interface Talk {
  tag: string;
  said: Record<string, string[]>;
  tell: (room: string) => Promise<void>;
  close: () => Promise<void>;
}
async function talk(launcher: Launcher): Promise<Talk> {
  const tag = word("told");
  const teller = await another(launcher, word("teller"));
  const say = await speaker(teller.page, teller.address);
  const said: Record<string, string[]> = {};
  const tell = async (room: string, count = 1) => {
    const texts = Array.from(
      { length: count },
      (_, n) => `${tag} ${String((said[room]?.length ?? 0) + n + 1)} in ${room}`,
    );
    await say(room, texts);
    said[room] = [...(said[room] ?? []), ...texts];
  };
  for (const { room } of PLACES) await tell(room, 2);
  return { tag, said, tell: (room) => tell(room), close: () => teller.close() };
}

// One connection of the teller's page to Ergo, logged in with one ticket and kept (a ticket a line ran into the server's limit): it joins
// a room as it first says something there, and each saying waits for Ergo's echo of its last line.
async function speaker(
  page: Page,
  address: string,
): Promise<(room: string, texts: readonly string[]) => Promise<void>> {
  const ticket = await ticketOf(page);
  await page.evaluate(
    ([account, pass]) =>
      new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`ws://${location.host}/ws`, "text.ircv3.net");
        Reflect.set(globalThis, "__speaker", { socket, joined: new Set<string>() });
        socket.addEventListener("open", () => {
          socket.send("CAP LS 302");
          socket.send("CAP REQ :message-tags sasl echo-message");
        });
        socket.addEventListener("message", ({ data }) => {
          const line = String(data);
          const ping = /(?:^|\s)PING( .*)?$/.exec(line);
          if (ping !== null) socket.send(`PONG${ping[1] ?? ""}`);
          else if (/CAP \S+ ACK/.test(line)) socket.send("AUTHENTICATE PLAIN");
          else if (line.includes("AUTHENTICATE +")) socket.send(`AUTHENTICATE ${btoa(`\0${account}\0${pass}`)}`);
          else if (/\s903\s/.test(line))
            for (const next of [`NICK ${account}`, "USER u 0 * :u", "CAP END"]) socket.send(next);
          else if (/\s001\s/.test(line)) resolve();
          else if (/\s90[4-7]\s|^ERROR/.test(line)) reject(new Error(line));
        });
      }),
    [address, ticket] as const,
  );
  return (room, texts) =>
    page.evaluate(
      ([to, lines]) =>
        new Promise<void>((resolve, reject) => {
          const { socket, joined } = Reflect.get(globalThis, "__speaker") as { socket: WebSocket; joined: Set<string> };
          const last = `PRIVMSG ${to} :${lines.at(-1) ?? ""}`;
          const timer = setTimeout(() => {
            reject(new Error(`no echo of ${last} in 8 s`));
          }, 8000);
          const heard = ({ data }: MessageEvent) => {
            if (!String(data).includes(last)) return;
            clearTimeout(timer);
            socket.removeEventListener("message", heard);
            resolve();
          };
          socket.addEventListener("message", heard);
          if (!joined.has(to)) socket.send(`JOIN ${to}`);
          joined.add(to);
          for (const text of lines) socket.send(`PRIVMSG ${to} :${text}`);
        }),
      [room, texts] as const,
    );
}

async function reader(page: Page, who: Who, device: Device): Promise<void> {
  await page.setViewportSize(DEVICES[device]);
  await page.addInitScript(() => {
    localStorage.setItem("gnoworld:welcomed", "1");
  });
  if (who === "account") await logIn(page, word("reader"));
}

// The place in view, if it is one with a chat: every line said in its room, once each, in order; an account's line comes back once.
interface Reading {
  talk: Talk;
  who: Who;
  wait?: number;
}
async function holds(page: Page, { talk: { tag, said }, who, wait = LINES_COME }: Reading, how: string): Promise<void> {
  const place = placeAt(page);
  if (place === undefined) return;
  const told = lineOf(page, tag).filter({ hasText: place.room });
  await expect(told, `${how}: ${place.path}'s lines`).toHaveText((said[place.room] ?? []).map(escaped), {
    timeout: wait,
  });
  if (who === "guest") return;
  const sent = word("sent");
  const field = page.getByRole("region", { name: "Chat" }).getByRole("textbox", { name: /^Message / });
  await field.fill(sent);
  // Pressed again while the chat answers "Not sent: the chat is not ready yet. Try again in a moment.": a place whose lines the page kept
  // shows them while its new connection comes, which takes a handshake at most.
  await expect(async () => {
    await field.press("Enter");
    await expect(field).toHaveText("", { timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
  await expect(lineOf(page, sent), `${how}: ${place.path}'s sent line`).toHaveCount(1, { timeout: LINES_COME });
}

const logo = (page: Page) => page.getByRole("link", { name: "gnoworld" }).click();
async function searched(page: Page, place: Place): Promise<void> {
  // The header's control, pressed again till the palette opens: a page still moving in can take the first press.
  await expect(async () => {
    await page.getByRole("button", { name: "Search", exact: true }).click({ timeout: 2_000 });
    await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("combobox", { name: "Search places" }).fill(place.name);
  await expect(page.getByRole("listbox", { name: "Places" }).getByRole("option").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === place.path);
}

// A seeded draw of a number under `n`, the same for a seed every run.
function picks(seed: number): (n: number) => number {
  let state = seed;
  return (n) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Math.floor((state / 2147483648) * n);
  };
}

// One step of a walk: a link to a place or to a page with no chat, the browser's back, the search, and on a computer the logo or a place's
// full chat; a step to a place has a line said in its room first. What it did, for the failure's message.
interface Walk {
  next: (n: number) => number;
  device: Device;
  /** How many of the walk's own pages lie behind this one. */
  went: number;
  talk: Talk;
}
async function walkStep(page: Page, { next, device, went, talk: { tell } }: Walk): Promise<string> {
  const place = PLACES[next(PLACES.length)] ?? PLACES[0];
  const away = AWAY[next(AWAY.length)] ?? "/";
  const toPlace = async (move: () => Promise<unknown>) => {
    await tell(place.room);
    await move();
  };
  // The address a step lands on, but a phone's home, which sends it on to a chat, and the browser's back.
  const awayTo = device === "phone" && away === "/" ? undefined : away.split("?")[0];
  const moves: [string, string | undefined, () => Promise<unknown>][] = [
    [`link to ${place.path}`, place.path, () => toPlace(() => goInPage(page, place.path))],
    [`link to ${away}`, awayTo, () => goInPage(page, away)],
    [
      went > 0 ? "back" : `link to ${away}`,
      went > 0 ? undefined : awayTo,
      () => (went > 0 ? page.goBack() : goInPage(page, away)),
    ],
    [`search ${place.name}`, place.path, () => toPlace(() => searched(page, place))],
    ["logo", "/", () => logo(page)],
    [`full chat of ${place.path}`, place.path, () => toPlace(() => goInPage(page, `${place.path}?chat=full`))],
  ];
  // A phone walks by links and its back alone: its search is the matrix's, its header covered at times by a sheet a step left open.
  const [what, to, move] = moves[next(device === "computer" ? moves.length : 3)] ?? [
    `link to ${place.path}`,
    place.path,
    () => goInPage(page, place.path),
  ];
  await move();
  await arrived(page, what, to);
  return what;
}

// A step's landing: its address, or for a phone's home the chat it is sent on to; the browser's back, anywhere.
async function arrived(page: Page, what: string, to: string | undefined): Promise<void> {
  if (to !== undefined) await expect(page).toHaveURL((url) => url.pathname === to);
  else if (what !== "back") await expect(page).toHaveURL((url) => url.pathname !== "/");
}

// Each way in: the reader leaves the place, seen once already (its rooms held, as after any flight), for a page with no chat or another
// place; a line is said in its room meanwhile; the reader comes back.
interface Way {
  computer: boolean;
  phone: boolean;
  leave?: (page: Page, place: Place) => Promise<void>;
  come: (page: Page, place: Place) => Promise<void>;
}
const WAYS: Record<string, Way> = {
  "a link opened cold": {
    computer: true,
    phone: true,
    come: async (page, place) => {
      await page.goto(place.path);
    },
  },
  "a flight back by a link": {
    computer: true,
    phone: true,
    leave: async (page) => {
      await goInPage(page, "/s/gnoland");
    },
    come: async (page, place) => {
      await goInPage(page, place.path);
    },
  },
  "the browser's back": {
    computer: true,
    phone: true,
    leave: async (page, place) => {
      await goInPage(page, PLACES.find((other) => other !== place)?.path ?? "/");
    },
    come: async (page) => {
      await page.goBack();
    },
  },
  "the logo, then a link": {
    computer: true,
    phone: false,
    leave: async (page) => {
      await logo(page);
      await expect(page).toHaveURL((url) => url.pathname === "/");
    },
    come: async (page, place) => {
      await goInPage(page, place.path);
    },
  },
  search: {
    computer: true,
    phone: true,
    leave: async (page) => {
      await goInPage(page, "/universe");
    },
    come: searched,
  },
  "the header's Chat": {
    computer: true,
    phone: false,
    leave: () => Promise.resolve(),
    come: async (page, place) => {
      await page.getByRole("link", { name: `Chat of ${place.name}` }).click();
    },
  },
};

for (const who of ["guest", "account"] as const)
  for (const device of ["computer", "phone"] as const)
    test.describe(`the chat, ${who}, on a ${device}`, () => {
      for (const [how, way] of Object.entries(WAYS)) {
        if (!way[device]) continue;
        test(`every place's chat by ${how}`, async ({ page, playwright, launchOptions }) => {
          const told = await talk({ playwright, launchOptions });
          await reader(page, who, device);
          for (const place of PLACES) {
            if (way.leave !== undefined) {
              await page.goto(place.path);
              await hydrated(page);
              await way.leave(page, place);
            }
            await told.tell(place.room);
            await way.come(page, place);
            await expect(page).toHaveURL((url) => url.pathname === place.path);
            await holds(page, { talk: told, who }, `${how} to ${place.path}`);
          }
          await told.close();
        });
      }

      // A seeded walk: each step a way the reader moves, the chat checked after each.
      for (const seed of [1, 2]) {
        test(`a walk of 14 steps, seed ${String(seed)}`, async ({ page, playwright, launchOptions }) => {
          const told = await talk({ playwright, launchOptions });
          await reader(page, who, device);
          await page.goto("/earth");
          await hydrated(page);
          const next = picks(seed);
          const steps: string[] = [];
          // The pages the walk itself went to, which its back may return through: never before its first.
          let depth = 0;
          for (let step = 0; step < 14; step += 1)
            await test.step(`step ${String(step)}`, async () => {
              const what = await walkStep(page, { next, device, went: depth, talk: told });
              depth += what === "back" ? -1 : 1;
              steps.push(what);
              await holds(page, { talk: told, who }, steps.join(" > "));
            });
          await told.close();
        });
      }
    });

// Alexis's own way: flights, the logo, then the Earth clicked in the scene, an account on a wide computer. The scene on the software GPU
// makes the Earth's page ready late: its lines get a minute.
test("the Earth's chat after the logo and a click on it in the scene", async ({ page, playwright, launchOptions }) => {
  const told = await talk({ playwright, launchOptions });
  await reader(page, "account", "computer");
  await page.setViewportSize({ width: 1728, height: 1080 });
  await page.goto("/earth?test-gpu");
  await hydrated(page);
  await running(page);
  await holds(page, { talk: told, who: "account", wait: 60_000 }, "the Earth first");
  for (const path of ["/w/bubble", "/s/gnoland", "/w/govdao", "/universe"]) await goInPage(page, path);
  await logo(page);
  await told.tell("#earth");
  await landed(page);
  const spot = await page.evaluate(() => {
    const { universe, seconds, see } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
    const earth = universe?.planets.find(({ id }) => id === "earth");
    if (earth === undefined) return undefined;
    const angle = earth.phase + earth.speed * seconds;
    const { place, across, along } = earth.system;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const at = {
      x: place.x + (across.x * cos + along.x * sin) * earth.orbit,
      y: place.y + (across.y * cos + along.y * sin) * earth.orbit,
      z: place.z + (across.z * cos + along.z * sin) * earth.orbit,
    };
    const on = { x: 0, y: 0, z: 0 };
    return see.project(at, on) ? { x: on.x, y: on.y } : undefined;
  });
  expect(spot, "the Earth on screen from the home").toBeDefined();
  await page.mouse.click(spot?.x ?? 0, spot?.y ?? 0);
  await expect(page).toHaveURL((url) => url.pathname === "/earth", { timeout: 90_000 });
  await holds(page, { talk: told, who: "account", wait: 60_000 }, "the logo, then the Earth in the scene");
  await told.close();
});
