/** A name's colour, so a name keeps it: a hue from its letters, at the world's lightness. */
export function nameColour(name: string): string {
  let hue = 0;
  for (let at = 0; at < name.length; at += 1) hue = (hue * 31 + name.charCodeAt(at)) % 360;
  return `hsl(${String(hue)} 55% 68%)`;
}
