// The pre-rendered home hydrates without its client loader's redirect, so a phone goes on from here, by a replace as the loader's redirect
// does; it draws nothing. A computer never asks for this code (home.tsx). The hash goes too: a palette opened while this code came
// (#search) stays open.
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { landingOf } from "./phoneLand.ts";

export default function PhoneAway({ home }: { home: string }) {
  const navigate = useNavigate();
  const { hash } = useLocation();
  useEffect(() => {
    Promise.resolve(navigate(`${landingOf(home)}${hash}`, { replace: true })).catch(reportError);
  }, [home, hash, navigate]);
  return null;
}
