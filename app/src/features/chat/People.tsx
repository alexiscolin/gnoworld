// Who is here, in the info panel (4b; 5q's nebula and country): counted once connected, the bot left out, the first
// MEMBERS_SHOWN named.
import { Avatar, Button, Cluster } from "@gnoworld/ui";
import { CountryTag, type Country } from "./LineHead.tsx";
import { BOT, isAccount, shortAddress } from "./names.ts";
import { Person } from "./Person.tsx";
import shared from "./lists.module.css";
import styles from "./People.module.css";

/** The people a room lists by name; the others are counted. */
export const MEMBERS_SHOWN = 100;

/** Who is here: counted once connected, the bot left out, the first MEMBERS_SHOWN named. */
export interface PeopleProps {
  members: readonly string[];
  connected: boolean;
  /** The reader's address, and how it opens a direct message with another account: each offered beside it. */
  me: string | undefined;
  onMessage: ((partner: string) => void) | undefined;
  /** Where each member comes from, by nick, for those who opted in: none draws no tag. */
  countries?: Readonly<Record<string, Country>> | undefined;
}

export function People({ members, connected, me, onMessage, countries }: PeopleProps) {
  const people = members.filter((nick) => nick !== BOT);
  return (
    <section aria-label="Who's here">
      <h3 className={styles["count"]}>{connected ? `${String(people.length)} here` : "Who's here"}</h3>
      <ul className={shared["plain"]}>
        {people.slice(0, MEMBERS_SHOWN).map((nick) => {
          const account = isAccount(nick);
          // A nick is any string Ergo allows, `constructor` too: read as the member's own key alone.
          const country = countries !== undefined && Object.hasOwn(countries, nick) ? countries[nick] : undefined;
          return (
            <li key={nick}>
              {/* The face and the name at the start, the country or the Message at the end: one column whatever the name's width (U18). */}
              <Cluster space="3xs" justify="between">
                <Cluster space="2xs">
                  <Avatar address={nick} name={nick} decorative />
                  <Person name={nick} guest={!account} account={account} />
                </Cluster>
                {country === undefined ? null : (
                  <span className={styles["where"]}>
                    <CountryTag country={country} />
                    {country.name}
                  </span>
                )}
                {onMessage !== undefined && account && me !== undefined && nick !== me ? (
                  // A visible word, not an icon alone (decision D); the address for a screen reader's list.
                  <Button
                    icon="chat"
                    size="s"
                    emphasis="quiet"
                    onClick={() => {
                      onMessage(nick);
                    }}
                  >
                    Message<span className="visually-hidden"> {shortAddress(nick)}</span>
                  </Button>
                ) : null}
              </Cluster>
            </li>
          );
        })}
      </ul>
      {people.length > MEMBERS_SHOWN ? <p>and {String(people.length - MEMBERS_SHOWN)} more</p> : null}
    </section>
  );
}
