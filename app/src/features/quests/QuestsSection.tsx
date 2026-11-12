// The passport's quests: a card each in a row, its badge, its steps in order with the app's icons and the next one lit, one button at its foot
// that leads to the next step's world; the call that ends a quest is tried in the realm's own page.
import { Badge, Button, Card, Cluster, Grid, Icon, Kicker, Stack, type BadgeProps, type IconName } from "@gnoworld/ui";
import { useApp } from "../../storeContext.tsx";
import styles from "./Quests.module.css";
import { questsOf, type QuestView, type StepView } from "./progress.ts";

// What a quest's badge wears: the icon of its theme and a tone, by the quest's id; the data file names neither.
const ICONS: Readonly<Record<string, IconName>> = { named: "at", player: "play", town: "chat" };
const TONES: readonly BadgeProps["tone"][] = ["mine", "signal", "danger"];

const STEP_ICONS: Readonly<Record<StepView["kind"], IconName>> = { visit: "arrow", talk: "chat", call: "key" };

function Step({ step, next }: { step: StepView; next: boolean }) {
  return (
    <li className={styles["step"]} data-state={step.done ? "done" : next ? "next" : undefined}>
      <Icon name={step.done ? "check" : STEP_ICONS[step.kind]} size="s" />
      <span>{step.title}</span>
    </li>
  );
}

function Quest({ quest, tone }: { quest: QuestView; tone: BadgeProps["tone"] }) {
  const done = quest.steps.filter((step) => step.done).length;
  const next = quest.steps.find((step) => !step.done);
  const of = `${String(done)}/${String(quest.steps.length)}`;
  return (
    <Card compact>
      <Card.Header
        title={quest.title}
        level={4}
        kicker={`Badge “${quest.reward}” · ${String(done)} of ${String(quest.steps.length)}`}
        lead={
          <Badge
            name={quest.reward}
            icon={ICONS[quest.id] ?? "star"}
            tone={tone}
            earned={next === undefined}
            count={of}
          />
        }
      />
      <Card.Body>
        <Stack as="ul" space="3xs">
          {quest.steps.map((step) => (
            <Step key={step.id} step={step} next={step === next} />
          ))}
        </Stack>
      </Card.Body>
      <Card.Actions>
        {next === undefined ? (
          <Button disabled>Done</Button>
        ) : next.path === undefined ? (
          <Button disabled>Go</Button>
        ) : (
          <Button href={next.path}>{next.kind === "call" ? "Try it" : "Go"}</Button>
        )}
      </Card.Actions>
    </Card>
  );
}

/** The quests of the universe the passport counts; nothing where it has none. */
export function QuestsSection({ universe }: { readonly universe: string }) {
  const progress = useApp(({ device }) => device.quests);
  const quests = questsOf(universe, progress);
  if (quests.length === 0) return null;
  return (
    <Stack as="section" space="s">
      <Cluster justify="between" space="xs">
        <Kicker>Quests</Kicker>
        <Kicker>The badge is kept on this device</Kicker>
      </Cluster>
      <Grid min="m">
        {quests.map((quest, at) => (
          <Quest key={quest.id} quest={quest} tone={TONES[at % TONES.length] ?? "mine"} />
        ))}
      </Grid>
    </Stack>
  );
}
