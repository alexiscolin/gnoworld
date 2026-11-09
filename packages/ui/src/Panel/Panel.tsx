import type { ReactNode } from "react";
import { Stack } from "../compositions/index.ts";
import { Kicker } from "../Kicker/Kicker.tsx";
import styles from "./Panel.module.css";

export interface PanelProps {
  /** What names the region: a reader finds the panel by it. */
  label: string;
  /** Docked beside the scene, floating over it, or the plate of a world's page. */
  look?: "docked" | "floating" | "plate";
  /** The plate's vertical atlas caption, seen and never read; no other look has one. */
  caption?: string;
  children: ReactNode;
}

// The plate's title is fitted to its words, as the prototype's fitName does (app.js: the column over the letters at 0.58 em,
// from 4 letters): each step is the longest name its size holds, so a name never runs past the plate's text column.
const FITS = [6, 8, 10, 12, 16, 20] as const;
const fitOf = (label: string) => {
  const letters = [...new Intl.Segmenter().segment(label)].length;
  return FITS.find((step) => letters <= step) ?? "more";
};

/** A panel: a region with its header, body and footer; the plate adds its dot grid and its caption. */
export function Panel({ label, look = "docked", caption, children }: PanelProps) {
  return (
    <section
      className={styles["panel"]}
      aria-label={label}
      data-look={look}
      data-fit={look === "plate" ? fitOf(label) : undefined}
    >
      {look === "plate" && caption !== undefined ? (
        <div className={styles["caption"]} aria-hidden="true" data-caption="">
          <Kicker vertical>{caption}</Kicker>
        </div>
      ) : null}
      <div className={styles["content"]} data-content="">
        <Stack space="m">{children}</Stack>
      </div>
    </section>
  );
}

function Header({ children }: { children: ReactNode }) {
  return <header>{children}</header>;
}

function Body({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

function Footer({ children }: { children: ReactNode }) {
  return <footer>{children}</footer>;
}

Panel.Header = Header;
Panel.Body = Body;
Panel.Footer = Footer;
Panel.Layout = Layout;
Panel.Dock = Dock;

interface LayoutProps {
  /** The plate: a Panel of the plate look. */
  plate: ReactNode;
  /** The dock at the plate's right, inside the same outline, on a wide screen; under that width it takes no place of its own,
   * and what it holds (a chat) takes the page. */
  children?: ReactNode;
}

/** A world's page: the plate and what stands beside it. On a wide screen the plate is fixed at the left, inside one outline
 * the scene and the dock share; under that width it is a block in the page. The width is this sheet's alone. */
function Layout({ plate, children }: LayoutProps) {
  return (
    <div>
      <div className={styles["frame"]} aria-hidden="true" data-frame="" />
      <div className={styles["place"]} data-exit="">
        {plate}
      </div>
      {children === undefined ? null : <Dock>{children}</Dock>}
    </div>
  );
}

/** The dock at the right on a wide screen, under that width no place of its own: beside a plate, inside its outline (Layout), or
 * `alone` over the scene with every corner round (the chat over the cosmos, frame 143). */
function Dock({ alone = false, children }: { alone?: boolean; children: ReactNode }) {
  return (
    <div className={styles["dock"]} data-dock="" data-alone={alone ? "" : undefined} data-exit="">
      {children}
    </div>
  );
}
