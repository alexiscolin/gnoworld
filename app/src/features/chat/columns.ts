// The widths this device gives the full chat's rooms and info columns (ui's ChatLayout), kept as one flag ("232,360"; a column
// not dragged is none and keeps its default). An external store, so the server and the first client render agree on the defaults.
import type { ChatEdge, ChatWidths } from "@gnoworld/ui";
import { useSyncExternalStore } from "react";
import { Heard } from "../../lib/heard.ts";
import { readFlag, writeFlag } from "../../lib/flags.ts";

const KEY = "gnoworld:chat-columns";
const NONE: Partial<ChatWidths> = {};

let current: Partial<ChatWidths> | undefined;
const heard = new Heard();

const asWidth = (word: string | undefined) => (word === undefined || word === "" ? NaN : Number(word));

function read(): Partial<ChatWidths> {
  const [rooms, info] = (readFlag(KEY) ?? "").split(",").map(asWidth);
  const widths: Partial<ChatWidths> = {};
  if (rooms !== undefined && Number.isFinite(rooms)) widths.rooms = rooms;
  if (info !== undefined && Number.isFinite(info)) widths.info = info;
  return widths;
}

function snapshot(): Partial<ChatWidths> {
  current ??= read();
  return current;
}

/** The columns' widths dragged so far and the way to change one: held in memory at once, kept on the device where it lets. */
export function useColumns(): { widths: Partial<ChatWidths>; onResize: (edge: ChatEdge, px: number) => void } {
  const widths = useSyncExternalStore(heard.subscribe, snapshot, () => NONE);
  const resize = (edge: ChatEdge, px: number) => {
    current = { ...snapshot(), [edge]: px };
    writeFlag(KEY, `${String(current.rooms ?? "")},${String(current.info ?? "")}`);
    heard.tell();
  };
  return { widths, onResize: resize };
}
