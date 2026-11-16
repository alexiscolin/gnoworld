// What stands on a phone's page, gone to its place (usePhoneGo): nothing while it goes, the page else. A phone's code alone (PhoneGate).
import type { ReactNode } from "react";
import { usePhoneGo } from "./phoneGo.ts";

export function PhoneGoing({ children }: { children: ReactNode }) {
  return usePhoneGo() ? null : children;
}
