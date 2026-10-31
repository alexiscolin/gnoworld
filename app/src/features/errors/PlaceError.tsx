import { isRouteErrorResponse, useRouteError } from "react-router";
import { PageError } from "./PageError.tsx";

/** Whether a route's error is React Router's 404: a place the data does not hold, apart from a failure. */
export function isMissing(error: unknown): boolean {
  return isRouteErrorResponse(error) && error.status === 404;
}

/** A place's route boundary: not found for a name the data lacks, could-not-load for anything else. */
export function PlaceError({ what }: { what: "universe" | "ecosystem" | "page" | "realm" }) {
  return isMissing(useRouteError()) ? (
    <PageError title={`No ${what} here`} line={`No ${what} of gno.world goes by that name.`} />
  ) : (
    <PageError title={`This ${what} could not load`} line="Try again in a moment." reload />
  );
}
