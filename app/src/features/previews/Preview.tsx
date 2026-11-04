// A page's preview where a page asks for one (8f): the captures' file read once a page, the page's capture found by its path, drawn as
// its card with the chat's drawing, which comes with it. No capture, no preview: a page the file does not hold, a file of another universe
// than the default, whose pages the job captures, or a file that could not be read draws nothing, and nothing while the file comes.
import type { Capture, Previews } from "@gnoworld/schemas/indexer";
import { useEffect, useState } from "react";
import { realmView } from "../../places.ts";
import { slot, type PageDrawing } from "../../slots.tsx";
import { drawing, type Drawing } from "../chat/index.ts";
import { PreviewCard } from "./PreviewCard.tsx";
import { captured, sharedPreviews } from "./previews.ts";

export interface PreviewProps {
  /** The realm whose home page's capture is drawn. */
  path: string;
  look: "plate" | "line";
  tabbable?: boolean;
  /** The captures' file; the page's one read by default. */
  read?: () => Promise<Previews | undefined>;
}

export function Preview({ path, look, tabbable = true, read = sharedPreviews }: PreviewProps) {
  const [shown, setShown] = useState<{ capture: Capture; via: Drawing; Blocks: PageDrawing }>();
  useEffect(() => {
    let live = true;
    const universe = captured().id;
    // The realm page's drawing comes through its slot (slots.tsx): none filled, no capture is drawn.
    const blocks = slot("pageDrawing");
    if (blocks === undefined) return;
    Promise.all([read(), drawing(), blocks()]).then(
      ([file, via, Blocks]) => {
        const capture = file?.universe === universe ? file.previews.find((each) => each.path === path) : undefined;
        if (live && capture !== undefined) setShown({ capture, via, Blocks });
      },
      (error: unknown) => {
        reportError(error);
      },
    );
    return () => {
      live = false;
    };
  }, [path, read]);
  if (shown?.capture.path !== path) return null;
  const universe = captured();
  return (
    <PreviewCard
      capture={shown.capture}
      look={look}
      gnoweb={universe.gnoweb ?? ""}
      via={shown.via}
      Blocks={shown.Blocks}
      live={realmView(path, universe)}
      tabbable={tabbable}
    />
  );
}
