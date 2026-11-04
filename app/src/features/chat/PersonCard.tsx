// A person's card, opened from their name on a line (the video's frame 76): their face and name, the country they declare, and
// what the reader can do with them, Message and Follow. Only what the page knows: the video's worlds stamped, help count, roles
// and "Fly to" have no source yet, and are not drawn.
import { Avatar, Button, Cluster, Popover, Stack } from "@gnoworld/ui";
import { lazy, Suspense, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { countryName } from "./Country.tsx";
import { asksFull } from "./full.ts";
import { dmParams, isAccount, shortAddress } from "./names.ts";
import styles from "./PersonCard.module.css";

const FollowButton = lazy(async () => ({ default: (await import("../follow/index.ts")).FollowButton }));

export interface PersonCardProps {
  /** The account's address, or a guest's nick. */
  name: string;
  guest: boolean;
  country: string | undefined;
  /** The reader's account: none for a guest, who can only read the card. */
  me: string | undefined;
  /** What opens the card: the name as the line draws it. */
  children: ReactNode;
}

// Message: the conversation with them, in the address, as Who's here opens it.
function MessageButton({ partner }: { partner: string }) {
  const [params, setParams] = useSearchParams();
  return (
    <Button
      size="s"
      onClick={() => {
        setParams(dmParams(partner, asksFull(params)));
      }}
    >
      Message
    </Button>
  );
}

export function PersonCard({ name, guest, country, me, children }: PersonCardProps) {
  const account = !guest && isAccount(name);
  const shown = account ? shortAddress(name) : name;
  const where = countryName(country);
  const other = account && me !== undefined && name !== me;
  return (
    // No Tab stop: a line's Tab goes to its bar of actions (messageMenu.spec.ts); the card is the pointer's.
    <Popover trigger={children} plain lazy tabbable={false} label={`${shown}'s card`}>
      <Stack space="s">
        <Cluster space="s">
          <Avatar address={name} name={name} size="l" decorative />
          <Stack space="3xs">
            <span className={styles["name"]} title={account ? name : undefined}>
              {shown}
            </span>
            <span className="label">{[where, guest ? "Guest" : undefined].filter(Boolean).join(" · ")}</span>
          </Stack>
        </Cluster>
        {other ? (
          <Cluster space="2xs">
            <MessageButton partner={name} />
            <Suspense fallback={null}>
              <FollowButton kind="people" id={name} size="m" />
            </Suspense>
          </Cluster>
        ) : null}
      </Stack>
    </Popover>
  );
}
