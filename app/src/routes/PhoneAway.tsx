// The pre-rendered home hydrates without its client loader's redirect, so a phone goes on from here, by a replace as the loader's redirect
// does; it draws nothing. A computer never asks for this code (home.tsx).
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { landingOf } from "./phoneLand.ts";

export default function PhoneAway({ home }: { home: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    Promise.resolve(navigate(landingOf(home), { replace: true })).catch(reportError);
  }, [home, navigate]);
  return null;
}
