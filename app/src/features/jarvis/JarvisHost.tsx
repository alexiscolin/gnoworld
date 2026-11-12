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
import { drawerOf } from "./drawer.ts";

const api = pageJarvisApi();

const mine = (here: JarvisHere) => (item: { room: string; account: string | undefined }) =>
  item.room === here.room && item.account === here.account;

// Asks, unless this account has an ask in flight in this room; the answer is the card's by its id, whatever room is in view by then.
function ask(here: JarvisHere, question: JarvisQuestion): void {
  if (jarvisItems().some((item) => mine(here)(item) && item.ask !== undefined && item.result === undefined)) return;
  const id = addJarvisItem({ room: here.room, account: here.account, ask: question });
  api
    .ask(question)
    .then((result) => {
      settleJarvisItem(id, result);
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
}

export function JarvisHost({ first }: { first: "jarvis" | "jarvis-catch-up" | "jarvis-ask" }) {
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
    return () => {
      setJarvisDrawing(undefined);
    };
  }, [here, drawn, navigate, pathname]);
  return null;
}
