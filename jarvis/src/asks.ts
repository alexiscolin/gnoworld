// What a request to POST /ask asks the loop: the person's own question, or a fixed ask's words, with the room's lines as data.
import type { JarvisAsk } from "@gnoworld/schemas";
import type { Question } from "./loop.ts";

// The fixed asks' words, Jarvis's own and constant: the page sets none of them. The place, and a function's
// realm and name, go in as data blocks beside the room's lines.
const HERE = "What can I do here, in this place? Say it briefly, with what the place's data tells.";
const CATCH_UP = "Catch me up on this room: what was said, in a few short lines.";
// An explanation is the same for every room, so it is written in English whatever the room says.
const EXPLAIN =
  "Explain the function in the function block, of the realm it names: what it does and how to call it, briefly, in English.";

export function questionOf(asked: JarvisAsk): { question: Question; run: "main" | "fast" | "explain" } {
  const room = asked.lines.map(lineOf);
  const place = { source: "place", text: asked.room };
  if ("question" in asked) return { question: { text: asked.question, room, read: [place] }, run: "main" };
  if (asked.ask === "catch-up") return { question: { text: CATCH_UP, room, read: [place] }, run: "fast" };
  if (asked.ask === "here") return { question: { text: HERE, room, read: [place] }, run: "main" };
  // The code alone: no line of the room and no room name, so the answer can be kept for every room.
  const named = { source: "function", text: `${asked.realm} ${asked.function}` };
  return {
    question: { text: EXPLAIN, room: [], read: [named], finds: { realm: asked.realm, name: asked.function } },
    run: "explain",
  };
}

// A room's line as data: who said it (the asker, or the others by their number), when, and its words, so its line
// breaks and quotes pass for no other line.
const lineOf = ({ speaker, time, text }: { speaker: number; time?: string | undefined; text: string }): string =>
  JSON.stringify({ who: speaker === 0 ? "asker" : `#${String(speaker)}`, time, text });
