// A component mounted as the shell puts it, inside the page's store and a router, for the tests that read or change what the store holds;
// the store is handed back once a render has run, from an effect, never during one.
import { useEffect, type ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { StoreProvider, useAppStore } from "../src/storeContext.tsx";
import { mount, settled } from "./mount.tsx";

export type AppStore = ReturnType<typeof useAppStore>;

function Held({ seen }: { seen: { store?: AppStore } }) {
  const store = useAppStore();
  useEffect(() => {
    Object.assign(seen, { store });
  });
  return null;
}

/** `element` mounted in the store, once the page has read the device (or found it unreadable); its box, and its store. */
export async function mountInStore(element: ReactElement): Promise<{ box: HTMLElement; store: AppStore }> {
  const seen: { store?: AppStore } = {};
  const box = mount(
    <MemoryRouter>
      <StoreProvider>
        <Held seen={seen} />
        {element}
      </StoreProvider>
    </MemoryRouter>,
  );
  await settled(() => seen.store !== undefined);
  const { store } = seen;
  if (store === undefined) throw new Error("no store");
  return { box, store };
}
