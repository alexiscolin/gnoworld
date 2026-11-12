// A token realm's holders and supply (slice 13): what the server replayed from grc20's own events, drawn only when it holds something. Holders,
// supply and today's transfers, the top holders by share, and a chart of transfers a day only when three days of the window hold one, else the
// last transfer in words. A token whose events could not be trusted says its holders are unknown. Every text is the answer's, checked.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { TokenAnswer } from "@gnoworld/schemas/indexer";
import { Card, Cell, DayChart, Figures, Progress, Sidebar, Stack, type Figure } from "@gnoworld/ui";
import { PersonLink } from "../../features/chat/index.ts";
import { ErrorView, useWhere } from "../../features/errors/index.ts";
import { amountText, plain, short } from "../../lib/chainText.ts";
import { utcDay } from "../../lib/days.ts";
import { isUnread, queryClient } from "../../lib/query/client.ts";
import { tokenOptions } from "./tokenQuery.ts";

type Token = TokenAnswer["tokens"][number];

const DAY_MS = 86_400_000;
const WINDOW = 30;
/** Days with a transfer the window must hold before a chart is drawn: a flat line says nothing. */
const CHART_FROM = 3;

// A holder's share of the supply in tenths of a percent, at most 1000.
const shareOf = (amount: string, supply: string): number =>
  BigInt(supply) === 0n ? 0 : Number((BigInt(amount) * 1000n) / BigInt(supply));

// The window's days oldest first, the last one `today`, each with its transfers: none counted as zero.
function windowOf(days: Token["days"], today: string): { day: string; transfers: number }[] {
  const held = new Map(days.map(({ day, transfers }) => [day, transfers]));
  return Array.from({ length: WINDOW }, (_, back) => {
    const day = new Date(Date.parse(today) - (WINDOW - 1 - back) * DAY_MS).toISOString().slice(0, 10);
    return { day, transfers: held.get(day) ?? 0 };
  });
}

const dayWord = (day: string): string => utcDay(new Date(`${day}T12:00:00Z`), new Date());

function figuresOf(token: Token, today: number): Figure[] {
  const { holders, supply, last, decimals } = token;
  const sub = last === null ? "none yet" : `last on ${dayWord(last.day)}`;
  return [
    ...(holders === null ? [] : [{ key: "holders", label: "Holders", value: holders, sub: "with a balance" }]),
    ...(supply === null
      ? []
      : [{ key: "supply", label: "Supply", value: amountText(supply, decimals), sub: "minted less burned" }]),
    { key: "today", label: "Transfers today", value: today, sub },
  ];
}

function Holders({ token }: { token: Token }) {
  const { top, supply, decimals, holders } = token;
  if (top.length === 0 || supply === null) return null;
  return (
    <Card look="hub" fixed rises>
      <Card.Header title={`${plain(token.symbol)} holders`} level={2} hint={`top ${String(top.length)}`} />
      <Card.Body>
        <Stack as="ul" space="s">
          {top.map(({ address, amount }) => {
            const share = shareOf(amount, supply);
            return (
              <li key={address}>
                <Stack space="2xs">
                  <Sidebar side="end" space="s">
                    <PersonLink address={address}>
                      <Stack space="3xs">
                        <span>{short(address)}</span>
                        <span className="meta">{`${(share / 10).toFixed(1)}% of supply`}</span>
                      </Stack>
                    </PersonLink>
                    <span>{amountText(amount, decimals)}</span>
                  </Sidebar>
                  <Progress label={`${short(address)}'s share of the supply`} value={share} max={1000} />
                </Stack>
              </li>
            );
          })}
        </Stack>
        {holders !== null && holders > top.length ? (
          <p className="meta">{`+ ${String(holders - top.length)} more holders`}</p>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function Transfers({ token, today }: { token: Token; today: string }) {
  const window = windowOf(token.days, today);
  if (window.filter(({ transfers }) => transfers > 0).length >= CHART_FROM)
    return (
      <Card look="hub" fixed rises>
        <Card.Header title="Transfers per day" level={2} hint="last 30 days" />
        <Card.Body>
          <DayChart
            label="Transfers per day"
            values={window.map(({ transfers }) => transfers)}
            labels={window.map(({ day }) => dayWord(day))}
            noun={["transfer", "transfers"]}
          />
        </Card.Body>
      </Card>
    );
  return token.last === null ? null : (
    <p className="meta">{`Last transfer ${dayWord(token.last.day)}, block ${String(token.last.height)}.`}</p>
  );
}

function OneToken({ token, today }: { token: Token; today: string }) {
  const name = plain(token.name);
  const todays = token.days.find(({ day }) => day === today)?.transfers ?? 0;
  return (
    <Stack space="s">
      <Figures label={`${plain(token.symbol)}, ${name}`} figures={figuresOf(token, todays)} />
      {token.ambiguous ? (
        <p className="meta">Holders unknown: this token's events could not be trusted.</p>
      ) : (
        <Holders token={token} />
      )}
      {token.ambiguous ? null : <Transfers token={token} today={today} />}
    </Stack>
  );
}

/** The realm's tokens, or nothing while they load and for a realm the server knows none of; a failed read says so in a line. */
export function TokenBlock({ realm }: { realm: string }) {
  const read = useQuery(tokenOptions(realm), queryClient);
  const where = useWhere();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  if (read.isError) {
    const missing = isUnread<{ ok: false; reason: string }>(read.error) && read.error.read.reason === "not_found";
    return missing ? null : (
      <Cell span={12}>
        <ErrorView
          kind="unavailable"
          size="inline"
          where={where}
          onRetry={() => {
            read.refetch().catch(reportError);
          }}
        />
      </Cell>
    );
  }
  if (read.data === undefined) return null;
  return (
    <Cell span={12}>
      <Stack space="s">
        {read.data.tokens.map((token, at) => (
          <OneToken key={`${token.symbol}.${String(at)}`} token={token} today={today} />
        ))}
        <p className="meta">{`Replayed from the chain's token events, as of block ${String(read.data.height)}.`}</p>
      </Stack>
    </Cell>
  );
}
