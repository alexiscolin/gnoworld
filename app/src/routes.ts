import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [index("routes/home.tsx"), route("w/:world", "routes/world.tsx")] satisfies RouteConfig;
