// Settings, Accounts (owners' moderation, part 5; the approved proposal's "The screens"): the addresses of the identity of the account logged in,
// each with the way it was proven and the day it was linked, Unlink on each (its own asks first), and the button that opens the dialog. A person with no link
// sees their own address and the button. The list is the person's alone: it is the server's answer for this session.
import { shortAddress, type Address } from "@gnoworld/schemas";
import { Avatar, Button, Chip, Cluster, Row, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useState } from "react";
import { PersonLink } from "../chat/index.ts";
import { useDeviceView } from "../../deviceViews.ts";
import { pageLinksApi } from "../../lib/api/links.ts";
import { readLinks } from "../../lib/links/held.ts";
import { useLinks, useLinksFailed } from "../../useLinks.ts";
import universes from "../../../data/universes.json" with { type: "json" };
import { AskUnlink } from "./AskUnlink.tsx";
import { linkedOn, linkProblem } from "./linkWords.ts";
import { Section } from "./Section.tsx";
import { useSignInAgain } from "./useSignInAgain.ts";

const LinkDialog = lazy(async () => ({ default: (await import("./LinkDialog.tsx")).LinkDialog }));

const WAYS = { adena: "Adena", cli: "Command line" } as const;

interface Row {
  address: Address;
  kind: "adena" | "cli";
  linkedAt: number | undefined;
}

// The identity's addresses, one row each: its face, its address, when it was linked, its way, and Main or Unlink.
function Members({
  account,
  rows,
  linked,
  busy,
  onUnlink,
}: {
  account: Address;
  rows: readonly Row[];
  linked: boolean;
  busy: boolean;
  onUnlink: (address: Address) => void;
}) {
  return (
    <Stack as="ul" space="xs">
      {rows.map(({ address, kind, linkedAt }) => (
        <li key={address}>
          <Row
            look="boxed"
            title={shortAddress(address)}
            subtitle={
              address === account ? "Logged in now" : `Linked ${linkedAt === undefined ? "" : linkedOn(linkedAt)}`
            }
            lead={
              <PersonLink address={address}>
                <Avatar address={address} name={shortAddress(address)} decorative />
              </PersonLink>
            }
            trail={
              <>
                <Chip>{WAYS[kind]}</Chip>
                {address === account ? <Chip tone="mine">Main</Chip> : null}
                {linked ? (
                  <Button
                    size="s"
                    emphasis="quiet"
                    disabled={busy}
                    description={`Unlink ${address}`}
                    onClick={() => {
                      onUnlink(address);
                    }}
                  >
                    Unlink
                  </Button>
                ) : null}
              </>
            }
          />
        </li>
      ))}
    </Stack>
  );
}

// The worlds the identity owns, zero said as plainly as any other count.
const chain = universes.find((each) => each.default === true);

// The chain a world's owner is read on is the default universe's: said by its name.
function OwnerNote({ worlds }: { worlds: readonly string[] }) {
  return (
    <p className="meta">
      Owner of {worlds.length} {worlds.length === 1 ? "world" : "worlds"} on {chain?.name ?? "the chain"}
      {worlds.length === 0 ? "" : `: ${worlds.join(", ")}`}. You moderate their rooms from any account above.
    </p>
  );
}

// Link an account, and free a command-line key (which needs no account: D13940).
function Buttons({ onLink }: { onLink: () => void }) {
  const [, open] = useDeviceView();
  return (
    <Cluster space="xs">
      <Button emphasis="solid" onClick={onLink}>
        Link an account
      </Button>
      <Button
        emphasis="quiet"
        onClick={() => {
          open("release");
        }}
      >
        Release a command-line key
      </Button>
    </Cluster>
  );
}

// A list the server could not give: said, with the way to ask again; what was shown stays.
function Unread({ account }: { account: Address }) {
  return (
    <Cluster space="xs">
      <span role="status" className="meta">
        Could not read your accounts from the server.
      </span>
      <Button
        size="s"
        onClick={() => {
          readLinks(account).catch(reportError);
        }}
      >
        Try again
      </Button>
    </Cluster>
  );
}

export function AccountsSection({ account }: { account: Address }) {
  const list = useLinks(account);
  const failed = useLinksFailed(account);
  const [linking, setLinking] = useState(false);
  const [said, setSaid] = useState("");
  const [running, setRunning] = useState(false);
  const [undoing, setUndoing] = useState<Address | undefined>(undefined);
  const members = list?.members ?? [];
  const rows = members.length === 0 ? [{ address: account, kind: "adena" as const, linkedAt: undefined }] : members;

  async function unlink(address: Address): Promise<void> {
    setSaid("");
    setRunning(true);
    const done = await pageLinksApi().unlink(address);
    setRunning(false);
    if (done.ok) await readLinks(account);
    else setSaid(linkProblem(done.reason));
    setUndoing(done.ok || done.reason !== "unauthenticated" ? undefined : address);
  }
  const [asking, setAsking] = useState<Address | undefined>(undefined);
  const again = useSignInAgain(() => {
    if (undoing !== undefined) unlink(undoing).catch(reportError);
  });

  return (
    <Section id="settings-accounts" title="Accounts" aside="Only you see this list">
      <Members account={account} rows={rows} linked={members.length > 0} busy={running} onUnlink={setAsking} />
      <Buttons
        onLink={() => {
          setLinking(true);
        }}
      />
      {list === undefined ? null : <OwnerNote worlds={list.worlds} />}
      {failed ? <Unread account={account} /> : null}
      <p role="status" className="meta">
        {said}
      </p>
      {undoing === undefined ? null : (
        <Button size="s" onClick={again.ask} disabled={again.waiting}>
          Sign in again to confirm
        </Button>
      )}
      {asking === undefined ? null : (
        <AskUnlink
          address={asking}
          own={asking === account}
          close={(go) => {
            setAsking(undefined);
            if (go) {
              setUndoing(asking);
              unlink(asking).catch(reportError);
            }
          }}
        />
      )}
      {linking ? (
        <Suspense fallback={null}>
          <LinkDialog
            me={account}
            onLinked={() => {
              readLinks(account).catch(reportError);
            }}
            onClose={() => {
              setLinking(false);
            }}
          />
        </Suspense>
      ) : null}
    </Section>
  );
}
