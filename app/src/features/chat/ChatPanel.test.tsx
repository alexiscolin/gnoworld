// @vitest-environment jsdom
import { parseLine, type IrcMessage } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { MemoryRouter } from "react-router";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { all, drawer, noMedia, noObservers, settled } from "../../../tests/mount.tsx";
import { queryClient } from "../../lib/query/client.ts";
import type { Ergo, ErgoState } from "../../lib/ergo/ergo.ts";
import { StoreProvider } from "../../storeContext.tsx";
import type { ChatPlace } from "./ChatScreen.tsx";
import { ChatPanel } from "./ChatPanel.tsx";

// The page's link to Ergo is the real chatLink over a connection the test drives; only the page's socket is faked.
interface Fake extends Ergo {
  who: unknown;
  sent: string[];
  me: string;
  state: (state: ErgoState) => void;
  line: (text: string) => void;
}
const connections = vi.hoisted(() => ({ made: [] as unknown[] }));
vi.mock("./pageLink.ts", async () => {
  const { chatLink } = await vi.importActual<typeof import("./link.ts")>("./link.ts");
  return {
    dropLink: () => undefined,
    takeLink: (store: Parameters<typeof chatLink>[0]["store"]) =>
      chatLink({
        store,
        ticket: () => Promise.resolve({ ok: true, value: { ticket: "t" } }),
        guest: () => "guest-aaaaaa",
        connect: (who, on) => {
          const fake: Fake = {
            who,
            sent: [],
            me: "",
            multiline: () => true,
            send: (line) => {
              fake.sent.push(line);
              return true;
            },
            stop: () => undefined,
            nick: () => fake.me,
            state: (next) => {
              on.onState(next);
            },
            line: (text) => {
              const parsed = parseLine(text);
              if (parsed.ok) on.onLine(parsed.message satisfies IrcMessage);
            },
          };
          connections.made.push(fake);
          return fake;
        },
      }),
  };
});
const made = () => connections.made as Fake[];

const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ROOMS = { world: "bubble", sections: [{ name: null, rooms: [{ room: "#bubble", type: "open" }] }] };
const place: ChatPlace = {
  slug: "bubble",
  name: "Bubble",
  description: "d",
  kicker: "k",
  home: "/",
  worlds: [],
  universe: { id: "onyx", isDefault: false, gnoweb: "https://onyx.example" },
};
const page = (
  <MemoryRouter>
    <StoreProvider>
      <Grab />
      <ChatPanel world="bubble" place={place} />
    </StoreProvider>
  </MemoryRouter>
);
const roomsAnswer = (status: number) =>
  vi.fn((url: string) =>
    Promise.resolve(
      url.startsWith("/api/rooms")
        ? new Response(status === 200 ? JSON.stringify(ROOMS) : "{}", { status })
        : new Response("{}", { status: 404 }),
    ),
  );

beforeEach(() => {
  noMedia();
  noObservers();
  vi.stubGlobal("reportError", vi.fn());
  // The verdicts' stream, which jsdom lacks: it hears nothing.
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener = (): void => undefined;
      close = (): void => undefined;
    },
  );
  made().length = 0;
  queryClient.clear();
});
// No unstub here: mount.tsx unmounts the page after this file's hooks, and the unmount reads matchMedia.

const history = (fake: Fake | undefined) => (fake?.sent ?? []).filter((line) => line.startsWith("CHATHISTORY LATEST"));

describe("the room's history after the connection changes from guest to account", () => {
  it("is asked again on the account's connection, with no reload", async () => {
    vi.stubGlobal("fetch", roomsAnswer(200));
    drawer()(page);
    act(() => {
      state().loginActions.signedOut();
    });
    await settled(() => made().length === 1);
    const guest = made()[0];
    if (guest === undefined) throw new Error("no guest connection");
    guest.me = "guest-aaaaaa";
    act(() => {
      guest.state("connected");
    });
    await settled(() => guest.sent.some((line) => line.startsWith("JOIN #bubble")));
    act(() => {
      guest.line(":guest-aaaaaa!u@h JOIN #bubble");
    });
    expect(history(guest)).toEqual([expect.stringContaining("CHATHISTORY LATEST #bubble")]);

    act(() => {
      state().loginActions.signedIn(ME);
    });
    await settled(() => made().length === 2);
    const account = made()[1];
    if (account === undefined) throw new Error("no account connection");
    account.me = ME;
    act(() => {
      account.state("connected");
    });
    // The account's rooms are listed again, and the link follows them: the room is joined on the new connection.
    await settled(() => account.sent.some((line) => line.startsWith("JOIN #bubble")));
    act(() => {
      account.line(`:${ME}!u@h JOIN #bubble`);
    });
    expect(history(account)).toEqual([expect.stringContaining("CHATHISTORY LATEST #bubble")]);
  });
});

// The dock's frame (ChatLayout's [data-chat-layout]: its surface, its column, its padding) holds the error state too: a failed list left
// "The server is not answering." bare over the planet (the workshop, 2026-11-16, realm-dao at 1491 by 920).
describe("the dock when the server does not answer", () => {
  it.each([
    [
      "a guest",
      () => {
        state().loginActions.signedOut();
      },
    ],
    [
      "an account",
      () => {
        state().loginActions.signedIn(ME);
      },
    ],
  ])("keeps its frame around the words, for %s", async (_who, login) => {
    vi.stubGlobal("fetch", roomsAnswer(400));
    drawer()(page);
    act(login);
    await settled(() => document.body.textContent.includes("The server is not answering."));
    const words = all(document.body, "*").find(
      (each) => each.children.length === 0 && each.textContent === "The server is not answering.",
    );
    expect(words?.closest("[data-chat-layout]")).not.toBeNull();
    // At the lead's inset, as the dock's own empty state sits (RoomView.module.css .lead).
    expect(words?.closest("div[class*='lead']")).not.toBeNull();
  });

  // The page this test drew is the last box in the body (a drawer's host); an earlier test's may still be there.
  const mine = () => document.body.lastElementChild;
  const said = () => (mine()?.textContent.match(/The server is not answering\./g) ?? []).length;
  const OTHER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";

  it("says it once, in the conversation's place, for an account with no direct message open", async () => {
    vi.stubGlobal("fetch", roomsAnswer(400));
    drawer()(page);
    act(() => {
      state().loginActions.signedIn(ME);
    });
    await settled(() => said() > 0);
    expect(said()).toBe(1);
  });

  it("says it in the rooms' rail and not the conversation, beside a direct message that is open", async () => {
    vi.stubGlobal("fetch", roomsAnswer(400));
    drawer()(
      <MemoryRouter initialEntries={[`/?dm=${OTHER}`]}>
        <StoreProvider>
          <Grab />
          <ChatPanel world="bubble" place={place} />
        </StoreProvider>
      </MemoryRouter>,
    );
    act(() => {
      state().loginActions.signedIn(ME);
    });
    await settled(() => said() > 0);
    // The rail and the rooms' menu both say it (two surfaces); the conversation does not.
    expect(mine()?.querySelector("div[class*='lead']")).toBeNull();
  });
});

describe("the screen's header", () => {
  const at = (entry: string, phone: boolean) => {
    // An earlier test's screen may still stand in the body: count this one's Back alone.
    const before = document.querySelectorAll("[aria-label='Back']").length;
    vi.stubGlobal("fetch", roomsAnswer(200));
    // jsdom has none, and a browser's is none while the document is not fully active.
    vi.stubGlobal("visualViewport", null);
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: phone && query === "(max-width: 899px)",
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    drawer()(
      <MemoryRouter initialEntries={[entry]}>
        <StoreProvider>
          <Grab />
          <ChatPanel world="bubble" place={place} />
        </StoreProvider>
      </MemoryRouter>,
    );
    act(() => {
      state().loginActions.signedOut();
    });
    return () => document.querySelectorAll("[aria-label='Back']").length > before;
  };

  it("is the phone's, with its back, in the full chat of a phone", async () => {
    const back = at("/?chat=full", true);
    await settled(back);
    expect(back()).toBe(true);
  });

  it("is the desktop's, with no back, on a computer", async () => {
    const back = at("/?chat=full", false);
    await settled(() => document.querySelector("[data-chat-screen]") !== null);
    expect(back()).toBe(false);
  });
});
