// What the stories and the overview draw with: a planet's picture made here, so no story asks
// another host for one (slice 7 draws the planets), and a day of calls, hour by hour.
export function disc(colour: string) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%23${colour}'/%3E%3C/svg%3E`;
}

export const DAY = [4, 3, 2, 2, 1, 1, 3, 8, 14, 22, 30, 34, 41, 38, 36, 40, 52, 70, 96, 88, 61, 40, 22, 12];
