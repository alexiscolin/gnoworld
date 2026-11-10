// Around it (D566): the place in the middle, what it links to on one side and what links to it on the other, the minigraph and the list of the
// side picked. A dot picked says its path; picked again (or a row) it leads to that place's page; a package with no page has none.
import { useState } from "react";
import { useNavigate } from "react-router";
import { Card, Cell, Grid, Network, PagedList, Planet, Stack, Tabs } from "@gnoworld/ui";
import type { Around as AroundData, AroundNode } from "./around.ts";
import styles from "./Around.module.css";
import { rowPath } from "./around.ts";

function Entry({ node, onOpen }: { node: AroundNode; onOpen: (node: AroundNode) => void }) {
  const row = (
    <>
      <Planet name={node.id} />
      <span className="truncate">{rowPath(node.detail ?? node.label)}</span>
      <time className={styles["note"]}>{node.note}</time>
    </>
  );
  return node.path === undefined ? (
    <div className={[styles["row"], "icon-text-meta"].join(" ")}>{row}</div>
  ) : (
    <button
      type="button"
      className={[styles["row"], "icon-text-meta"].join(" ")}
      data-link=""
      onClick={() => {
        onOpen(node);
      }}
    >
      {row}
    </button>
  );
}

export function Around({ around }: { around: AroundData }) {
  const navigate = useNavigate();
  const { left, right } = around;
  const [side, setSide] = useState<"left" | "right">(right.total > 0 ? "right" : "left");
  const [picked, setPicked] = useState<string>();
  const [open, setOpen] = useState(false);
  const shown = side === "left" ? left : right;
  const go = (node: AroundNode) => {
    if (node.path !== undefined) Promise.resolve(navigate(node.path)).catch(reportError);
  };
  const find = (id: string) => [...left.nodes, ...right.nodes].find((node) => node.id === id);
  return (
    <Card look="hub">
      <Card.Header
        title={around.title}
        level={2}
        hint={around.hint}
        expand={{
          open,
          onToggle: () => {
            setOpen(!open);
          },
        }}
      />
      <Card.Body>
        <Grid cols={12} space="m">
          <Cell span={5}>
            <Network
              label={`${around.title}: places linked to ${around.centre.label}`}
              centre={around.centre}
              left={left}
              right={right}
              selected={picked}
              pickedHint={find(picked ?? "")?.path === undefined ? "no page of its own" : "click again to open it"}
              onSelect={(id) => {
                const node = find(id);
                if (node !== undefined && picked === id) go(node);
                setPicked(id);
              }}
            />
          </Cell>
          <Cell span={7}>
            <Stack space="xs">
              <Tabs
                label="Which side"
                size="s"
                tabs={[
                  { id: "left", label: `${left.label} ${String(left.total)}` },
                  { id: "right", label: `${right.label} ${String(right.total)}` },
                ]}
                selected={side}
                onSelect={(id) => {
                  setSide(id === "left" ? "left" : "right");
                }}
              />
              <PagedList
                key={side}
                label={shown.label.toLowerCase()}
                items={shown.nodes}
                keyOf={(node) => node.id}
                textOf={(node) => node.id}
                expanded={open}
                counted={shown.nodes.length > 12}
                empty={side === "left" ? "It imports nothing." : "Nothing imports it yet."}
                render={(node) => <Entry node={node} onOpen={go} />}
              />
            </Stack>
          </Cell>
        </Grid>
      </Card.Body>
    </Card>
  );
}
