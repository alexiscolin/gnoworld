// The attributions in full (docs/DESIGN-SYSTEM.md, Credits), one dialog for every place that shows the textures: the universe's corner word
// and the full chat's column. CC BY 4.0 §3(a)(2) allows a link to it.
import { Dialog, Stack } from "@gnoworld/ui";
import { CREDITS } from "../../space/planet/credits.ts";

export function CreditsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog title="Credits" open={open} onClose={onClose}>
      <Stack as="ul">
        {CREDITS.map(({ line, source, licence, licenceUrl, read }) => (
          <li key={line}>
            <Stack space="3xs">
              <p>{line}</p>
              <p>
                <a href={source} target="_blank" rel="noopener noreferrer">
                  {new URL(source).host}
                </a>{" "}
                ·{" "}
                <a href={licenceUrl} target="_blank" rel="noopener noreferrer">
                  {licence}
                </a>{" "}
                · read on {read}
              </p>
            </Stack>
          </li>
        ))}
        {/* The home's prices: CoinGecko's free API asks to be credited (its documentation, read 2026-11-07). */}
        <li>
          <Stack space="3xs">
            <p>The prices of the home</p>
            <p>
              <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
                CoinGecko
              </a>
            </p>
          </Stack>
        </li>
      </Stack>
    </Dialog>
  );
}
