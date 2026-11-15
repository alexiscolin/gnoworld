// The page's notification modes: an account's, in the page's localStorage, reached at each use because
// reaching it may itself throw (storage blocked).
import type { Address } from "@gnoworld/schemas";
import { noticePrefs, type NoticePrefs } from "./prefs.ts";

/** The account's notification modes on this device. */
export const pageNoticePrefs = (account: Address): NoticePrefs => noticePrefs(() => localStorage, account);
