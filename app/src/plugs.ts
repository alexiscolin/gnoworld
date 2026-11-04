// Where slice 8's parts plug into slots.ts: one import line each, of a module of their own that calls `plug` (and keeps its heavy code in a
// chunk it asks for later: this file is on every page's first screen).
import "./features/expedition/plug.tsx";
