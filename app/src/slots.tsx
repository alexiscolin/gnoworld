// The places slice 8's other parts fill (the chief, 2026-11-04): named and typed here, filled from their own features through `plug`, one
// import line each in plugs.ts, so the header, the passport and the arrival import nothing of theirs. A slot nobody filled draws nothing.
import { createElement, type ComponentType } from "react";
import type { RealmBlocks } from "./features/realms/RealmBlocks.tsx";
import type { DeviceSlice } from "./store/keep.ts";

/** A first visit's place, as the arrival pill asks 8b's line for it. */
interface Arrival {
  /** The universe's id and the world's, joined as the device keys them ("gnoland:govdao"). */
  readonly key: string;
  readonly universe: string;
  /** The world's name, as the pill says it. */
  readonly name: string;
  /** The UTC day of the arrival. */
  readonly day: string;
  /** Whether this visit stamped the world: false for a world already stamped, when only 8b's line may raise the pill. */
  readonly stamped: boolean;
}

/** The passport's sections' props: the universe the dialog counts. */
interface PassportSectionProps {
  readonly universe: string;
}

/** A realm page's drawing (5h's RealmBlocks), which a page's capture draws with (8f). */
export type PageDrawing = typeof RealmBlocks;

export interface Slots {
  /** 8c's bell, in the header's right group, before the account. */
  bell: ComponentType;
  /** 8b's today's expedition, in the passport dialog after the constellations. */
  passportExpedition: ComponentType<PassportSectionProps>;
  /** 8b's quests, in the passport dialog after the expedition. */
  passportQuests: ComponentType<PassportSectionProps>;
  /** 8b's line under "Stamped · <world>" ("Today's expedition · 1 of 3"), or none for a place that is no stop of today's: one pill, never
   * two. Asked at every arrival, stamped or not, with the device's one way to change a field, so 8b records its stop and a quest's visit
   * there; its own code may come in a chunk, so it answers later. */
  arrivalLine: (arrival: Arrival, change: DeviceSlice["deviceActions"]["change"]) => Promise<string | undefined>;
  /** 8b's watch of discovery, mounted once in the shell, drawing nothing (its pill goes through topPill.tsx's `raisePill`). */
  discoveryWatch: ComponentType;
  /** 8c's share of a place, the "Share" on the "First to chart" pill (frame 93): its name and its page's path. */
  share: (place: { readonly name: string; readonly path: string }) => void;
  /** 8f's capture of a page under a chat line: the realm whose home the line links to, and whether its card is a Tab stop. */
  linePreview: ComponentType<{ readonly path: string; readonly tabbable: boolean }>;
  /** 5h's drawing of a realm page, for 8f's capture: asked as a capture draws, in a chunk of its own (the realms' door would bring the
   * realm view's whole chunk to a chat line that links a page, 8f's review). */
  pageDrawing: () => Promise<PageDrawing>;
}

const filled: Partial<Slots> = {};

/** Fills a slot: from a part's own feature, at its module's load, before the page draws. */
export function plug<K extends keyof Slots>(name: K, part: Slots[K]): void {
  filled[name] = part;
}

/** What fills a slot, or none. */
export const slot = <K extends keyof Slots>(name: K): Slots[K] | undefined => filled[name];

/** The header's bell, or nothing. */
export function BellSlot() {
  const bell = filled.bell;
  return bell === undefined ? null : createElement(bell);
}

/** A section of the passport, or nothing. */
export function PassportSlot({ name, universe }: { name: "passportExpedition" | "passportQuests"; universe: string }) {
  const section = filled[name];
  return section === undefined ? null : createElement(section, { universe });
}

/** 8b's watch of discovery, or nothing. */
export function WatchSlot() {
  const watch = filled.discoveryWatch;
  return watch === undefined ? null : createElement(watch);
}
