// ⌘K: the header's control and the palette it opens, over the places the page holds (docs/plans/slice-5.md §1).
import { Combobox, Dialog, IconButton, type ComboboxGroup } from "@gnoworld/ui";
import type { PlaceKind } from "@gnoworld/core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { site } from "../../places.ts";
import { opensPalette, searchItemsOf, searchPlaces, type SearchGroup } from "./search.ts";

const KINDS: Record<PlaceKind, string> = { cosmos: "Cosmos", earth: "Earth", world: "Worlds", ecosystem: "Ecosystems" };

const optionsOf = (found: SearchGroup[]): ComboboxGroup[] =>
  found.map((group) => ({
    id: group.kind,
    label: KINDS[group.kind],
    options: group.items.map((item) => ({ id: item.path, label: item.name })),
  }));

export function SearchPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items] = useState(() => searchItemsOf(site));
  useEffect(() => {
    const controller = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        if (!opensPalette(event)) return;
        // The browser's own use of the chord (Firefox's address bar) is left; a dialog already open keeps the screen.
        event.preventDefault();
        if (document.querySelector("dialog[open]") === null) setOpen(true);
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
    };
  }, []);
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  return (
    <>
      <IconButton
        icon="search"
        label="Search"
        onClick={() => {
          setOpen(true);
        }}
      />
      <Dialog title="Search" open={open} onClose={close} wide>
        {open ? (
          <Combobox
            label="Search places"
            value={query}
            onValueChange={setQuery}
            groups={optionsOf(searchPlaces(items, query))}
            onSelect={(path) => {
              close();
              Promise.resolve(navigate(path)).catch(reportError);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
