import { afterEach, describe, expect, it } from "vitest";
import {
  clearDatabaseOutage,
  databaseOutageSince,
  isMemoryMode,
  markDatabaseOutage,
} from "./memory-store";

describe("database outage tracking", () => {
  afterEach(() => clearDatabaseOutage());

  it("marks outage once and clears back to prisma mode", () => {
    markDatabaseOutage("down");
    const first = databaseOutageSince();
    expect(first).not.toBeNull();
    expect(isMemoryMode()).toBe(true);
    markDatabaseOutage("still down");
    expect(databaseOutageSince()).toBe(first);
    clearDatabaseOutage();
    expect(databaseOutageSince()).toBeNull();
    expect(isMemoryMode()).toBe(false);
  });
});