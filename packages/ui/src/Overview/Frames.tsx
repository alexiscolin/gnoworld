import { Cluster } from "../compositions/index.ts";
import { Logo } from "../Logo/Logo.tsx";
import { Panel } from "../Panel/Panel.tsx";
import { Region } from "./Region.tsx";

/** The regions of the page's frames: the logo, the mark alone and with its wordmark; a panel with a header and a body. */
export function Frames() {
  return (
    <>
      <Region name="Logos">
        <Cluster space="l">
          <Logo />
          <Logo wordmark />
        </Cluster>
      </Region>
      <Region name="Panels">
        <Panel label="Notifications">
          <Panel.Header>
            <h3>Notifications</h3>
          </Panel.Header>
          <Panel.Body>Nothing new</Panel.Body>
        </Panel>
      </Region>
    </>
  );
}
