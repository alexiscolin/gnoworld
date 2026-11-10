// The frame of a place's page in space (frames 22, 93, 104): the planet's place the page lays out and the scene draws in, the plate at the
// left, the dock at the right, and space's foot (SpaceFoot.tsx). A world's page and a realm's are this frame; only the plate's content and the dock's
// chat differ. On a computer the planet stands larger than the window, lit at three quarters (D458).
import type { ReactNode } from "react";
import { Panel, Stack } from "@gnoworld/ui";
import { chatHeld, LOADING } from "../features/chat/index.ts";
import { useMedia } from "../features/chat/useMedia.ts";
import { SpaceFoot } from "../features/universe/SpaceFoot.tsx";
import { StatusRing } from "../features/world/StatusRing.tsx";
import type { Ring } from "../features/world/statusRing.ts";
import { useApp } from "../storeContext.tsx";
import place from "./globe.module.css";
import styles from "./world.module.css";

/** Where a page frames its planet close, larger than the window (D458): the dock's width for a place's page. */
export const DOCKED = "(min-width: 1280px)";

/** Whether the window `query` names frames the planet close (D458): never where the settings ask for low quality, whose frame keeps
 * today's pixels. */
export function useFraming(query: string): boolean {
  const low = useApp(({ device }) => device.settings.quality === "low");
  return useMedia(query) && !low;
}

export function PlaceFrame({
  label,
  plate,
  ring,
  chat,
  chatDue = false,
}: {
  label: string;
  plate: ReactNode;
  /** The open proposal's ring round the planet, where its realm reports a tally. */
  ring?: Ring | undefined;
  /** The dock's chat, and whether its door to space has come (useSpace). */
  chat?: ReactNode;
  chatDue?: boolean;
}) {
  const framed = useFraming(DOCKED);
  return (
    <>
      {/* The planet's place: the page lays it out, the scene draws in it. */}
      <div
        className={place["globe"]}
        data-globe
        data-world="waiting"
        data-flown="landed"
        data-framing={framed ? "imposing" : undefined}
      >
        {ring === undefined ? null : <StatusRing ring={ring} />}
      </div>
      <Panel.Layout
        plate={
          <Panel label={label} look="plate" caption="gnoworld · hub atlas">
            <Panel.Body>
              <Stack>{plate}</Stack>
            </Panel.Body>
          </Panel>
        }
      >
        {chat === undefined ? null : (
          <DockChat className={styles["chat"]} due={chatDue}>
            {chat}
          </DockChat>
        )}
      </Panel.Layout>
      <SpaceFoot />
    </>
  );
}

/** The dock's chat of a place's page: the chat once its door to space has come or it is held, the loading shape till then. */
export function DockChat({
  className,
  due,
  children,
}: {
  className: string | undefined;
  due: boolean;
  children: ReactNode;
}) {
  return (
    <div id="chat" className={className}>
      {due || chatHeld() ? children : LOADING}
    </div>
  );
}
