import { index, route, type RouteConfig } from "@react-router/dev/routes";

// A realm's view is a client route, with no page written ahead: the host's fallback serves it, as it serves the catch-all.
// Each place's page is in the default universe at its plain path, and in every universe under /net/<id> (docs/decisions.md,
// 2026-10-29). Two paths to one file take an id each.
export default [
  index("routes/home.tsx"),
  route("earth", "routes/earth.tsx"),
  route("list", "routes/list.tsx"),
  route("w/:world", "routes/world.tsx"),
  route("e/:ecosystem", "routes/ecosystem.tsx"),
  route("r/*", "routes/realm.tsx"),
  route("net/:network", "routes/home.tsx", { id: "universe" }),
  route("net/:network/earth", "routes/earth.tsx", { id: "universe-earth" }),
  route("net/:network/w/:world", "routes/world.tsx", { id: "universe-world" }),
  route("net/:network/e/:ecosystem", "routes/ecosystem.tsx", { id: "universe-ecosystem" }),
  route("net/:network/r/*", "routes/realm.tsx", { id: "universe-realm" }),
  route("*", "routes/notFound.tsx"),
] satisfies RouteConfig;
