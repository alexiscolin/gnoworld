// Which messages the Earth shows as bubbles (ADR-0001 §7, docs/plans/slice-6.md): a pure function of the messages, the
// time, the viewer, the rules and what is already on screen. No clock, no chance, nothing it is given is changed.
import { isBlank } from "../markdown/nodes.ts";
import { centreOf } from "./countries.ts";
import { cutText } from "./cut.ts";
import { isFarSide } from "./farSide.ts";
import type { Bubble, BubbleMessage, PickArgs, Picked, Viewer } from "./types.ts";

export type { Bubble, BubbleMessage, PickArgs, Picked, Viewer } from "./types.ts";

interface Candidate {
  readonly message: BubbleMessage;
  readonly country: string;
  /** 0 yours, 1 a mention of you, 2 your hub, 3 the rest. */
  readonly rank: number;
}

interface Run {
  readonly now: number;
  readonly show: number;
  readonly delay: number;
  readonly max: number;
  readonly chars: number;
  readonly viewer: Viewer;
  readonly me: string;
  readonly blocked: ReadonlySet<string>;
  readonly window: ReadonlyMap<string, BubbleMessage>;
  readonly state: Map<string, Bubble>;
  readonly began: Map<string, number>;
  readonly tally: Map<string, number>;
  screen: Bubble[];
}

/** An account as Ergo folds it: ASCII case alone. */
const fold = (account: string): string => account.replace(/[A-Z]/g, (c) => c.toLowerCase());
const newestFirst = (a: BubbleMessage, b: BubbleMessage): number =>
  b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The newest `limit` messages, each id once. */
function readWindow(messages: readonly BubbleMessage[], limit: number): Map<string, BubbleMessage> {
  const window = new Map<string, BubbleMessage>();
  for (const m of [...messages].sort(newestFirst)) {
    if (window.size >= limit) break;
    if (!window.has(m.id)) window.set(m.id, m);
  }
  return window;
}

/** What was shown, with a clock that stepped back brought back to now; kept while it shows, inside the delay or while still listed. */
function remembered(
  shown: readonly Bubble[],
  window: ReadonlyMap<string, BubbleMessage>,
  run: Run,
): Map<string, Bubble> {
  const state = new Map<string, Bubble>();
  for (const s of shown) {
    const since = Math.min(s.since, run.now);
    const until = Math.min(s.until, since + run.show);
    if (until > run.now || run.now - since < run.delay || window.has(s.id)) state.set(s.id, { ...s, since, until });
  }
  return state;
}

function far(run: Run, country: string): boolean {
  const centre = centreOf(country);
  return run.viewer.facing !== undefined && centre !== undefined && isFarSide(centre, run.viewer.facing);
}

/** Whether a bubble of the state may stay on screen: yours shows whatever the far side (§1, question 4), the rest not. */
function visible(run: Run, s: Bubble): boolean {
  return (
    s.until > run.now &&
    centreOf(s.country) !== undefined &&
    !run.blocked.has(fold(s.account)) &&
    run.window.get(s.id)?.hidden !== true &&
    (s.own || !far(run, s.country))
  );
}

function rankOf(run: Run, m: BubbleMessage): number {
  if (fold(m.account) === run.me) return 0;
  if ((m.mentions ?? []).some((a) => fold(a) === run.me)) return 1;
  return run.viewer.hub !== undefined && m.hub === run.viewer.hub ? 2 : 3;
}

function open(run: Run, m: BubbleMessage): boolean {
  return (
    m.visibility === "public" &&
    m.joined &&
    m.hidden !== true &&
    !run.state.has(m.id) &&
    centreOf(m.country) !== undefined &&
    !run.blocked.has(fold(m.account))
  );
}

/** Whether a text draws nothing once cleaned: what the cut would remove (controls, lone surrogates), then the shared
 * check of the line reader. It never segments, so a line that is not placed is not cut (F3363). A text the cut would
 * empty only for its clusters over the limit passes here and is dropped when placed. */
const blank = (text: string): boolean => isBlank(text.replace(/[\p{Cc}\p{Cs}]/gu, ""));

/** The messages that may be picked, with a text that says something, yours first, then by rank, newest first. */
function candidates(run: Run): Candidate[] {
  const found: Candidate[] = [];
  for (const message of run.window.values())
    if (open(run, message) && !blank(message.text))
      found.push({ message, country: message.country ?? "", rank: rankOf(run, message) });
  return found.sort((a, b) => a.rank - b.rank || newestFirst(a.message, b.message));
}

function count(run: Run, country: string): void {
  run.tally.set(country, (run.tally.get(country) ?? 0) + 1);
}

/** A candidate's text cut, or none when the cut leaves nothing to say: the only place a text is segmented. */
function say(run: Run, c: Candidate): string | undefined {
  const text = cutText(c.message.text, run.chars);
  return isBlank(text) ? undefined : text;
}

function put(run: Run, c: Candidate, text: string): void {
  const { message } = c;
  const bubble: Bubble = {
    id: message.id,
    account: message.account,
    country: c.country,
    text,
    since: run.now,
    until: run.now + run.show,
    own: c.rank === 0,
  };
  run.state.set(bubble.id, bubble);
  run.screen = [...run.screen, bubble];
  run.began.set(fold(message.account), run.now);
}

/** Takes a bubble off the screen; it stays in the state, so it is not shown again and its speaker still waits. */
function end(run: Run, bubble: Bubble): void {
  run.state.set(bubble.id, { ...bubble, until: run.now });
  run.screen = run.screen.filter((s) => s !== bubble);
}

function oldestOfOthers(screen: readonly Bubble[]): Bubble | undefined {
  let oldest: Bubble | undefined;
  for (const s of screen) if (!s.own && (oldest === undefined || s.since <= oldest.since)) oldest = s;
  return oldest;
}

/** Keeps a line of yours that was not shown because a newer one of its country was, so no later call takes it for a new
 * one and ends the newer bubble for it (F3361). It is in the state and on no screen. */
function spend(run: Run, c: Candidate): void {
  const { message } = c;
  run.state.set(message.id, {
    id: message.id,
    account: message.account,
    country: c.country,
    text: "",
    since: run.now,
    until: run.now,
    own: true,
  });
}

/** Yours: shown whatever the delay or the far side, in your country's place, and the oldest other bubble's if the screen
 * is full; of your messages of one country in a call, the newest. */
function placeYours(run: Run, c: Candidate, done: Set<string>): void {
  if (done.has(c.country)) {
    spend(run, c);
    count(run, c.country);
    return;
  }
  const text = say(run, c);
  if (text === undefined) return;
  run.screen
    .filter((s) => s.country === c.country)
    .forEach((s) => {
      end(run, s);
    });
  const oldest = oldestOfOthers(run.screen);
  if (run.screen.length >= run.max && oldest !== undefined) end(run, oldest);
  if (run.screen.length < run.max) {
    put(run, c, text);
    done.add(c.country);
  } else count(run, c.country);
}

function placeOther(run: Run, c: Candidate): void {
  const waiting = run.now - (run.began.get(fold(c.message.account)) ?? -Infinity) < run.delay;
  const taken = run.screen.length >= run.max || run.screen.some((s) => s.country === c.country);
  if (waiting || taken || far(run, c.country)) count(run, c.country);
  else {
    const text = say(run, c);
    if (text !== undefined) put(run, c, text);
  }
}

/** The screen from the state, which keeps every rule at every call: a bubble that stops being allowed (its country went
 * to the far side, its speaker was muted, its line hidden) ends for good, so it cannot come back past the caps; and a
 * smaller `maxOnScreen` takes the oldest bubbles off (F3360). */
function settle(run: Run): void {
  run.screen = [];
  for (const s of [...run.state.values()]) {
    if (s.until <= run.now) continue;
    if (visible(run, s)) run.screen.push(s);
    else end(run, s);
  }
  while (run.screen.length > run.max) {
    const oldest = oldestOfOthers(run.screen) ?? run.screen[0];
    if (oldest === undefined) break;
    end(run, oldest);
  }
}

export function pickBubbles(...[messages, now, viewer, rules, shown]: PickArgs): Picked {
  const window = readWindow(messages, rules.readLast);
  const show = rules.showSeconds * 1000;
  const delay = rules.speakerDelaySeconds * 1000;
  const run: Run = {
    ...{ now, show, delay, viewer, window },
    max: rules.maxOnScreen,
    chars: rules.maxChars,
    me: fold(viewer.account),
    blocked: new Set([...viewer.muted, ...viewer.banned].map(fold)),
    state: new Map(),
    began: new Map(),
    tally: new Map(),
    screen: [],
  };
  for (const [id, bubble] of remembered(shown, window, run)) run.state.set(id, bubble);
  settle(run);
  for (const s of run.state.values())
    run.began.set(fold(s.account), Math.max(run.began.get(fold(s.account)) ?? -Infinity, s.since));

  const yours = new Set<string>();
  for (const c of candidates(run)) {
    if (c.rank === 0) placeYours(run, c, yours);
    else placeOther(run, c);
  }
  const counts = [...run.tally]
    .map(([country, n]) => ({ country, count: n, far: far(run, country) }))
    .sort((a, b) => b.count - a.count || (a.country < b.country ? -1 : 1));
  return { bubbles: run.screen, counts, shown: [...run.state.values()] };
}
