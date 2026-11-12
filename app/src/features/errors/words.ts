import type { ErrorKind } from "./kind.ts";

/** The way on a kind offers first. */
export type Way = "again" | "reload" | "search" | "earth";

interface Words {
  title: (noun: string | undefined) => string;
  line: (noun: string) => string;
  /** The one line of an inline failure. */
  short: string;
  way: Way;
}

// A noun is the place a route gives (a world, a realm, a universe); a page is the default.
export const WORDS: Readonly<Record<ErrorKind, Words>> = {
  "not-found": {
    title: (noun = "page") => `No ${noun} here`,
    line: (noun) => `You are lost in space: no ${noun} of gno.world goes by that address.`,
    short: "Nothing here goes by that name.",
    way: "search",
  },
  gone: {
    title: (noun = "page") => `This ${noun} is gone`,
    line: (noun) => `This ${noun} was here once and has been taken away.`,
    short: "This is gone.",
    way: "search",
  },
  forbidden: {
    title: (noun = "page") => `This ${noun} is closed to you`,
    line: () => "Log in with an account that may open it, or go back.",
    short: "You may not open this.",
    way: "earth",
  },
  "too-many": {
    title: () => "Slow down a moment",
    line: () => "Too many asks came in a short time. Wait a little, then try again.",
    short: "Too many tries: wait a little.",
    way: "again",
  },
  offline: {
    title: () => "You are offline",
    line: () => "gno.world cannot be reached from here. Check your connection, then try again.",
    short: "You are offline.",
    way: "again",
  },
  unavailable: {
    title: () => "Out of reach for now",
    line: () => "The server or the chain is not answering. Try again in a moment.",
    short: "The server is not answering.",
    way: "again",
  },
  "new-version": {
    title: () => "A new version is out",
    line: () => "This page is from an older one. Reload to get the latest.",
    short: "A new version is out.",
    way: "reload",
  },
  crash: {
    title: (noun) => (noun === undefined ? "Something went wrong" : `This ${noun} could not load`),
    line: () => "Sorry about that. Try again, and if it stays, come back a little later.",
    short: "Something went wrong.",
    way: "again",
  },
};
