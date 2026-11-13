import { expect, hydrated, type Page } from "./fixtures.ts";
import { scriptedErgo } from "./scripted.ts";
import type { WebSocketRoute } from "@playwright/test";

// The Earth on a scripted Ergo, at a fixed hour, as the journeys of its life and of its bubbles' turn share it.
export const EARTH = "/earth?test-gpu";
export const INES = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
export const SLOW = { timeout: 90_000 };
export const NIGHT = "2026-11-02T21:30:00.000Z";
export const ROOMS = {
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

export interface Said {
  id: string;
  text: string;
  country: string;
  from?: string;
  at?: string;
  room?: string;
}
export const raw = ({ id, text, country, from = INES, at = NIGHT, room = "#earth" }: Said) =>
  `@msgid=${id};time=${at};account=${from};+gnoworld/country=${country} :${from}!u@h PRIVMSG ${room} :${text}`;
export interface Opened {
  socket: () => WebSocketRoute;
  /** Each line the page sent. */
  sent: string[];
}

// /earth on a scripted Ergo, at a fixed hour, as `me`; the rooms as the real server would list them.
export async function onEarth(
  page: Page,
  {
    me = "guest-77",
    path = EARTH,
    replayed = [] as readonly string[],
    motion = false,
    joined = true,
    ticking = false,
  } = {},
): Promise<Opened> {
  const sent: string[] = [];
  await setHour(page, { motion, ticking });
  const socket = await scripted(page, { me, replayed, sent });
  await page.goto(path);
  await hydrated(page);
  if (joined) {
    await expect(page.locator("[data-earth='drawn']")).toBeAttached(SLOW);
    await expect.poll(() => sent.some((line) => line.startsWith("JOIN "))).toBe(true);
  }
  return {
    sent,
    socket: () => {
      const route = socket();
      if (route === undefined) throw new Error("the page opened no socket");
      return route;
    },
  };
}

// The fixed hour, and reduced motion unless `motion`. A fixed time freezes Date.now, which GSAP's clock reads: no tween (the header's fade in)
// ever moves; `ticking` sets the hour, then lets it run.
async function setHour(page: Page, { motion, ticking }: { motion: boolean; ticking: boolean }) {
  await (ticking ? page.clock.setSystemTime(new Date(NIGHT)) : page.clock.setFixedTime(new Date(NIGHT)));
  if (!motion) await page.emulateMedia({ reducedMotion: "reduce" });
}

// The rooms and the socket of a scripted Ergo; the socket, once the page opened it.
async function scripted(
  page: Page,
  { me, replayed, sent }: { me: string; replayed: readonly string[]; sent: string[] },
) {
  let socket: WebSocketRoute | undefined;
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
  return () => socket;
}

// Every frame the scene draws, from now on, kept in the page for `frames`: the camera, the ground's spin and lean, what faces the eye, the bubbles.
export interface Frame {
  ms: number;
  seconds: number;
  lead: number;
  lean: number;
  lat: number;
  lon: number;
  dock: number;
  eye: number[];
  flying: boolean;
  bubbles: { lat: number; lon: number; x: number; y: number; shown: boolean; text: string }[];
}

export const record = (page: Page) =>
  page.evaluate(() => {
    const space = Reflect.get(globalThis, "__gnoworldSpace") as {
      seconds: number;
      camera: { position: { x: number; y: number; z: number } };
      rig: { flying: boolean };
      universe: { earth: unknown };
      stage: {
        ground: {
          lead: number;
          lean: number;
          facing: (e: unknown, s: number, p: unknown) => { lat: number; lon: number };
        };
      };
    };
    const frames: unknown[] = [];
    Reflect.set(globalThis, "__frames", frames);
    const tick = (ms: number) => {
      const { lat, lon } = space.stage.ground.facing(space.universe.earth, space.seconds, space.camera.position);
      const dock = document.querySelector("[data-dock]")?.getBoundingClientRect().left ?? innerWidth;
      const bubbles = Array.from(document.querySelectorAll<HTMLElement>("[data-mark='bubble']"), (item) => {
        const at = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(item.style.transform);
        const shown = item.style.visibility !== "hidden" && !item.hasAttribute("data-away");
        return {
          lat: Number(item.dataset["lat"]),
          lon: Number(item.dataset["lon"]),
          x: Number(at?.[1]),
          y: Number(at?.[2]),
          shown,
          text: item.textContent,
        };
      });
      const { x, y, z } = space.camera.position;
      frames.push({
        ms,
        seconds: space.seconds,
        lead: space.stage.ground.lead,
        lean: space.stage.ground.lean,
        lat,
        lon,
        dock,
        bubbles,
        eye: [x, y, z],
        flying: space.rig.flying,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/** Waits for the space's hook, then for eight frames in a row within 250 ms: the first draws are over (the software GPU compiles for seconds in which none comes). */
export const spaceReady = async (page: Page) => {
  try {
    await page.waitForFunction(() => Reflect.get(globalThis, "__gnoworldSpace") !== undefined, undefined, SLOW);
  } catch (error) {
    const canvases = await page.evaluate(() => [...document.querySelectorAll("canvas")].map((c) => c.dataset["scene"]));
    throw new Error(`no scene hook; canvases ${JSON.stringify(canvases)}`, { cause: error });
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let [last, quick] = [performance.now(), 0];
        const tick = (t: number) => {
          quick = t - last < 250 ? quick + 1 : 0;
          last = t;
          if (quick >= 8) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
};

/**
 * Puts `__pumpFrames(read)` in the page: `read(t)` runs every frame once its own callbacks have run (a message after the animation frame),
 * as a reader sees the frame, and goes on while it returns true.
 */
export const installFramePump = (page: Page) =>
  page.evaluate(() => {
    Reflect.set(globalThis, "__pumpFrames", (read: (t: number) => boolean) => {
      const channel = new MessageChannel();
      const tick = (t: number) => {
        channel.port2.postMessage(t);
      };
      channel.port1.onmessage = (event: MessageEvent<number>) => {
        if (read(event.data)) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
