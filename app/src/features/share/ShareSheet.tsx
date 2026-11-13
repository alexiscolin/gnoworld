// The share sheet (ADR-0002 §1, Share: "the phone's share sheet, a copied link, a snapshot of the view with its caption"; no frame shows it,
// so built from the design system and retouched in the ping-pong). The picture is the scene's canvas alone, asked as the sheet opens; with no
// scene on the page (a phone before View in space, the list) there is none. Its own root: the sheet needs neither the router nor the store.
import { SNAPSHOT_EVENT, SNAPSHOT_TAKEN } from "@gnoworld/core";
import { Button, Cluster, Dialog, Stack } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { copyText } from "../../lib/copy.ts";
import { linkOf, type SharedPlace } from "./link.ts";
import styles from "./ShareSheet.module.css";

// How long the sheet waits for the scene's next frame before it shows no picture: a frame is due within one at any rate the loop runs.
const PICTURE_WAIT_MS = 1_500;
const JPEG_QUALITY = 0.86;

interface Picture {
  /** The preview, as the page's images may load it (the CSP allows data: alone beside the site). */
  readonly url: string;
  /** The file a device's share sheet takes. */
  readonly file: File | undefined;
}

const fileOf = (canvas: HTMLCanvasElement, name: string): Promise<File | undefined> =>
  new Promise((done) => {
    canvas.toBlob(
      (blob) => {
        done(blob === null ? undefined : new File([blob], `${name}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });

const waited = (ms: number) =>
  new Promise<undefined>((done) => {
    setTimeout(done, ms);
  });

// The scene's next frame, asked of its canvas while it draws (the universe marks it "on"; covered, lost or failed, it is not): none else.
function snapshot(): Promise<HTMLCanvasElement | undefined> {
  const scene = document.querySelector("canvas[data-scene='on']");
  if (scene === null) return Promise.resolve(undefined);
  return new Promise((done) => {
    scene.addEventListener(
      SNAPSHOT_TAKEN,
      (answer) => {
        const picture: unknown = answer instanceof CustomEvent ? answer.detail : undefined;
        done(picture instanceof HTMLCanvasElement ? picture : undefined);
      },
      { once: true },
    );
    scene.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT));
  });
}

// The view's picture, or none: the scene's next frame, or nothing if it does not come in time.
async function pictureOf(name: string): Promise<Picture | undefined> {
  const canvas = await Promise.race([snapshot(), waited(PICTURE_WAIT_MS)]);
  if (canvas === undefined) return undefined;
  return { url: canvas.toDataURL("image/jpeg", JPEG_QUALITY), file: await fileOf(canvas, name) };
}

// A file name of the place's: letters and digits, the rest dashes.
const fileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "gnoworld";

// What the device's share sheet takes: the picture too when it can share files.
function shareData(place: SharedPlace, picture: Picture | undefined): ShareData {
  const data: ShareData = { title: place.name, text: `${place.name} on gnoworld`, url: linkOf(place) };
  const files = picture?.file === undefined ? undefined : [picture.file];
  // A browser may share links and no files, or have no canShare at all: it is typed as always there.
  const canFiles =
    files !== undefined && typeof navigator.canShare === "function" && navigator.canShare({ ...data, files });
  return canFiles ? { ...data, files } : data;
}

function Sheet({ place, open, onClose }: { place: SharedPlace; open: boolean; onClose: () => void }) {
  // undefined while the picture is asked, null when there is none.
  const [picture, setPicture] = useState<Picture | null | undefined>(undefined);
  const [said, setSaid] = useState("");
  const link = linkOf(place);
  const canShare = typeof navigator.share === "function";
  // Each opening is a sheet of its own (its key), so its picture and its words start afresh.
  useEffect(() => {
    let current = true;
    pictureOf(fileName(place.name)).then(
      (taken) => {
        if (current) setPicture(taken ?? null);
      },
      () => {
        if (current) setPicture(null);
      },
    );
    return () => {
      current = false;
    };
  }, [place]);
  return (
    <Dialog
      title={`Share ${place.name}`}
      description="Its link, and a picture of the view as it is now."
      open={open}
      onClose={onClose}
    >
      <Stack space="s">
        {picture === null ? null : (
          <figure className={styles["picture"]} data-waiting={picture === undefined || undefined}>
            {picture === undefined ? null : (
              <img className="enter" src={picture.url} alt={`${place.name}, as the view shows it now`} />
            )}
            <figcaption className={styles["caption"]}>
              <span className="label">gnoworld</span>
              <span>{place.name}</span>
            </figcaption>
          </figure>
        )}
        <p className="data-text">{link}</p>
        <Cluster space="2xs">
          <Button
            emphasis="solid"
            icon="link"
            onClick={() => {
              const said = (copied: boolean) => {
                setSaid(copied ? "Link copied" : "Could not copy: select the link above");
              };
              copyText(link).then(said, () => {
                said(false);
              });
            }}
          >
            Copy link
          </Button>
          {canShare ? (
            <Button
              icon="share"
              busy={picture === undefined}
              onClick={() => {
                navigator.share(shareData(place, picture ?? undefined)).catch((error: unknown) => {
                  // The reader closing the device's sheet is no fault.
                  if (!(error instanceof DOMException && error.name === "AbortError"))
                    setSaid("Could not share from this device");
                });
              }}
            >
              Share…
            </Button>
          ) : null}
          <span role="status" className="label">
            {said}
          </span>
        </Cluster>
      </Stack>
    </Dialog>
  );
}

let root: Root | undefined;
let opened = 0;

/** Opens the sheet for `place`, in place of any other. */
export function openShare(place: SharedPlace): void {
  if (root === undefined) {
    const box = document.createElement("div");
    document.body.append(box);
    root = createRoot(box);
  }
  const shown = root;
  opened += 1;
  const key = opened;
  const close = () => {
    shown.render(<Sheet key={key} place={place} open={false} onClose={close} />);
  };
  shown.render(<Sheet key={key} place={place} open onClose={close} />);
}
