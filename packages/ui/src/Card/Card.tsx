import { createContext, use, useId, type ReactNode } from "react";
import { Chip } from "../Chip/Chip.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Kicker } from "../Kicker/Kicker.tsx";
import styles from "./Card.module.css";

// The id of a card's title, which its header gives the heading and the card is named by.
const TitleContext = createContext<string | undefined>(undefined);

export interface CardProps {
  /** Neutral unless asked; signal is the assistant's violet. */
  tone?: "neutral" | "signal";
  dashed?: boolean;
  compact?: boolean;
  children: ReactNode;
}

/** A card: an article named by its header's title, with its body and actions. Layout only: what it
 * holds (a poll, a call, a seal) is an assembly in its feature. */
export function Card({ tone = "neutral", dashed = false, compact = false, children }: CardProps) {
  const titleId = useId();
  return (
    <article
      className={styles["card"]}
      aria-labelledby={titleId}
      data-tone={tone}
      data-edge={dashed ? "dashed" : "solid"}
      data-density={compact ? "compact" : "comfortable"}
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
}

function Header({ title, icon, kicker, state }: CardHeaderProps) {
  const titleId = use(TitleContext);
  return (
    <Cluster justify="between" space="xs">
      <Stack space="3xs">
        {kicker === undefined && icon === undefined ? null : (
          <Cluster space="2xs">
            {icon === undefined ? null : <Icon name={icon} />}
            {kicker === undefined ? null : <Kicker>{kicker}</Kicker>}
          </Cluster>
        )}
        <h3 id={titleId} className={styles["title"]}>
          {title}
        </h3>
      </Stack>
      {state === undefined ? null : <Chip>{state}</Chip>}
    </Cluster>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <Stack space="xs">{children}</Stack>;
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <Cluster as="footer" space="2xs">
      {children}
    </Cluster>
  );
}

Card.Header = Header;
Card.Body = Body;
Card.Actions = Actions;
