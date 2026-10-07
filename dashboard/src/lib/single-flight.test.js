import { describe, expect, it } from "vitest";
import { runSingleFlight } from "./single-flight";

describe("runSingleFlight", () => {
  it("shares a pending operation for the same context", async () => {
    const flightRef = { current: null };
    let calls = 0;
    let resolveTask;
    const task = () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveTask = resolve;
      });
    };

    const first = runSingleFlight(flightRef, "month", task);
    const second = runSingleFlight(flightRef, "month", task);
    expect(second).toBe(first);
    expect(calls).toBe(0); // task is scheduled without running synchronously

    await Promise.resolve();
    expect(calls).toBe(1);
    resolveTask("done");
    await expect(first).resolves.toBe("done");
    expect(flightRef.current).toBeNull();
  });

  it("does not let an older context clear a newer flight", async () => {
    const flightRef = { current: null };
    const resolvers = {};
    const task = (key) => () => new Promise((resolve) => {
      resolvers[key] = resolve;
    });

    const oldPromise = runSingleFlight(flightRef, "old", task("old"));
    await Promise.resolve();
    const newPromise = runSingleFlight(flightRef, "new", task("new"));
    await Promise.resolve();
    expect(flightRef.current?.key).toBe("new");

    resolvers.old("old-result");
    await expect(oldPromise).resolves.toBe("old-result");
    expect(flightRef.current?.key).toBe("new");

    resolvers.new("new-result");
    await expect(newPromise).resolves.toBe("new-result");
    expect(flightRef.current).toBeNull();
  });
});
