// The passport's quests (slice 8; no frame: built from the design system, Alexis's answer 2): a card each, its steps in order, each a row
// that leads to its world, done or not; the call that ends it waits for slice 9 and says so in place (answer 6, "needs a wallet, soon").
import { Card, ComingSoon, Grid, Icon, Kicker, Progress, Row, Stack } from "@gnoworld/ui";
import { useApp } from "../../storeContext.tsx";
import { questsOf, type QuestView, type StepView } from "./progress.ts";

function Step({ step }: { step: StepView }) {
  if (step.kind === "call")
    return (
      <ComingSoon name={step.title}>
        <Icon name="seal" />
        {` ${step.title} · needs a wallet, soon`}
      </ComingSoon>
    );
  return (
    <Row
      title={step.title}
      {...(step.done ? { subtitle: "Done" } : {})}
      lead={<Icon name={step.done ? "check" : step.kind === "talk" ? "chat" : "planet"} />}
      {...(step.path === undefined ? {} : { href: step.path })}
    />
  );
}

function Quest({ quest }: { quest: QuestView }) {
  const done = quest.steps.filter((step) => step.done).length;
  return (
    <Card compact>
      <Card.Header title={quest.title} kicker={`Quest · ${quest.reward}`} level={4} />
      <Card.Body>
        <Stack space="xs">
          <p>{quest.description}</p>
          <Progress
            label={`${quest.title}, steps done`}
            value={done}
            max={quest.steps.length}
            kind="steps"
            shown={`${String(done)}/${String(quest.steps.length)}`}
          />
          <div>
            {quest.steps.map((step) => (
              <Step key={step.id} step={step} />
            ))}
          </div>
        </Stack>
      </Card.Body>
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
      <Kicker>Quests · rewards stay on this device</Kicker>
      <Grid min="m">
        {quests.map((quest) => (
          <Quest key={quest.id} quest={quest} />
        ))}
      </Grid>
    </Stack>
  );
}
