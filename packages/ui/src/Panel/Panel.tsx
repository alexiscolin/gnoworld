import type { CSSProperties, ReactNode } from "react";
import { Stack } from "../compositions/index.ts";
import { Kicker } from "../Kicker/Kicker.tsx";
import styles from "./Panel.module.css";

export interface PanelProps {
  /** What names the region: a reader finds the panel by it. */
  label: string;
  /** Docked beside the scene, floating over it, or the plate of a world's page. */
  look?: "docked" | "floating" | "plate";
  /** The plate's own colour, from the world's data: a hex colour, or none. */
  tint?: string;
  /** The plate's vertical atlas caption, seen and never read; no other look has one. */
  caption?: string;
  children: ReactNode;
}

// A colour is all a tint may be: any other text would join the style attribute as a declaration of its own.
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A panel: a region with its header, body and footer; the plate adds the world's tint, its dot grid and its caption. */
export function Panel({ label, look = "docked", tint, caption, children }: PanelProps) {
  const own = tint !== undefined && HEX.test(tint) ? ({ "--world": tint } as CSSProperties) : undefined;
  return (
    <section className={styles["panel"]} aria-label={label} data-look={look} style={own}>
      {look === "plate" && caption !== undefined ? (
        <div className={styles["caption"]} aria-hidden="true">
          <Kicker vertical>{caption}</Kicker>
        </div>
      ) : null}
      <div className={styles["content"]}>
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
