// The full-screen chat's info panel (the video's frame 23.58.01, right): the place's kicker and name, what it says of itself,
// then Here now. Only what the page holds: the video's sample figures are never drawn.
import { Cluster, Kicker, Stack } from "@gnoworld/ui";
import type { ReactNode, Ref } from "react";
import { Figure } from "./Figure.tsx";
import styles from "./PlaceInfo.module.css";

export interface PlaceInfoProps {
  /** Over the kicker: the place seen in space (PlaceView.tsx). */
  view?: ReactNode;
  kicker: string;
  name: string;
  description: string;
  /** How many are talking here now: none draws no figure. */
  talking?: number | undefined;
  /** How many countries those here declared, beside it (PlaceMore.tsx). */
  countries?: ReactNode;
  /** The place's links out (PlaceMore.tsx's Links). */
  links?: ReactNode;
  /** The place's page, as a control opening it (a phone's sheet, PlaceSheet.tsx); none on a computer, whose page is beside the chat. */
  page?: ReactNode;
  /** In a sheet (`bare`): who talks and who is here, in one line of words in place of the figures. */
  live?: string;
  /** Without the kicker and the name: the sheet this is in has them in its title. */
  bare?: boolean;
  /** Who is here, drawn under Here now. */
  here: ReactNode;
  /** Takes the focus from code, as Who's here moves the reader to the list. */
  panelRef?: Ref<HTMLElement>;
}

// A sheet's page says the description itself: it hands none, and none is drawn.
function About({ text, bare }: { text: string; bare: boolean }) {
  return bare && text === "" ? null : <p className={styles["about"]}>{text}</p>;
}

export function PlaceInfo({
  view,
  kicker,
  name,
  description,
  talking,
  countries,
  links,
  page,
  live,
  bare = false,
  here,
  panelRef,
}: PlaceInfoProps) {
  // A sheet's order: what is live, its page, who is here, then the links out.
  const sheet = bare && live !== undefined;
  return (
    <aside ref={panelRef} tabIndex={-1} aria-label={name} className={styles["panel"]}>
      <Stack space="xs">
        {view}
        {bare ? null : (
          <>
            <Kicker>{kicker}</Kicker>
            <h2 className={styles["name"]}>{name}</h2>
          </>
        )}
        <About text={description} bare={bare} />
        {sheet ? (
          <>
            {live === "" ? null : <p className={styles["live"]}>{live}</p>}
            {page}
          </>
        ) : null}
        {sheet || talking === undefined ? null : (
          <div className={styles["stats"]}>
            <Cluster space="2xl">
              <Figure value={talking} caption="Talking now" />
              {countries}
            </Cluster>
          </div>
        )}
        {sheet ? null : (
          <>
            {links}
            {page}
          </>
        )}
        <section className={styles["here"]}>
          <Stack space="2xs">
            <h3 className="label">Here now</h3>
            {here}
          </Stack>
        </section>
        {sheet ? links : null}
      </Stack>
    </aside>
  );
}
