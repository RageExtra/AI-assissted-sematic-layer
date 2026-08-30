import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("semantic router workflow", () => {
  it("returns a governed demo question through the typed API", async () => {
    const caller = appRouter.createCaller(createContext());
    const run = await caller.semantic.demo();
    expect(run.safety.status).toBe("validated");
    expect(run.semanticContext.length).toBeGreaterThan(2);
    expect(run.result.rows.length).toBeGreaterThan(0);
  });

  it("returns prior demonstration runs through history", async () => {
    const caller = appRouter.createCaller(createContext());
    const history = await caller.semantic.history();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty("question");
    expect(history[0]).toHaveProperty("baseline.score");
  });

  it("executes a user-submitted read-only query against the seeded commerce data", async () => {
    const caller = appRouter.createCaller(createContext());
    const run = await caller.semantic.run({ question: "Show revenue by region", useLlm: false });
    expect(run.safety.status).toBe("validated");
    expect(run.result.summary).toContain("Demo result set");
    expect(run.result.rows[0]).toHaveProperty("Region");
  });
});
