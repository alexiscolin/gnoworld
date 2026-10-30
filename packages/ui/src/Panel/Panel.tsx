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

/** A panel: a region with its header, body and footer; the plate adds its dot grid and its caption. */
export function Panel({ label, look = "docked", caption, children }: PanelProps) {
  return (
    <section className={styles["panel"]} aria-label={label} data-look={look}>
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
