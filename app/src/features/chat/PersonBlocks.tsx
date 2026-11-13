// The cards of a person's tab panel, a chunk of its own (the chart is heavy): what their calls, system and tokens say, each part a card, an
// empty one saying so in one line.
import type { PersonCardData } from "@gnoworld/schemas/indexer";
import { ActivityChart, Card, Row, ShowMore, Stack } from "@gnoworld/ui";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { amountText, cut } from "../../lib/chainText.ts";
import { dayName } from "../../lib/days.ts";
import { discOf } from "../../lib/worldDisc.ts";
import { realmView, site } from "../../places.ts";
import { Note } from "../../TabRow.tsx";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import { dailyCalls, figureOf, middle, realmIn } from "./personData.ts";
import styles from "./PersonCard.module.css";
import shared from "./lists.module.css";

// A realm's path on a row, on one line: relative to the person's own namespace, cut in its middle.
const PATH = 34;
// The rows a list shows before its "Show N more".
const FIRST = 5;

export type PersonTab = "activity" | "worlds" | "tokens";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card compact>
      <Card.Header title={title} level={4} />
      <Card.Body>{children}</Card.Body>
    </Card>
  );
}

function Worlds({ system, address }: { system: PersonCardData["system"]; address: string }) {
  const universe = site.universeAt(useLocation().pathname);
  return (
    <Part title="Their system">
      {system.worlds.length === 0 ? (
        <Note>No realms deployed yet.</Note>
      ) : (
        <ul className={shared["plain"]}>
          {system.worlds.map(({ world, title, realm }) => (
            <li key={world}>
              <Row
                truncate
                lead={<WorldPlanet world={world} fallback={discOf(world)} name={title} size="s" decorative />}
                title={cut(title, 40)}
                subtitle={middle(realmIn(cut(realm, 128), address), PATH)}
                href={realmView(realm, universe)}
              />
            </li>
          ))}
        </ul>
      )}
      {system.more === 0 ? null : <Note>{`${String(system.more)} more`}</Note>}
    </Part>
  );
}

function Tokens({ tokens, address }: { tokens: PersonCardData["tokens"]; address: string }) {
  const universe = site.universeAt(useLocation().pathname);
  return (
    <Part title="Tokens held">
      {tokens.length === 0 ? (
        <Note>No tokens held.</Note>
      ) : (
        <ul className={shared["plain"]}>
          {tokens.map(({ realm, symbol, decimals, amount }) => (
            <li key={`${realm}.${symbol}`}>
              <Row
                truncate
                title={cut(symbol, 32)}
                subtitle={middle(realmIn(cut(realm, 128), address), PATH - 8)}
                href={realmView(realm, universe)}
                trail={
                  <span className={styles["amount"]} title={amountText(amount, decimals)}>
                    {figureOf(amount, decimals)}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Part>
  );
}

function Activity({ data, now }: { data: PersonCardData; now: number }) {
  const universe = site.universeAt(useLocation().pathname);
  const { calls } = data;
  const [all, setAll] = useState(false);
  const latest = all ? data.latest : data.latest.slice(0, FIRST);
  return (
    <Stack space="m">
      <Part title="Calls, last 30 days">
        {calls === null || calls.days.length === 0 ? (
          <Note>No calls to worlds yet.</Note>
        ) : (
          <ActivityChart
            label="Calls a day, last 30 days"
            values={dailyCalls(calls.days, now)}
            unit="day"
            figures={false}
          />
        )}
      </Part>
      <Part title="Latest calls">
        {data.latest.length === 0 ? (
          <Note>No calls yet.</Note>
        ) : (
          <ul className={shared["plain"]}>
            {latest.map(({ realm, func, success, time }) => (
              <li key={[realm, func, time].join()}>
                <Row
                  truncate
                  title={func === null ? "a call" : cut(func, 64)}
                  href={realmView(realm, universe)}
                  trail={
                    <span className="meta">
                      <span
                        className={styles["realm"]}
                      >{`${middle(realmIn(cut(realm, 128), ""), PATH - 14)} \u00b7 `}</span>
                      {time === null ? "" : dayName(new Date(time), new Date(now))}
                      {success ? null : <span className={styles["failed"]}> Failed</span>}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {all || data.latest.length <= FIRST ? null : (
          <div>
            <ShowMore
              count={data.latest.length - FIRST}
              onMore={() => {
                setAll(true);
              }}
            />
          </div>
        )}
      </Part>
    </Stack>
  );
}

/** The cards of `tab` for the account `address`. */
export default function PersonBlocks({
  tab,
  data,
  address,
  now,
}: {
  tab: PersonTab;
  data: PersonCardData;
  address: string;
  now: number;
}) {
  if (tab === "worlds") return <Worlds system={data.system} address={address} />;
  if (tab === "tokens") return <Tokens tokens={data.tokens} address={address} />;
  return <Activity data={data} now={now} />;
}
