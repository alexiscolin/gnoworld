// The tools Jarvis is offered in /ask (ADR-0002 §5; 10f's wiring) and the run that sends each call the allowlist let
// through to its own runner: gnomcp's reads, a skill's text, a place, an answer's button, and gnoscope's reads when it
// is on. Only what reaches the person: give_digest and propose_action wait for 10k, where their cards have a place
// (Alexis, 10i-1, D170).
import type { Log } from "@gnoworld/service/log";
import { allowlist } from "./allowlist.ts";
import type { Gnomcp, Ran } from "./gnomcp.ts";
import { gnomcpTools, type Profiles } from "./gnomcpTools.ts";
import type { loadSkills } from "./skills.ts";
import type { cardTools } from "./tools/cards.ts";
import type { Asked } from "./tools/kept.ts";
import type { placesTool } from "./tools/places.ts";
import type { startGnoscope } from "./tools/gnoscope.ts";

interface Box {
  readonly profiles: Profiles;
  readonly gnomcp: Pick<Gnomcp, "call">;
  readonly skills: Pick<ReturnType<typeof loadSkills>, "tool" | "read">;
  readonly places: ReturnType<typeof placesTool>;
  readonly cards: ReturnType<typeof cardTools>;
  readonly gnoscope: Pick<Awaited<ReturnType<typeof startGnoscope>>, "definitions" | "call">;
  readonly log: Log;
}
// A call the allowlist let through, its arguments as its schema parsed them.
interface Call {
  readonly ok: true;
  readonly name: string;
  readonly args: unknown;
}
type Runner = (call: Call, asked: Asked) => Promise<Ran>;

const refused = (): Promise<Ran> => Promise.resolve({ ok: false, reason: "refused" });

/** The allowlist of /ask's tools, and the run of a call it let through, by its name; refused for a name none holds. */
export function toolbox(box: Box) {
  const reads = gnomcpTools(box.profiles);
  const button = box.cards.definitions.filter(({ name }) => name === "give_button");
  const tools = allowlist(
    [...reads, box.skills.tool, box.places.definition, ...button, ...box.gnoscope.definitions],
    box.log,
  );
  // Each told when its call's time is up or its asker left (D177, F5290).
  const read: Runner = (call, asked) => box.gnomcp.call(call.name, call.args, asked.signal);
  const scope: Runner = (call, asked) => box.gnoscope.call(call.name, call.args, asked.signal);
  const runners = new Map<string, Runner>([
    ...reads.map(({ name }) => [name, read] as const),
    [box.skills.tool.name, (call) => skill(box.skills, call.args)],
    [box.places.definition.name, (call) => box.places.run(call.args)],
    ...button.map(({ name }) => [name, (call: Call, asked: Asked) => box.cards.run(call, asked)] as const),
    ...box.gnoscope.definitions.map(({ name }) => [name, scope] as const),
  ]);
  return { allowlist: tools, run: (call: Call, asked: Asked) => runners.get(call.name)?.(call, asked) ?? refused() };
}

// A skill's text, its arguments parsed again by load_skill's own schema, as the cards parse theirs.
function skill(skills: Box["skills"], args: unknown): Promise<Ran> {
  const parsed = skills.tool.args.safeParse(args);
  if (!parsed.success) return refused();
  return Promise.resolve({ ok: true, isError: false, text: skills.read(parsed.data) });
}
