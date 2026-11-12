// A person's card, opened from their name on a line (the video's frame 76), built as the passport is: their face, name and the country they
// declare, what the reader can do with them in one row of buttons, and for an account what the server knows (PersonBody). Not drawn: the
// video's help count, roles and "Fly to", which have no source yet.
import { Avatar, Button, Cluster, Dialog, IconButton, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import { canCopy, copyAddress } from "../../lib/copy.ts";
import { site } from "../../places.ts";
import { useShownName } from "../names/index.ts";
import { countryName } from "./Country.tsx";
import { asksFull } from "./full.ts";
import { dmParams, isAccount, shortAddress } from "./names.ts";
import { PersonBody } from "./PersonBody.tsx";
import styles from "./PersonCard.module.css";

const FollowButton = lazy(async () => ({ default: (await import("../follow/index.ts")).FollowButton }));

export interface PersonCardProps {
  /** The account's address, or a guest's nick. */
  name: string;
  guest: boolean;
  country: string | undefined;
  /** The reader's account: none for a guest, who can only read the card. */
  me: string | undefined;
  /** Whether the name is a Tab stop: not on a chat line, whose Tab goes to its bar of actions. */
  tabbable?: boolean;
  /** What opens the card: the name as the line draws it. */
  children?: ReactNode;
  /** Drawn as a round icon button of this size in place of the name: a list's Profile, beside Follow. */
  asIcon?: "s" | "m" | undefined;
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

// The account's address, one press to copy it whole; the press says what came of it for a moment. With no clipboard there is nothing to press.
function CopyAddress({ address }: { address: string }) {
  const [said, setSaid] = useState<string>();
  useEffect(() => {
    if (said === undefined) return;
    const timer = setTimeout(() => {
      setSaid(undefined);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [said]);
  if (!canCopy()) return null;
  return (
    <Button
      size="s"
      description="Copy the address"
      onClick={() => {
        copyAddress(address).then(setSaid, reportError);
      }}
    >
      {said ?? "Copy address"}
    </Button>
  );
}

interface ShellProps {
  title: string;
  kicker: string;
  name: string;
  open: boolean;
  onClose: () => void;
  /** The reader's account, when the card is of another account they can talk to. */
  other: boolean;
  account: boolean;
}

// The card as a window over the place, as the passport is: their face, name and where they are; under the name one row, an account's whole
// address at its start and the buttons at its end, Copy last; and for an account what the server knows, asked once it is first opened.
function Shell({ title, kicker, name, open, onClose, other, account }: ShellProps) {
  return (
    <Dialog
      title={title}
      kicker={kicker}
      wide
      open={open}
      onClose={onClose}
      lead={<Avatar address={name} name={name} size="l" decorative />}
    >
      <Stack space="m">
        <Cluster justify="between" space="xs">
          {account ? <span className={styles["address"]}>{name}</span> : null}
          <Cluster space="2xs">
            {other ? <MessageButton partner={name} /> : null}
            {other ? (
              <Suspense fallback={null}>
                <FollowButton kind="people" id={name} size="s" />
              </Suspense>
            ) : null}
            {account ? <CopyAddress address={name} /> : null}
          </Cluster>
        </Cluster>
        {/* Kept from the first opening on: dropped at the close, the window shrank to its head while it faded out. */}
        {account ? <PersonBody address={name} /> : null}
      </Stack>
    </Dialog>
  );
}

// An account's name as its readers know it (a registered name, else its address short) heads the card.
function AccountCard(props: Omit<ShellProps, "title" | "account">) {
  const title = useShownName(props.name, site.universeAt(useLocation().pathname).id);
  return <Shell {...props} account title={title} />;
}

// What opens the card: the name, bare, or a round button with the passport's icon, its name in its tooltip.
function Trigger({
  asIcon,
  name,
  tabbable,
  press,
  children,
}: Pick<PersonCardProps, "asIcon" | "children" | "name"> & { tabbable: boolean; press: () => void }) {
  return asIcon === undefined ? (
    <button
      type="button"
      className="bare"
      aria-haspopup="dialog"
      {...(tabbable ? {} : { tabIndex: -1 })}
      onClick={press}
    >
      {children}
    </button>
  ) : (
    <IconButton
      icon="passport"
      size={asIcon}
      label={`Profile of ${isAccount(name) ? shortAddress(name) : name}`}
      onClick={press}
    />
  );
}

export function PersonCard({ name, guest, country, me, tabbable = false, children, asIcon }: PersonCardProps) {
  const account = !guest && isAccount(name);
  const [open, setOpen] = useState(false);
  // Drawn from the first press on and kept, so the window closes as it opened; a line that was never pressed draws none.
  const [pressed, setPressed] = useState(false);
  const where = countryName(country);
  const shell = {
    name,
    open,
    onClose: () => {
      setOpen(false);
    },
    other: account && me !== undefined && name !== me,
  };
  const press = () => {
    setPressed(true);
    setOpen(true);
  };
  return (
    <>
      <Trigger asIcon={asIcon} name={name} tabbable={tabbable} press={press}>
        {children}
      </Trigger>
      {!pressed ? null : account ? (
        <AccountCard {...shell} kicker={where === undefined ? "Account" : `Account \u00b7 ${where}`} />
      ) : (
        <Shell
          {...shell}
          account={false}
          title={name}
          kicker={[where, guest ? "Guest" : undefined].filter(Boolean).join(" · ")}
        />
      )}
    </>
  );
}
