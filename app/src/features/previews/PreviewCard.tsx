// A page's capture as a card (8f): on a world's plate (frame 26, "Preview · gno.land/r/gov/dao · captured · Open large") and under a chat
// line (frames 104, 107). The page is drawn small by the realm view's own drawing, as a picture: inert and hidden from assistive technology,
// so nothing of it is a control. The card's one button opens it at size, with when it was captured and the way to the page as it is now.
import type { Capture } from "@gnoworld/schemas/indexer";
import { page } from "@gnoworld/core";
import { Button, Cluster, Dialog, Sidebar, Stack } from "@gnoworld/ui";
import { useState, type KeyboardEvent } from "react";
import type { PageDrawing } from "../../slots.tsx";
import type { Drawing } from "../chat/index.ts";
import { moment } from "../../lib/days.ts";
import { cardPath } from "../../lib/shortPath.ts";
import styles from "./Preview.module.css";

export interface PreviewCardProps {
  capture: Capture;
  look: "plate" | "line";
  /** The default universe's gnoweb, which the capture's links to a path resolve against. */
  gnoweb: string;
  via: Drawing;
  /** The realm page's drawing (5h's RealmBlocks), which comes through its slot. */
  Blocks: PageDrawing;
  /** The realm's view on this site: the page as it is now. */
  live: string;
  /** Whether the card is a Tab stop: under a line, on the list's stop alone (U1). */
  tabbable?: boolean;
}

// A key pressed in the open capture is its own: under a line, the room's list would take its arrows (lineFocus.ts).
const kept = (event: KeyboardEvent) => {
  event.stopPropagation();
};

export function PreviewCard({ capture, look, gnoweb, via, Blocks, live, tabbable = true }: PreviewCardProps) {
  const [open, setOpen] = useState(false);
  const read = page(capture.text, { origin: gnoweb });
  const blocks = read.kind === "page" ? read.blocks : [];
  const when = moment(new Date(capture.captured));
  // Under a line the page alone, as frame 104 draws it: the card's words are its button's name, for assistive technology alone.
  const said = look === "line" ? "visually-hidden" : undefined;
  const thumb = (
    <div className={styles["thumb"]} data-preview-thumb="" inert aria-hidden="true">
      <div className={styles["page"]}>
        <Blocks blocks={blocks} origin={gnoweb} via={via} />
      </div>
    </div>
  );
  const opener = (
    <button
      type="button"
      data-preview=""
      className={[styles["open"], "covers"].join(" ")}
      tabIndex={tabbable ? undefined : -1}
      onClick={() => {
        setOpen(true);
      }}
    >
      <span className={said}>Preview</span>
      <span className={said ?? "label truncate"}>{`${cardPath(capture.path)} · captured`}</span>
      <span className={said ?? "label"}>Open large</span>
    </button>
  );
  return (
    <div className={styles["card"]} data-look={look}>
      {look === "plate" ? (
        <Sidebar space="s">
          {thumb}
          {opener}
        </Sidebar>
      ) : (
        <Stack space="2xs">
          {thumb}
          {opener}
        </Stack>
      )}
      <div onKeyDown={kept}>
        <Dialog
          title={capture.path}
          open={open}
          wide
          onClose={() => {
            setOpen(false);
          }}
        >
          <Stack space="s">
            <p className={styles["when"]}>
              Captured <time dateTime={capture.captured}>{when}</time>: the first part of the page as the chain rendered
              it.
            </p>
            {/* Drawn at size only while open: a chat of many linking lines holds one small drawing each. */}
            {open ? <Blocks blocks={blocks} origin={gnoweb} via={via} /> : null}
            <Cluster>
              <Button href={live}>Open the page</Button>
            </Cluster>
          </Stack>
        </Dialog>
      </div>
    </div>
  );
}
