// Who is here, in the info panel (4b; 5q's nebula and country): counted once connected, the bot left out, the first
// MEMBERS_SHOWN named.
import { Avatar, Cluster } from "@gnoworld/ui";
import { CountryTag, type Country } from "./LineHead.tsx";
import { BOT, isAccount } from "./names.ts";
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

// A person: their nebula and their name, what `said` adds before it for a screen reader alone.
function Who({ nick, account, said }: { nick: string; account: boolean; said?: string }) {
  return (
    <Cluster space="2xs">
      <Avatar address={nick} name={nick} decorative />
      {said === undefined ? null : <span className="visually-hidden">{said}</span>}
      <Person name={nick} guest={!account} account={account} />
    </Cluster>
  );
}

export function People({ members, connected, me, onMessage, countries }: PeopleProps) {
  const people = members.filter((nick) => nick !== BOT);
  return (
    <section aria-label="Who's here">
      <h3 className="visually-hidden">{connected ? `${String(people.length)} here` : "Who's here"}</h3>
      <ul className={shared["plain"]}>
        {people.slice(0, MEMBERS_SHOWN).map((nick) => {
          const account = isAccount(nick);
          // A nick is any string Ergo allows, `constructor` too: read as the member's own key alone.
          const country = countries !== undefined && Object.hasOwn(countries, nick) ? countries[nick] : undefined;
          return (
            <li key={nick} className={styles["row"]}>
              {/* The face and the name at the start, the country at the end: one column whatever the name's width (U18). A
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
                {country === undefined ? null : (
                  <span className={styles["where"]}>
                    <CountryTag country={country} />
                    {country.name}
                  </span>
                )}
              </Cluster>
            </li>
          );
        })}
      </ul>
      {people.length > MEMBERS_SHOWN ? <p>and {String(people.length - MEMBERS_SHOWN)} more</p> : null}
    </section>
  );
}
