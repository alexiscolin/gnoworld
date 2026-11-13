// Jarvis's cards for the room the chat in view told (jarvisHere.ts), added by the page's asks "jarvis" (its introduction) and
// "jarvis-catch-up" (the `catch-up` ask at once): the account menu's Jarvis and the quick actions. Brought by the listener on the first
// ask (JarvisListener.tsx), which hands it that ask. One ask in flight an account in a room; a card is shown to the account that asked.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import universes from "../../../data/universes.json" with { type: "json" };
import { drawing, type Drawing } from "../chat/index.ts";
import {
  addJarvisItem,
  jarvisItems,
  settleJarvisItem,
  setJarvisDrawing,
  setJarvisSaidDrawing,
  takeJarvisQuestions,
  useJarvisHere,
  type JarvisHere,
} from "../../jarvisHere.ts";
import { pageJarvisApi } from "../../lib/api/jarvis.ts";
import { askFor, onAsked } from "../../pageAsks.ts";
import { realmView } from "../../places.ts";
import { SEARCH_HASH } from "../search/index.ts";
import type { JarvisQuestion } from "@gnoworld/schemas";
import { JarvisCard, type JarvisCardContext } from "./JarvisCard.tsx";
import type { FirstAsk } from "./asks.ts";
import { JarvisSaid } from "./JarvisSaid.tsx";
import { drawerOf } from "./drawer.ts";

const api = pageJarvisApi();
const noop = (): void => undefined;

const mine = (here: JarvisHere) => (item: { room: string; account?: string | undefined }) =>
  item.room === here.room && item.account === here.account;

// What is asked while this account has an ask in flight in a room, asked in turn as each answer comes: the same ask again is not.
const waiting: { here: JarvisHere; question: JarvisQuestion }[] = [];
const same = (one: JarvisQuestion, other: JarvisQuestion): boolean => JSON.stringify(one) === JSON.stringify(other);

// Asks, or waits while this account has an ask in flight in this room; the answer is the card's by its id, whatever room is in view by then.
function ask(here: JarvisHere, question: JarvisQuestion): void {
  const running = jarvisItems().find((item) => mine(here)(item) && item.ask !== undefined && item.result === undefined);
  if (running !== undefined) {
    const asked = [running.ask, ...waiting.filter((each) => mine(here)(each.here)).map((each) => each.question)];
    if (!asked.some((each) => each !== undefined && same(each, question))) waiting.push({ here, question });
    return;
  }
  const id = addJarvisItem({ room: here.room, account: here.account, ask: question });
  api
    .ask(question)
    .then((result) => {
      settleJarvisItem(id, result);
      const next = waiting.findIndex((each) => mine(here)(each.here));
      const [turn] = next < 0 ? [] : waiting.splice(next, 1);
      if (turn !== undefined) ask(turn.here, turn.question);
    })
    .catch(reportError);
}

// The introduction, once for an account in a room.
function introduce(here: JarvisHere): void {
  if (jarvisItems().some((item) => mine(here)(item) && item.ask === undefined)) return;
  addJarvisItem({ room: here.room, account: here.account });
}

// Each ask of the page's that this host answers, once the chat's drawing is loaded (`wake`).
function listen(here: JarvisHere, wake: (act: () => void) => () => void, signal: AbortSignal): void {
  onAsked(
    "jarvis",
    wake(() => {
      introduce(here);
    }),
    signal,
  );
  onAsked(
    "jarvis-catch-up",
    wake(() => {
      ask(here, { ask: "catch-up", room: here.room });
    }),
    signal,
  );
  onAsked(
    "jarvis-ask",
    wake(() => {
      for (const question of takeJarvisQuestions()) ask(here, { question, room: here.room });
    }),
    signal,
  );
  // A line Jarvis said asks for its card's drawing alone: no card is made.
  onAsked("jarvis-said", wake(noop), signal);
}

export function JarvisHost({ first }: { first: FirstAsk }) {
  const here = useJarvisHere();
  const firedRef = useRef(false);
  const [drawn, setDrawn] = useState<Drawing>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (here === undefined) return undefined;
    const stop = new AbortController();
    // The chat's drawing first: a card is drawn with it, and no answer comes before it.
    const wake = (act: () => void) => () => {
      drawing()
        .then((loaded) => {
          setDrawn(loaded);
          act();
        })
        .catch(reportError);
    };
    listen(here, wake, stop.signal);
    // The ask that brought the host, said again now that the host listens.
    if (!firedRef.current) {
      firedRef.current = true;
      askFor(first);
    }
    return () => {
      stop.abort();
    };
  }, [here, first]);
  useEffect(() => {
    const chain = universes.find(({ id }) => id === here?.universe.id);
    if (here === undefined || drawn === undefined || chain === undefined) return undefined;
    const go = (to: string | { pathname: string; hash: string }) => {
      Promise.resolve(navigate(to)).catch(reportError);
    };
    const { realm, universe } = here;
    const ctx: JarvisCardContext = {
      room: here.room,
      ask: (question) => {
        ask(here, question);
      },
      chain: { name: chain.name, chainId: chain.chainId, rpc: chain.rpc, indexer: chain.indexer },
      gnoweb: universe.gnoweb ?? chain.gnoweb,
      own: location.origin,
      draw: drawerOf(drawn),
      onFly: go,
      forms: {
        search: () => {
          go({ pathname, hash: SEARCH_HASH });
        },
        functions:
          realm === undefined
            ? undefined
            : () => {
                go(realmView(realm, universe));
              },
      },
    };
    setJarvisDrawing((item) => <JarvisCard key={item.id} item={item} ctx={ctx} />);
    const card = {
      chain: ctx.chain,
      options: ctx.options,
      gnoweb: ctx.gnoweb,
      own: ctx.own,
      draw: ctx.draw,
      onFly: ctx.onFly,
    };
    setJarvisSaidDrawing((room, msgid, fallback) => (
      <JarvisSaid key={msgid} {...{ room, msgid, card, fallback }} read={api.said} />
    ));
    return () => {
      setJarvisDrawing(undefined);
      setJarvisSaidDrawing(undefined);
    };
  }, [here, drawn, navigate, pathname]);
  return null;
}
