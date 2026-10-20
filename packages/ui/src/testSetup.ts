// Each test starts on an empty page: without Vitest's globals, Testing Library cleans up only when told.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
