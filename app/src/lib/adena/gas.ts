// The gas a call may burn and the fee it offers, which the chain takes whole (the wallet audit's low 3; Adena re-simulates and
// sets its own, D250), shared by Adena's call and the command line's (D13880). Read through gnomcp on onyx-1, 2026-11-17:
// r/sys/namereg/v0.Register burned 33,635,387 gas at the chain's 1ugnot/1000gas (auth/gasprice, the same on gnoland-1 per
// gnomcp's networks reference); the fee is that price for all the gas asked. Apart from call.ts, so a card loads no Adena code.
export const GAS_WANTED = 50_000_000;
export const GAS_FEE = GAS_WANTED / 1000;
