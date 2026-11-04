// The calendar (ADR-0002 §1, Events and calendar; DESIGN-SYSTEM: "an agenda of Rows by day, no calendar widget"): opened by the dock's
// quick action, the world's events first when it has some, every world's else. Each event says when in the reader's own time and where;
// "Remind me" keeps a reminder on this device, told while a page is open or at the next open (Alexis's answer 3). An event at a link
// leaves through the warning.
import { events } from "../../lateData.ts";
import { Button, Cluster, Dialog, EmptyState, IconButton, Row, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { useLocation } from "react-router";
import { FOLLOWS_KEPT } from "../../lib/keep/fields.ts";
import { useLeaving } from "../../leaving.tsx";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { agendaOf, isDated, isLive, type CalendarEvent } from "./agenda.ts";
import { placeOf, universeAt } from "./places.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// A day's heading in the reader's words: Today, Tomorrow, or the weekday and the date.
function dayLabel(day: number, now: number): string {
  const today = new Date(now);
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const away = Math.round((day - first) / DAY_MS);
  if (away === 0) return "Today";
  if (away === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(day);
}

const timeOf = (event: CalendarEvent) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(Date.parse(event.start));

// The reminder of `id` set, or taken off; whether the device kept it.
function useReminder(id: string): { set: boolean; toggle: () => void } {
  const store = useAppStore();
  const set = useApp(({ device }) => Object.hasOwn(device.reminders, id));
  return {
    set,
    toggle: () => {
      store.getState().deviceActions.change("reminders", (held) => {
        if (Object.hasOwn(held, id)) return Object.fromEntries(Object.entries(held).filter(([key]) => key !== id));
        return Object.keys(held).length >= FOLLOWS_KEPT ? held : { ...held, [id]: { fired: false } };
      });
    },
  };
}

function EventRow({ event, now, leave }: { event: CalendarEvent; now: number; leave: (href: string) => void }) {
  const universe = universeAt(useLocation().pathname);
  const place = event.world === undefined ? undefined : placeOf(universe, event.world);
  const reminder = useReminder(event.id);
  const live = isLive(event, now);
  // An event waiting for its date has no time to say, nor a reminder to ask.
  const dated = isDated(event);
  return (
    <Row
      look="divided"
      title={dated ? `${timeOf(event)} · ${event.title}` : event.title}
      subtitle={place?.name ?? "Online"}
      {...(live ? { activity: "Live now" } : {})}
      trail={
        <Cluster space="3xs">
          {live || !dated ? null : (
            <IconButton
              icon="bell"
              size="s"
              emphasis="plain"
              label={reminder.set ? `Reminder set: ${event.title}` : `Remind me: ${event.title}`}
              pressed={reminder.set}
              onClick={reminder.toggle}
            />
          )}
          {place === undefined ? (
            <IconButton
              icon="arrow-up-right"
              size="s"
              emphasis="plain"
              label={`Open ${event.title}`}
              onClick={() => {
                leave(event.link);
              }}
            />
          ) : (
            <Button href={place.href} size="s" emphasis="quiet" icon="arrow">
              Go there
            </Button>
          )}
        </Cluster>
      }
    />
  );
}

// The world's own events or every world's, for a world the data plans events in.
function Scope({
  name,
  everywhere,
  onEverywhere,
}: {
  name: string;
  everywhere: boolean;
  onEverywhere: (all: boolean) => void;
}) {
  return (
    <Cluster space="2xs">
      <Button
        size="s"
        emphasis={everywhere ? "outline" : "solid"}
        onClick={() => {
          onEverywhere(false);
        }}
      >
        {name}
      </Button>
      <Button
        size="s"
        emphasis={everywhere ? "solid" : "outline"}
        onClick={() => {
          onEverywhere(true);
        }}
      >
        Every world
      </Button>
    </Cluster>
  );
}

export function Calendar({ world, open, onClose }: { world: string; open: boolean; onClose: () => void }) {
  // The clock as the dialog opened: the agenda is read for that moment, and read again at the next opening.
  const [now] = useState(Date.now);
  const universe = universeAt(useLocation().pathname);
  const name = placeOf(universe, world)?.name;
  const hasOwn = events.some((event) => "world" in event && event.world === world);
  const [everywhere, setEverywhere] = useState(!hasOwn);
  const agenda = agendaOf(events, now, everywhere ? undefined : world);
  const leaving = useLeaving();
  const empty = agenda.days.length === 0 && agenda.undated.length === 0;
  return (
    <Dialog
      title="Calendar"
      description={
        everywhere || name === undefined
          ? "Coming up across the worlds, in your time"
          : `Coming up in ${name}, in your time`
      }
      open={open}
      onClose={onClose}
    >
      <Stack space="s">
        {hasOwn ? <Scope name={name ?? "This world"} everywhere={everywhere} onEverywhere={setEverywhere} /> : null}
        {empty ? <EmptyState title="Nothing planned" line="No event is planned yet." level={3} /> : null}
        {agenda.days.map(({ day, events: held }) => (
          <section key={day} aria-label={dayLabel(day, now)}>
            <h3 className="label">{dayLabel(day, now)}</h3>
            {held.map((event) => (
              <EventRow key={event.id} event={event} now={now} leave={leaving.ask} />
            ))}
          </section>
        ))}
        {agenda.undated.length === 0 ? null : (
          <section aria-label="Date to be confirmed">
            <h3 className="label">Date to be confirmed</h3>
            {agenda.undated.map((event) => (
              <EventRow key={event.id} event={event} now={now} leave={leaving.ask} />
            ))}
          </section>
        )}
      </Stack>
      {leaving.dialog}
    </Dialog>
  );
}
