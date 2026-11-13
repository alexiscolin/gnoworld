// The palette's results: groups of rows, each a place's picture, its name with the letters the query matched, and its marks.
import { Avatar, Chip, Cluster, Icon, PlanetThumb } from "@gnoworld/ui";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import { afterDwell } from "../../intent.ts";
import { warmWorld } from "../universe/index.ts";
import styles from "./SearchDialog.module.css";
import type { SearchItem, SearchResult } from "./types.ts";

/** A place's thumb: its world's planet where it has a world, ui's disc where it has none; a room's `#`, a person's face. */
export function PlaceThumb({ item, size }: { item: SearchItem; size: "s" | "l" }) {
  if (item.kind === "room") return <Icon name="hash" />;
  if (item.kind === "person") return <Avatar address={item.nick ?? ""} name={item.name} size={size} decorative />;
  return item.world === undefined ? (
    <PlanetThumb src="" name={item.name} size={size} decorative />
  ) : (
    <WorldPlanet world={item.world} fallback="" name={item.name} size={size} decorative />
  );
}

// The query's words with the letters it matched marked; a letter's place in the name is its key.
function Marked({ text, hits }: { text: string; hits: readonly number[] }) {
  const at = new Set(hits);
  return (
    <>
      {Array.from(text, (letter, place) =>
        at.has(place) ? <mark key={`${letter}${String(place)}`}>{letter}</mark> : letter,
      )}
    </>
  );
}

function Marks({ item }: { item: SearchItem }) {
  return (
    <span className={styles["meta"]}>
      <Cluster space="2xs">
        {item.tag === undefined ? null : <span className={styles["tag"]}>{item.tag}</span>}
        {item.fresh === true ? <span className={styles["tag"]}>New</span> : null}
        {(item.here ?? 0) === 0 ? null : <span className={styles["here"]}>{item.here} here</span>}
        {item.visited === true ? <Icon name="check" /> : null}
        {item.message === true ? <Chip>Message</Chip> : null}
      </Cluster>
    </span>
  );
}

function Row({
  result,
  id,
  active,
  onChoose,
  onHover,
}: {
  result: SearchResult;
  id: string;
  active: boolean;
  onChoose: () => void;
  onHover: () => void;
}) {
  const { item } = result;
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      className={styles["row"]}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onMouseMove={onHover}
      onMouseEnter={(event) => {
        const { world } = item;
        if (world !== undefined)
          afterDwell(event.currentTarget, () => {
            warmWorld(world);
          });
      }}
      onClick={onChoose}
    >
      <PlaceThumb item={item} size="s" />
      <span className={styles["words"]}>
        <span className={["truncate", styles["name"]].join(" ")}>
          <Marked text={item.name} hits={result.hits} />
        </span>
        <span className="truncate meta">{result.note ?? item.description ?? ""}</span>
      </span>
      <Marks item={item} />
    </div>
  );
}

export interface Group {
  id: string;
  label: string;
  results: SearchResult[];
}

export const LIST_ID = "search-results";

/** The groups' rows, numbered through all of them: `active` is the number of the chosen one. */
export function PlaceResults({
  groups,
  active,
  more,
  onChoose,
  onHover,
}: {
  groups: Group[];
  active: number;
  /** How many more answered than the list draws. */
  more: number;
  onChoose: (item: SearchItem) => void;
  onHover?: (at: number) => void;
}) {
  // A group's first row is the number of the rows before it.
  const firsts = groups.map((_, n) => groups.slice(0, n).reduce((sum, each) => sum + each.results.length, 0));
  return (
    <div id={LIST_ID} role="listbox" aria-label="Places" tabIndex={0} className={styles["listbox"]}>
      {groups.map((group, g) => (
        <div key={group.id} role="group" aria-label={group.label === "" ? "Results" : group.label}>
          {group.label === "" ? null : (
            <div className={["label", styles["group"]].join(" ")}>
              {group.label} · {group.results.length}
            </div>
          )}
          {group.results.map((result, r) => {
            const own = (firsts[g] ?? 0) + r;
            return (
              <Row
                key={`${result.item.kind}:${result.item.path}:${result.note ?? ""}`}
                result={result}
                id={`${LIST_ID}-${String(own)}`}
                active={own === active}
                onChoose={() => {
                  onChoose(result.item);
                }}
                onHover={() => {
                  onHover?.(own);
                }}
              />
            );
          })}
        </div>
      ))}
      {more > 0 ? (
        <p className={["meta", styles["more"]].join(" ")}>{`${String(more)} more · refine the words or the chips`}</p>
      ) : null}
    </div>
  );
}
