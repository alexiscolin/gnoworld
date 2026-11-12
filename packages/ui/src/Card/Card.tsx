import { createContext, use, useId, type CSSProperties, type ReactNode } from "react";
import { IconButton } from "../Button/IconButton.tsx";
import { Chip } from "../Chip/Chip.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Kicker } from "../Kicker/Kicker.tsx";
import styles from "./Card.module.css";
import { useRise } from "./useRise.ts";

// The id of a card's title, which its header gives the heading and the card is named by.
const TitleContext = createContext<string | undefined>(undefined);

export interface CardProps {
  /** Neutral unless asked; signal is the assistant's violet. */
  tone?: "neutral" | "signal";
  dashed?: boolean;
  compact?: boolean;
  /** The hub card's look (a places' list, the realm plate): a 3 % fill, 16 px corners, 6 % and a stronger line under the pointer. */
  look?: "hub";
  /** No padding: its parts bring their own (the figures band). Hub only. */
  flush?: boolean;
  /** Under the pointer it stays as it is: a card with nothing to open, or one holding a card whose text must keep its contrast. Hub only. */
  fixed?: boolean;
  /** Open alone: the plate's other blocks are gone and the card fills the pane, its parts grown (the chart's height, a list's page). */
  open?: boolean;
  /** Rises as it comes into view, on the plate's arrival or as it scrolls in (useRise.ts); its parts' own entrances wait for it. */
  rises?: boolean;
  children: ReactNode;
}

// The attributes a card's sheet reads: its tone, edge and density, the hub look and what it holds apart, the plate's entrance.
function looks({ tone = "neutral", dashed, compact, look, flush, fixed, open, rises }: Omit<CardProps, "children">) {
  const set = (on: boolean | undefined) => (on === true ? "" : undefined);
  return {
    "data-tone": tone,
    "data-edge": dashed === true ? "dashed" : "solid",
    "data-density": compact === true ? "compact" : "comfortable",
    "data-look": look,
    "data-flush": set(flush),
    "data-fixed": set(fixed),
    "data-alone": set(open),
    "data-rise": set(rises),
  };
}

/** A card: an article named by its header's title, with its body and actions. Layout only: what it
 * holds (a poll, a call, a seal) is an assembly in its feature. */
export function Card({ children, ...own }: CardProps) {
  const titleId = useId();
  const { ref, state } = useRise(own.rises === true);
  return (
    <article
      className={styles["card"]}
      aria-labelledby={titleId}
      {...looks(own)}
      data-state={state === undefined ? undefined : "in"}
      ref={ref}
      style={state === undefined ? undefined : ({ "--d": state.delay } as CSSProperties)}
    >
      <TitleContext value={titleId}>
        <Stack space="s">{children}</Stack>
      </TitleContext>
    </article>
  );
}

export interface CardHeaderProps {
  title: string;
  icon?: IconName;
  kicker?: string;
  /** Where it stands: live, ended, won, signed. */
  state?: string;
  /** Its title's level under the page's headings: 3 unless the page says (F305). */
  level?: 2 | 3 | 4;
  /** Large is the light title of a card that is a screen's subject (F5730): the body's size otherwise. */
  size?: "large";
  /** An Expand button after the title (the dock's icon): whether the card is open, and the click that toggles it. */
  expand?: {
    open: boolean;
    onToggle: (from: HTMLElement) => void;
    /** The smallest button, a square's. */ small?: boolean;
  };
  /** A short line before the Expand button, in the muted meta type ("reads run here without a wallet"). */
  hint?: string;
  /** Buttons before the hint and the Expand button, on the title's row. */
  actions?: ReactNode;
  /** A line that follows the title and gives way first, a long path cut in the middle of the row. */
  meta?: string;
  /** A mark before the title and its kicker, a control tall: a medal. */
  lead?: ReactNode;
}

const HEADINGS = { 2: "h2", 3: "h3", 4: "h4" } as const;

// What stands at the end of the header's row: its hint, its buttons and the Expand button.
function End({
  title,
  hint,
  actions,
  expand,
}: {
  title: string;
  hint: string | undefined;
  actions: ReactNode;
  expand: CardHeaderProps["expand"] | undefined;
}) {
  if (hint === undefined && actions === undefined && expand === undefined) return null;
  return (
    <div className={styles["end"]}>
      <Cluster space="2xs" wrap="no">
        {hint === undefined ? null : <span className={["meta", "truncate", styles["hint"]].join(" ")}>{hint}</span>}
        {actions}
        {expand === undefined ? null : (
          <IconButton
            icon={expand.open ? "shrink" : "expand"}
            label={expand.open ? `Close ${title}` : `Expand ${title}`}
            emphasis="plain"
            size={expand.small === true ? "xs" : "s"}
            expanded={expand.open}
            onClick={(event) => {
              expand.onToggle(event.currentTarget);
            }}
          />
        )}
      </Cluster>
    </div>
  );
}

// The header's words, after the mark a card wears before them.
function Mark({ lead, children }: { lead: ReactNode; children: ReactNode }) {
  if (lead === undefined) return children;
  return (
    <Cluster space="xs" wrap="no">
      <div className={styles["mark"]}>{lead}</div>
      {children}
    </Cluster>
  );
}

function Header({ title, icon, kicker, state, level = 3, size, expand, hint, actions, meta, lead }: CardHeaderProps) {
  const Heading = HEADINGS[level];
  const titleId = use(TitleContext);
  return (
    <div className={styles["header"]}>
      {/* A kicker makes the left stack two lines tall: what stands at the end lines up with the title's, the lower one. */}
      <Cluster justify="between" align={kicker === undefined ? "center" : "end"} space="xs" wrap="no">
        <Mark lead={lead}>
          <Stack space="3xs">
            {kicker === undefined ? null : (
              <Cluster space="2xs" wrap="no">
                {icon === undefined ? null : <Icon name={icon} />}
                <Kicker>{kicker}</Kicker>
              </Cluster>
            )}
            {/* With no kicker, the type's icon leads the title on its row, muted: a card known at a glance (Alexis, 2026-11-10). */}
            <Cluster space="2xs" wrap="no">
              {icon === undefined || kicker !== undefined ? null : (
                <span className={styles["lead"]}>
                  <Icon name={icon} />
                </span>
              )}
              <Heading id={titleId} className={styles["title"]} data-size={size}>
                {title}
              </Heading>
            </Cluster>
          </Stack>
        </Mark>
        {meta === undefined ? null : <span className={[styles["meta"], "meta", "truncate"].join(" ")}>{meta}</span>}
        {state === undefined ? null : <Chip>{state}</Chip>}
        <End title={title} hint={hint} actions={actions} expand={expand} />
      </Cluster>
    </div>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <Stack space="xs">{children}</Stack>;
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className={styles["actions"]}>
      <Cluster as="footer" space="2xs">
        {children}
      </Cluster>
    </div>
  );
}

Card.Header = Header;
Card.Body = Body;
Card.Actions = Actions;
