// What a phone's full chat adds to its screen: the header (back, name, Rooms, acts, Info) and the Info sheet it opens. The sheet's code is
// asked at the first press: nothing of the planet or the realm's page loads before.
import { useState, type ComponentProps } from "react";
import { useLocation } from "react-router";
import { ErrorView, errorKind } from "../errors/index.ts";
import { chunked } from "./Failing.tsx";
import { ChatHeader, type ChatHeaderProps } from "./ChatHeader.tsx";
import { PhoneHeader, type PhoneHeaderProps } from "./PhoneHeader.tsx";
import { useChatBack } from "./phoneGo.ts";

const PhoneInfo = chunked(async () => ({ default: (await import("./PhoneInfo.tsx")).PhoneInfo }), {
  waiting: null,
  failed: (error) => <ErrorView kind={errorKind(error)} size="inline" urgent />,
});

type Sheet = Omit<ComponentProps<typeof PhoneInfo>, "open" | "onClose">;

/** The chat's header: a phone's, or the wide chat's and the dock's. The phone's Info sheet the sheet is open at the address it was opened on, so a move to another closes it. */
export function useHeader({
  phone,
  desktop,
  phoneOf: { header, info },
}: {
  phone: boolean;
  desktop: ChatHeaderProps;
  phoneOf: { header: Pick<PhoneHeaderProps, "title" | "mark" | "rooms" | "acts">; info: Sheet };
}) {
  const back = useChatBack();
  const { key } = useLocation();
  const [at, setAt] = useState<string>();
  const [asked, setAsked] = useState(false);
  return {
    header: phone ? (
      <PhoneHeader
        {...header}
        onBack={back}
        onInfo={() => {
          setAsked(true);
          setAt(key);
        }}
      />
    ) : (
      <ChatHeader {...desktop} />
    ),
    sheet:
      phone && asked ? (
        <PhoneInfo
          {...info}
          open={at === key}
          onClose={() => {
            setAt(undefined);
          }}
        />
      ) : null,
  };
}
