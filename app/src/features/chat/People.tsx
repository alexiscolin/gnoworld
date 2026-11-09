// Who is here, in the info panel (4b; 5q's nebula): counted once connected, the bot left out, the first
// MEMBERS_SHOWN named.
import { Avatar, Cluster } from "@gnoworld/ui";
import { lazy, Suspense } from "react";
import { BOT, isAccount } from "./names.ts";
import type { Line } from "@gnoworld/core";
import { Country, countriesHere } from "./Country.tsx";
import { Person } from "./Person.tsx";
import shared from "./lists.module.css";
import styles from "./People.module.css";

// Follow comes in a chunk of its own, after the list: out of the late chat's budget.
const FollowButton = lazy(async () => ({ default: (await import("../follow/index.ts")).FollowButton }));

/** The people a room lists by name; the others are counted. */
export const MEMBERS_SHOWN = 100;

/** Who is here: counted once connected, the bot left out, the first MEMBERS_SHOWN named. */
export interface PeopleProps {
  members: readonly string[];
  connected: boolean;
  /** The reader's address, and how it opens a direct message with another account: each offered beside it. */
  me: string | undefined;
  onMessage: ((partner: string) => void) | undefined;
  /** Each account but the reader's may be followed, on this device (slice 8): where it is here, the labels say so. */
  canFollow?: boolean;
  /** The room's lines: the country each declared there, its code and name at the row's end. */
  lines?: readonly Line[] | undefined;
}

// A person: their nebula and their name, what `said` adds before it for a screen reader alone.
function Who({ nick, account, said }: { nick: string; account: boolean; said?: string }) {
  return (
    <Cluster space="2xs">
      {/* A guest has no address to draw a face from: its disc of night, ringed, keeps the names on one edge. */}
      <span className={account ? undefined : styles["guest"]}>
        <Avatar address={nick} name={nick} decorative />
      </span>
      {said === undefined ? null : <span className="visually-hidden">{said}</span>}
      <Person name={nick} guest={!account} account={account} />
    </Cluster>
  );
}

export function People({ members, connected, me, onMessage, canFollow = false, lines }: PeopleProps) {
  const people = members.filter((nick) => nick !== BOT);
  const countries = countriesHere(lines ?? [], people);
  return (
    <section aria-label="Who's here">
      <h3 className="visually-hidden">{connected ? `${String(people.length)} here` : "Who's here"}</h3>
      <ul className={shared["plain"]}>
        {people.slice(0, MEMBERS_SHOWN).map((nick) => {
          const account = isAccount(nick);
          return (
            <li key={nick} className={styles["row"]}>
              {/* The face and the name at the start: one column whatever the name's width (U18). A
                  person the reader may write to is one button, the whole of its face and name: it opens the conversation. */}
              <Cluster space="3xs" justify="between">
                {onMessage !== undefined && account && me !== undefined && nick !== me ? (
                  <button
                    type="button"
                    className={styles["person"]}
                    onClick={() => {
                      onMessage(nick);
                    }}
                  >
                    {/* A visible name, the word that says what it does for a screen reader's list. */}
                    <Who nick={nick} account={account} said="Message " />
                  </button>
                ) : (
                  <Who nick={nick} account={account} />
                )}
                <Cluster space="2xs">
                  <Country code={countries.get(nick)} />
                  {canFollow && account && nick !== me ? (
                    <Suspense fallback={null}>
                      <FollowButton kind="people" id={nick} size="m" />
                    </Suspense>
                  ) : null}
                </Cluster>
              </Cluster>
            </li>
          );
        })}
      </ul>
      {people.length > MEMBERS_SHOWN ? <p>and {String(people.length - MEMBERS_SHOWN)} more</p> : null}
    </section>
  );
}
