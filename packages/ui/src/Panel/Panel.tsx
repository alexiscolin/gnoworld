import { type ReactNode, useLayoutEffect } from "react";
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

// The plate's title is fitted to its words as the proposal's build does it: a width over the letters at 0.56 em, at most 120 px, 640 px wide
// on the plate and 340 on a narrow one (a phone), so a name never runs past the plate's text column.
const TITLE_MAX = 120;
const fitOf = (label: string, width: number) => {
  const letters = [...new Intl.Segmenter().segment(label)].length;
  return `${String(Math.min(TITLE_MAX, Math.round(width / (Math.max(1, letters) * 0.56))))}px`;
};

/** A panel: a region with its header, body and footer; the plate adds its dot grid and its caption. */
export function Panel({ label, look = "docked", caption, children }: PanelProps) {
  return (
    <section
      className={styles["panel"]}
      aria-label={label}
      data-look={look}
      data-world={look === "plate" ? "" : undefined}
      ref={(panel) => {
        // Set through the element's own style, never as a style attribute in the page: the policy refuses one (csp.ts).
        if (look !== "plate" || panel === null) return;
        panel.style.setProperty("--_tsz", fitOf(label, 640));
        panel.style.setProperty("--_tsz-narrow", fitOf(label, 340));
      }}
    >
      {look === "plate" && caption !== undefined ? (
        <div className={styles["caption"]} aria-hidden="true" data-caption="">
          <Kicker vertical>{caption}</Kicker>
        </div>
      ) : null}
      {look === "plate" ? <span className={styles["fill"]} aria-hidden="true" data-fill="" /> : null}
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
  return <div className={styles["body"]}>{children}</div>;
}

/** The sentence under the plate's title: its own words, in the lead type, a little dimmed. */
function Lede({ children }: { children: ReactNode }) {
  return <p className={styles["lede"]}>{children}</p>;
}

/** The plate's title: its words rise out of a clip of their own box (the arrival's), sized to fit by the plate's label. */
function Title({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div className={styles["title"]} data-title="">
      <h1 id={id}>{children}</h1>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <footer>{children}</footer>;
}

Panel.Header = Header;
Panel.Body = Body;
Panel.Title = Title;
Panel.Lede = Lede;
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
  // The page's code has it: what its server markup held out of sight (Panel.module.css) the arrival moves from here, in the same frame.
  useLayoutEffect(() => {
    document.documentElement.dataset["live"] = "";
  }, []);
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
