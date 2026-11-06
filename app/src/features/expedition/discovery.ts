// The door to slice 8's discovery past the first screen (parts.ts): a chunk of its own with nothing in it but the import, so the list of
// what parts.ts preloads stands here, not in the first screen's plug (plug.tsx), a few hundred bytes on every page.
export const parts = () => import("./parts.ts");
