// Adena's two events, listened to once a page: its listeners cannot be removed and only the first one registered
// hears an event, so the latest handlers are kept for it to call.

export interface Handlers {
  account: (address: string) => unknown;
  network: (chainId: string) => unknown;
}
const KEYS = { changedAccount: "account", changedNetwork: "network" } as const;
const wallets = new WeakMap<object, { handlers: Handlers; registered: Set<string> }>();

/** Has the extension tell these handlers of an account or a network change; the next call changes the handlers only. */
export function listen(adena: unknown, handlers: Handlers): void {
  if (typeof adena !== "object" || adena === null) return;
  const held = wallets.get(adena) ?? { handlers, registered: new Set<string>() };
  held.handlers = handlers;
  wallets.set(adena, held);
  let on: unknown;
  try {
    on = Reflect.get(adena, "On");
  } catch {
    return;
  }
  if (typeof on !== "function") return;
  for (const [event, key] of Object.entries(KEYS)) {
    if (held.registered.has(event)) continue;
    try {
      Reflect.apply(on, adena, [
        event,
        (value: unknown) => {
          if (typeof value !== "string") return;
          try {
            held.handlers[key](value);
          } catch {
            // Adena's emitter must never hear a handler's failure.
          }
        },
      ]);
      held.registered.add(event);
    } catch {
      // Not registered: the next call tries again, the extension may come up later.
    }
  }
}
