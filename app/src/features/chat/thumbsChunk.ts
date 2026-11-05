// The worlds' pictures, a chunk of their own: the React compiler cannot lower an `import()` inside a component, so it is asked from here.
export const thumbsChunk = () => import("../../lib/worldThumb.ts");
