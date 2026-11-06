// The 55 icons of docs/DESIGN-SYSTEM.md, "Icons": a 16 px grid, drawn by Icon with a 1.5 px stroke
// in the colour of the text around it.
import type { ReactElement } from "react";

export const GLYPHS = {
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  plus: <path d="M8 3v10M3 8h10" />,
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
  "arrow-up-right": <path d="M5 11l6-6M6 5h5v5" />,
  chevron: <path d="M4 6l4 4 4-4" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3 3" />
    </>
  ),
  chat: <path d="M3 4h10v7H7l-3 2.5V11H3z" />,
  thread: (
    <>
      <path d="M3 3h10v6H8l-3 2.5V9H3z" />
      <path d="M6 13h7" />
    </>
  ),
  reply: (
    <>
      <path d="M6 4L2 8l4 4" />
      <path d="M2 8h7a4 4 0 0 1 4 4v1" />
    </>
  ),
  bell: (
    <>
      <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3z" />
      <path d="M6.5 14h3" />
    </>
  ),
  passport: (
    <>
      <rect x="3.5" y="2.5" width="9" height="11" rx="1.5" />
      <circle cx="8" cy="7" r="2" />
      <path d="M6 11h4" />
    </>
  ),
  seal: (
    <>
      <circle cx="8" cy="7" r="4" />
      <path d="M6 10.5L5 14l3-1.5L11 14l-1-3.5" />
    </>
  ),
  expand: <path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9" />,
  shrink: <path d="M13.5 2.5L10 6M10 3v3h3M2.5 13.5L6 10M3 10h3v3" />,
  image: (
    <>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
      <path d="M5 10l2-2 2 2 2-3 2 3" />
    </>
  ),
  bookmark: <path d="M4.5 2.5h7v11L8 11l-3.5 2.5z" />,
  smile: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 9.5c1.3 1.5 3.7 1.5 5 0M6 6.5v.01M10 6.5v.01" />
    </>
  ),
  code: <path d="M6 4L2 8l4 4M10 4l4 4-4 4" />,
  "code-block": (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M6.5 6L5 8l1.5 2M9.5 6L11 8l-1.5 2" />
    </>
  ),
  "list-bulleted": <path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7M3 4.5v.01M3 8v.01M3 11.5v.01" />,
  "list-numbered": <path d="M7 4.5h6.5M7 8h6.5M7 11.5h6.5M3 3v3M2.5 9.5c.5-.7 2-.5 1.5.5L2.5 12h2" />,
  quote: <path d="M3.5 4v8M7 5h6.5M7 8h6.5M7 11h4" />,
  pause: <path d="M6 4v8M10 4v8" />,
  play: <path d="M5 3.5v9l7-4.5z" />,
  pin: <path d="M6 2h4l-1 4 3 2H4l3-2zM8 8v6" />,
  more: (
    <>
      <circle cx="4" cy="8" r=".75" />
      <circle cx="8" cy="8" r=".75" />
      <circle cx="12" cy="8" r=".75" />
    </>
  ),
  pencil: <path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z" />,
  link: <path d="M7 9a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2L8 3.8M9 7a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1" />,
  comet: (
    <>
      <circle cx="11" cy="5" r="2.5" />
      <path d="M9 7L3 13M7 5L3 9M11 9l-4 4" />
    </>
  ),
  at: (
    <>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M10.5 8v1a2 2 0 0 0 4 0V8a6.5 6.5 0 1 0-2.5 5.1" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
      <path d="M3 4.5l5 4 5-4" />
    </>
  ),
  check: <path d="M3 8.5l3 3 7-7" />,
  calendar: (
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </>
  ),
  spark: <path d="M8 2v4M8 10v4M2 8h4M10 8h4" />,
  news: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M5 6h6M5 8.5h6M5 11h3.5" />
    </>
  ),
  satellite: (
    <>
      <circle cx="8" cy="8" r="1.75" />
      <path d="M2.5 4.5l2-2 2 2-2 2zM9.5 11.5l2-2 2 2-2 2zM5.5 5.5l1.25 1.25M9.25 9.25l1.25 1.25" />
    </>
  ),
  planet: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M2 10c2 1.5 10 -1 12 -4" />
    </>
  ),
  cluster: (
    <>
      <circle cx="5" cy="5.5" r="2" />
      <circle cx="11" cy="5" r="1.5" />
      <circle cx="8.5" cy="11" r="2.5" />
    </>
  ),
  bold: <path d="M5 3h4a2.5 2.5 0 0 1 0 5H5zM5 8h4.5a2.5 2.5 0 0 1 0 5H5z" />,
  italic: <path d="M7 3h5M4 13h5M10 3L6 13" />,
  underline: <path d="M5 3v4.5a3 3 0 0 0 6 0V3M4 13.5h8" />,
  strikethrough: (
    <path d="M3 8h10M11 4.5C10.5 3.5 9.4 3 8 3 6.3 3 5 3.9 5 5.2c0 .9.5 1.5 1.5 1.9M5 11c.5 1.2 1.6 2 3 2 1.8 0 3-.9 3-2.3 0-.6-.2-1.1-.6-1.5" />
  ),
  slash: <path d="M10 3L6 13" />,
  caret: <path d="M5 9.5l3-3 3 3" />,
  share: (
    <>
      <path d="M5 7l6-3M5 9l6 3" />
      <circle cx="4" cy="8" r="1.5" />
      <circle cx="12" cy="3.5" r="1.5" />
      <circle cx="12" cy="12.5" r="1.5" />
    </>
  ),
  menu: <path d="M3 5h10M3 8h10M3 11h10" />,
  people: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <path d="M2 13a4 4 0 0 1 8 0M11 4.5a2 2 0 1 1 0 4M12 13a3.5 3.5 0 0 0-1.5-3" />
    </>
  ),
  star: <path d="M8 2l1.6 3.8L13.5 6l-3 2.6.9 4L8 10.6 4.6 12.6l.9-4-3-2.6 3.9-.2z" />,
  chart: <path d="M3 13V8M8 13V3M13 13V6" />,
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.5V11M8 5v.01" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2.5l6 10.5H2z" />
      <path d="M8 6.5V9.5M8 11.5v.01" />
    </>
  ),
  alert: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 11v.01" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  shield: <path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z" />,
  key: (
    <>
      <circle cx="5.5" cy="10.5" r="2.5" />
      <path d="M7.5 8.5L13 3M11 5l1.5 1.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M3 4.5h10M3 8h10M3 11.5h10" />
      <circle cx="10" cy="4.5" r="1.5" />
      <circle cx="6" cy="8" r="1.5" />
      <circle cx="11" cy="11.5" r="1.5" />
    </>
  ),
} satisfies Record<string, ReactElement>;
