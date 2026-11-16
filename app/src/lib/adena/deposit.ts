// The most storage deposit one call may lock (D13625): 5 GNOT, 50,000 bytes at the chain's 100 ugnot a byte. Signed as
// `max_deposit` in every MsgCall and worded on the card from this same number; nothing a request, a page or Jarvis says changes it.
// An empty cap is no cap: the chain falls back to its 100 GNOT default_deposit.
// One string, as signed: the first screen loads it with the call, and the card reads its number from it.
export const MAX_DEPOSIT = "5000000ugnot";
