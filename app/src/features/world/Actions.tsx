// A place's actions (frames 26, 86, 93): the main one, then Follow and Share as the video draws them, with the plate at its first paint
// (a size budget on that paint); the share sheet's code comes at the first press. A phone's row is PhoneActions.tsx's, its code asked
// once the window is a phone's.
import { PHONE_QUERY } from "@gnoworld/core";
import { Button, Cluster, type IconName } from "@gnoworld/ui";
import { lazy, Suspense, useEffect } from "react";
import { composerBox, useMedia } from "../chat/index.ts";
import { FollowButton } from "../follow/index.ts";
import { sharePlace, type SharedPlace } from "../share/index.ts";
import styles from "./Actions.module.css";
import { useLeads } from "./actionsShared.ts";
import { MainAction } from "./MainAction.tsx";

const PhoneActions = lazy(async () => ({ default: (await import("./PhoneActions.tsx")).PhoneActions }));

// The link goes to the chat; the focus follows it to the composer, so the reader can type at once. The composer is the
// chat's own field: the jump to a fragment would blur it, so when there is one the click stops there. With none (the rooms have
// not loaded, or a guest reads), the link keeps its jump.
const toComposer = (event: MouseEvent) => {
  if (!(event.target instanceof Element) || !event.target.closest("[href='#chat']")) return;
  const composer = composerBox(false);
  if (composer === null) return;
  event.preventDefault();
  composer.focus();
};

export interface ActionsProps {
  /** The place, as a share names and links it. */
  place: SharedPlace;
  /** The place as the device keys what it follows ("universe:world"). */
  follow: string;
  /** The world's proposals' page, which then leads. */
  proposals?: string;
  /** The main action's words, "Say hi in the chat" unless the place names its room. */
  say?: string;
  /** The place's main room, by its id: once its history came with no message in it, the main action asks to be the first (frame 93). */
  room?: string;
  /** Where the main action leads when the place has no chat to say hi in yet: a realm's page, its own page. */
  lead?: { label: string; href: string; icon?: IconName };
  /** A second action beside the main one, outlined: a realm's "Try a function". */
  second?: { label: string; href: string; icon?: IconName };
  /** The row's own class, which its place sets: the plate's narrow placement and its entrance. */
  className?: string | undefined;
}

// The main action and the one beside it. A world with a proposals realm leads with reading them (frames 22 and 27) and says hi in its room beside; the
// chat is otherwise on the page, where the one thing to do is to say hi in it, unless a place gives its own lead (a realm: its page, trying a function).
function Leads({ second, ...asked }: Pick<ActionsProps, "proposals" | "say" | "room" | "lead" | "second">) {
  const { main, proposals } = useLeads(asked);
  const { room } = asked;
  if (proposals !== undefined) {
    return (
      <>
        <Button href={proposals} pad="wide" emphasis="solid" icon="arrow">
          Read the proposals
        </Button>
        {room === undefined ? null : (
          <Button href="#chat" pad="wide" icon="chat">
            {`Say hi in ${room}`}
          </Button>
        )}
      </>
    );
  }
  return (
    <>
      <MainAction main={main} />
      {second === undefined ? null : (
        <Button href={second.href} pad="wide" icon={second.icon ?? "arrow"}>
          {second.label}
        </Button>
      )}
    </>
  );
}

export function Actions(props: ActionsProps) {
  const { place, follow, className, ...leads } = props;
  // The focus follows the link to the chat's composer.
  useEffect(() => {
    document.addEventListener("click", toComposer);
    return () => {
      document.removeEventListener("click", toComposer);
    };
  }, []);
  if (useMedia(PHONE_QUERY)) {
    return (
      <Suspense fallback={<div data-row="" className={[styles["line"], className].join(" ")} />}>
        <PhoneActions {...props} />
      </Suspense>
    );
  }
  return (
    <Cluster space="2xs" wrap="scroll" className={className}>
      <Leads {...leads} />
      {/* Follow and Share in words, as frame 30 draws them: icons alone left what each does unclear. */}
      <FollowButton kind="worlds" id={follow} size="m" />
      <Button
        icon="share"
        size="m"
        onClick={() => {
          sharePlace(place);
        }}
      >
        Share
      </Button>
    </Cluster>
  );
}
