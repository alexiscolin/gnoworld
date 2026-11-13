// The identity of the account logged in, as the server lists it (GET /api/links), read once for the page and shared: the chat's owner chip and
// Settings read the same answer. A link or an unlink asks again; an answer for another account than the one now logged in is dropped. A read that
// fails keeps the last good list and says so, so a linked person is never shown as unlinked.
import { pageLinksApi, type LinkList } from "../api/links.ts";
import { Heard } from "../heard.ts";

let held: { account: string; list: LinkList } | undefined;
let asking: string | undefined;
let failed: string | undefined;
const heard = new Heard();

/** Asks the server for `account`'s identity; the answer is kept only while `account` is the one asked for last. */
export async function readLinks(account: string): Promise<void> {
  asking = account;
  const got = await pageLinksApi().list();
  if (asking !== account) return;
  if (got.ok) {
    held = { account, list: got.value };
    failed = undefined;
  } else {
    asking = undefined;
    failed = account;
  }
  heard.tell();
}

/** What is held now, whether the last read of an account failed, and the way to hear either change. */
export const linksHeld = { subscribe: heard.subscribe, get: () => held, failed: () => failed, asked: () => asking };
