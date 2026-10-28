// The page's notification modes (slice 4's 4f-n): an account's, in the page's localStorage, reached at each use, since
// reaching it may itself throw (storage blocked).
import type { Address } from "@gnoworld/schemas";
import { noticePrefs, type NoticePrefs } from "./prefs.ts";

/** The account's notification modes on this device. */
export const pageNoticePrefs = (account: Address): NoticePrefs => noticePrefs(() => localStorage, account);
