/** The share of the way an ease with time constant `tau` goes in `seconds`: the same at any frame rate. */
export const damp = (seconds: number, tau: number): number => 1 - Math.exp(-seconds / tau);
