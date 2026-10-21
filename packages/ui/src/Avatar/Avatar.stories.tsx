import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { Avatar } from "./Avatar.tsx";

// Addresses of mainnet (gno.land/r/<address>/… namespaces, read through gnomcp on 2026-10-21), each
// named by its short form, as a person with no registered name is.
const PEOPLE = [
  "g1leu8d2vsplhehcfkjg50mwgdpxdkt8tztu95wr",
  "g12yg9nh4ncma44emgm8msxe8aavzywt0p95tanv",
  "g1747t5m2f08plqjlrjk2q0qld7465hxz8gkx59c",
  "g17cjym5e9hhws46lt6329pv2gtx2ay0503hgems",
  "g19t6f4f4ptt3m949jznalfsx2h8aj696llul0nj",
  "g1ecsuj0q572jr0dhu29q9njtnmw03hyu7tyyvv6",
  "g1j4ehkkrqcr53a233wamtvqggt3skr86c6777xd",
  "g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt",
];
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const first = PEOPLE[0] ?? "";

// 200 addresses' shapes, each letter the top 5 bits of a fixed 32-bit generator (Numerical Recipes'
// constants), so the spread at 20 px is measured on the same faces every run.
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
let seed = 1;
const letter = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return BECH32[seed >>> 27] ?? "q";
};
const SPREAD = Array.from({ length: 200 }, () => `g1${Array.from({ length: 38 }, letter).join("")}`);

const meta = { component: Avatar, args: { address: first, name: short(first) } } satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Person: Story = {};
export const Sizes: Story = {
  render: () => (
    <Cluster space="m">
      {(["s", "m", "l"] as const).map((size) => (
        <Avatar key={size} address={first} name={`${short(first)}, size ${size}`} size={size} />
      ))}
    </Cluster>
  ),
};
export const Eight: Story = {
  render: () => (
    <Cluster space="2xs">
      {PEOPLE.map((address) => (
        <Avatar key={address} address={address} name={short(address)} />
      ))}
    </Cluster>
  ),
};
export const Kinds: Story = {
  render: () => (
    <Cluster space="m">
      <Avatar address={first} name={short(first)} size="l" />
      <Avatar address={first} name="Jarvis" kind="assistant" size="l" />
      <Avatar address={first} name="The quiz bot" kind="bot" size="l" />
    </Cluster>
  ),
};
export const HereAndSpeaking: Story = {
  render: () => (
    <Cluster space="m">
      <Avatar address={first} name={short(first)} size="l" here />
      <Avatar address={PEOPLE[1] ?? ""} name={short(PEOPLE[1] ?? "")} size="l" speaking />
    </Cluster>
  ),
};
export const NotAnAddress: Story = { args: { address: "not-an-address", name: "A name with no address", size: "l" } };
export const Spread: Story = {
  render: () => (
    <Cluster as="ul" space="3xs">
      {SPREAD.map((address) => (
        <li key={address}>
          <Avatar address={address} name={short(address)} size="s" />
        </li>
      ))}
    </Cluster>
  ),
};
