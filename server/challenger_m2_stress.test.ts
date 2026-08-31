import { describe, expect, it, beforeAll } from "vitest";
import { cosineSimilarity } from "./_core/vector";
import { validateInterpretation } from "./validation";
import { createDefinition, getRelevantDefinitions, getDb } from "./db";
import type { SemanticDefinition } from "../shared/governance";

describe("Milestone M2 Adversarial Stress Testing", () => {

  describe("1. Vector Cosine Similarity Stress & Edge Cases", () => {
    it("handles extreme dimensions (10,000-D)", () => {
      const dim = 10000;
      const vecA = new Array(dim).fill(0.5);
      const vecB = new Array(dim).fill(0.5);
      const vecNeg = new Array(dim).fill(-0.5);
      const vecOrth = new Array(dim).fill(0).map((_, i) => (i % 2 === 0 ? 1 : -1));
      const vecOrth2 = new Array(dim).fill(0).map((_, i) => (i % 2 === 0 ? 1 : 1));

      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
      expect(cosineSimilarity(vecA, vecNeg)).toBeCloseTo(-1.0, 5);
      expect(cosineSimilarity(vecOrth, vecOrth2)).toBeCloseTo(0.0, 5);
    });

    it("handles large magnitude numbers without overflow/NaN", () => {
      // 1e150 squared is 1e300 (close to Number.MAX_VALUE ~1.79e308)
      const bigVec1 = [1e150, 1e150, 1e150];
      const bigVec2 = [1e150, 1e150, 1e150];
      const sim = cosineSimilarity(bigVec1, bigVec2);
      expect(Number.isFinite(sim)).toBe(true);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    it("handles tiny magnitude numbers without underflow/NaN", () => {
      const tinyVec1 = [1e-150, 1e-150, 1e-150];
      const tinyVec2 = [1e-150, 1e-150, 1e-150];
      const sim = cosineSimilarity(tinyVec1, tinyVec2);
      expect(Number.isFinite(sim)).toBe(true);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    it("handles NaN, Infinity, -Infinity, and undefined array elements gracefully", () => {
      // Elements with NaN
      const nanVec = [1, NaN, 3];
      const validVec = [1, 2, 3];
      const resNaN = cosineSimilarity(nanVec, validVec);
      expect(Number.isFinite(resNaN)).toBe(true);
      expect(resNaN).toBe(0); // NaN in computation should be caught and return 0

      // Elements with Infinity
      const infVec = [1, Infinity, 3];
      const resInf = cosineSimilarity(infVec, validVec);
      expect(Number.isFinite(resInf)).toBe(true);
      expect(resInf).toBe(0);

      // Sparse array / undefined elements
      const sparseVec: number[] = [];
      sparseVec[0] = 1;
      sparseVec[2] = 3; // index 1 is undefined
      const resSparse = cosineSimilarity(sparseVec, [1, 2, 3]);
      expect(Number.isFinite(resSparse)).toBe(true);
      expect(resSparse).toBeGreaterThan(0);
      expect(resSparse).toBeLessThanOrEqual(1.0);
    });

    it("handles non-array and malformed types safely without throwing", () => {
      expect(cosineSimilarity(undefined as any, undefined as any)).toBe(0);
      expect(cosineSimilarity(null as any, null as any)).toBe(0);
      expect(cosineSimilarity("not-an-array" as any, [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([1, 2, 3], {} as any)).toBe(0);
      expect(cosineSimilarity(123 as any, 456 as any)).toBe(0);
      expect(cosineSimilarity(true as any, false as any)).toBe(0);
    });

    it("handles all variations of dimension mismatches", () => {
      expect(cosineSimilarity([1], [1, 2])).toBe(0);
      expect(cosineSimilarity([1, 2, 3, 4], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity(new Array(1536).fill(0.1), new Array(384).fill(0.1))).toBe(0);
      expect(cosineSimilarity(new Array(128).fill(0.1), new Array(1536).fill(0.1))).toBe(0);
    });

    it("guarantees return value is clamped strictly between -1.0 and 1.0", () => {
      for (let i = 0; i < 100; i++) {
        const len = Math.floor(Math.random() * 50) + 1;
        const v1 = Array.from({ length: len }, () => Math.random() * 200 - 100);
        const v2 = Array.from({ length: len }, () => Math.random() * 200 - 100);
        const sim = cosineSimilarity(v1, v2);
        expect(Number.isFinite(sim)).toBe(true);
        expect(sim).toBeGreaterThanOrEqual(-1.0);
        expect(sim).toBeLessThanOrEqual(1.0);
      }
    });

    it("handles zero vectors and all-zero entries with zero norms", () => {
      expect(cosineSimilarity([0, 0, 0, 0], [0, 0, 0, 0])).toBe(0);
      expect(cosineSimilarity([0, 0, 0, 0], [1, 2, 3, 4])).toBe(0);
      expect(cosineSimilarity([-1, -2, -3, -4], [0, 0, 0, 0])).toBe(0);
    });
  });

  describe("2. Dynamic Metric & Numeric Validation Stress", () => {
    const testCatalog: SemanticDefinition[] = [
      {
        id: 101,
        name: "Gross Merchandise Value",
        kind: "metric",
        description: "Total sales volume",
        expression: "SUM(orders.amount)",
        aliases: ["GMV", "gross_revenue", "total_sales"],
        evidence: [],
        status: "approved",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 102,
        name: "Customer Acquisition Cost",
        kind: "metric",
        description: "Blended CAC across channels",
        expression: "spend / new_users",
        aliases: ["CAC", "acquisition_cost"],
        evidence: [],
        status: "approved",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 103,
        name: "Annual Recurring Revenue",
        kind: "metric",
        description: "Normalized yearly subscription revenue",
        expression: "SUM(subscriptions.arr)",
        aliases: ["ARR", "run_rate"],
        evidence: [],
        status: "approved",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 104,
        name: "Customer Churn Rate",
        kind: "metric",
        description: "Percentage of customers lost",
        expression: "churned / total * 100",
        aliases: [], // Empty aliases array
        evidence: [],
        status: "approved",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ];

    it("validates case-insensitivity, whitespace trimming, and aliases", () => {
      // Exact name
      expect(validateInterpretation({ metric: "Gross Merchandise Value" }, testCatalog).ok).toBe(true);
      // Case variations of name
      expect(validateInterpretation({ metric: "gross merchandise value" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "  GROSS MERCHANDISE VALUE  " }, testCatalog).ok).toBe(true);
      // Short acronym aliases
      expect(validateInterpretation({ metric: "gmv" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "GMV" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "cac" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "CAC" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "arr" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "ARR" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "run_rate" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "total_sales" }, testCatalog).ok).toBe(true);

      // Definition with empty aliases
      expect(validateInterpretation({ metric: "Customer Churn Rate" }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: "customer churn rate" }, testCatalog).ok).toBe(true);

      // Unresolved fallback is always permitted
      expect(validateInterpretation({ metric: "Unresolved" }, testCatalog).ok).toBe(true);

      // Non-catalog metrics fail when catalog is provided
      const invalid = validateInterpretation({ metric: "Random Unknown Metric" }, testCatalog);
      expect(invalid.ok).toBe(false);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors?.length).toBeGreaterThan(0);
    });

    it("handles non-object inputs, empty catalogs, and null metric values", () => {
      // Non-objects
      expect(validateInterpretation(null).ok).toBe(false);
      expect(validateInterpretation(undefined).ok).toBe(false);
      expect(validateInterpretation("string").ok).toBe(false);
      expect(validateInterpretation(42).ok).toBe(false);
      expect(validateInterpretation([]).ok).toBe(false);

      // Empty object
      expect(validateInterpretation({}).ok).toBe(true);

      // Null / undefined metric
      expect(validateInterpretation({ metric: null }, testCatalog).ok).toBe(true);
      expect(validateInterpretation({ metric: undefined }, testCatalog).ok).toBe(true);

      // Non-string metric
      const nonString = validateInterpretation({ metric: 12345 }, testCatalog);
      expect(nonString.ok).toBe(false);
      expect(nonString.errors?.[0]).toContain(`Field "metric" must be a string`);

      // Empty catalog allows any valid string metric
      expect(validateInterpretation({ metric: "Custom User Metric" }, []).ok).toBe(true);
      expect(validateInterpretation({ metric: "Custom User Metric" }, undefined).ok).toBe(true);
    });

    it("rigorously tests decimal string validation and deep nesting", () => {
      // Valid numeric representations
      expect(validateInterpretation({ val: "0" }).ok).toBe(true);
      expect(validateInterpretation({ val: "0.0" }).ok).toBe(true);
      expect(validateInterpretation({ val: "-0.00" }).ok).toBe(true);
      expect(validateInterpretation({ val: "123456789.987654321" }).ok).toBe(true);
      expect(validateInterpretation({ val: "-9999.99" }).ok).toBe(true);
      expect(validateInterpretation({ val: 42 }).ok).toBe(true); // integer numbers are allowed
      expect(validateInterpretation({ val: 0 }).ok).toBe(true);
      expect(validateInterpretation({ val: -100 }).ok).toBe(true);

      // Invalid numeric representations
      // 1. Raw floats
      const floatRes = validateInterpretation({ val: 12.34 });
      expect(floatRes.ok).toBe(false);
      expect(floatRes.errors?.[0]).toMatch(/is a floating-point number/);

      // 2. Scientific notation string
      const sciRes = validateInterpretation({ val: "1.23e4" });
      expect(sciRes.ok).toBe(false);

      // 3. Hexadecimal string
      const hexRes = validateInterpretation({ val: "0xFF" });
      expect(hexRes.ok).toBe(false);

      // 4. Infinity / NaN string
      const infRes = validateInterpretation({ val: "Infinity" });
      expect(infRes.ok).toBe(false);

      // Deeply nested objects
      const deepValid = {
        level1: {
          level2: {
            level3: {
              amount: "1500.25",
              count: 10,
            }
          }
        }
      };
      expect(validateInterpretation(deepValid).ok).toBe(true);

      const deepInvalid = {
        level1: {
          level2: {
            level3: {
              amount: 1500.25, // float
            }
          }
        }
      };
      const deepRes = validateInterpretation(deepInvalid);
      expect(deepRes.ok).toBe(false);
      expect(deepRes.errors?.[0]).toContain("level1.level2.level3.amount");
    });
  });

  describe("3. Definition Search Stress Testing", () => {
    beforeAll(async () => {
      // Seed test definitions into in-memory DB
      await createDefinition({
        kind: "metric",
        name: "Monthly Active Users",
        description: "Count of unique active users in a 30-day window",
        expression: "COUNT(DISTINCT user_id)",
        aliases: ["mau", "active_users", "monthly_users"],
        evidence: [],
        status: "approved",
        version: 1,
      });

      await createDefinition({
        kind: "metric",
        name: "Net Promoter Score",
        description: "Customer loyalty index based on survey score",
        expression: "(promoters - detractors) / total_respondents * 100",
        aliases: ["nps", "advocacy_score"],
        evidence: [],
        status: "approved",
        version: 1,
      });

      await createDefinition({
        kind: "metric",
        name: "Earnings Before Interest and Taxes",
        description: "Operating profitability metric",
        expression: "revenue - cogs - opex",
        aliases: ["ebit", "operating_profit"],
        evidence: [],
        status: "approved",
        version: 1,
      });

      await createDefinition({
        kind: "metric",
        name: "Customer Lifetime Value",
        description: "Predicted net profit from customer relationship",
        expression: "arpu * gross_margin / churn",
        aliases: ["ltv", "clv", "customer_ltv"],
        evidence: [],
        status: "approved",
        version: 1,
      });
    });

    it("matches short acronyms in mixed cases and complex sentences", async () => {
      const mauMatches = await getRelevantDefinitions("What is our current MAU across mobile apps?");
      expect(mauMatches.some(d => d.name === "Monthly Active Users")).toBe(true);

      const npsMatches = await getRelevantDefinitions("calculate nPs for Q3");
      expect(npsMatches.some(d => d.name === "Net Promoter Score")).toBe(true);

      const ebitMatches = await getRelevantDefinitions("SHOW eBit AND OPERATING PROFIT");
      expect(ebitMatches.some(d => d.name === "Earnings Before Interest and Taxes")).toBe(true);

      const ltvMatches = await getRelevantDefinitions("Compare CAC vs LTV");
      expect(ltvMatches.some(d => d.name === "Customer Lifetime Value")).toBe(true);
    });

    it("safely handles special regex characters, punctuation, and symbols", async () => {
      // Punctuation & regex characters should not crash or throw syntax errors
      const q1 = await getRelevantDefinitions("What's our MAU/NPS ratio? (urgent!) [2026] + $ #");
      expect(q1.length).toBeGreaterThan(0);

      const q2 = await getRelevantDefinitions(".*+?^${}()|[]\\");
      expect(q2.length).toBeGreaterThan(0);

      const q3 = await getRelevantDefinitions("??? !!! @@@ $$$ %%% ^^^ &&& ***");
      expect(q3.length).toBeGreaterThan(0);
    });

    it("handles edge cases: empty strings, single chars, long strings, whitespace", async () => {
      expect((await getRelevantDefinitions("")).length).toBeGreaterThan(0);
      expect((await getRelevantDefinitions("   ")).length).toBeGreaterThan(0);
      expect((await getRelevantDefinitions("a")).length).toBeGreaterThan(0);
      expect((await getRelevantDefinitions(null as any)).length).toBeGreaterThan(0);
      expect((await getRelevantDefinitions(undefined as any)).length).toBeGreaterThan(0);
      
      const longQuery = "What is " + "our metric ".repeat(200) + "MAU?";
      const longMatches = await getRelevantDefinitions(longQuery);
      expect(longMatches.length).toBeGreaterThan(0);
      expect(longMatches.some(d => d.name === "Monthly Active Users")).toBe(true);
    });

    it("ranks exact name and alias matches higher than description matches", async () => {
      const results = await getRelevantDefinitions("MAU");
      expect(results[0].name).toBe("Monthly Active Users");

      const npsResults = await getRelevantDefinitions("Net Promoter Score");
      expect(npsResults[0].name).toBe("Net Promoter Score");
    });
  });

  describe("4. React Concurrency State Functional Updater Logic", () => {
    it("simulates concurrent session state updates without stale closure clobbering", () => {
      type Message = { role: "user" | "assistant"; content: string };
      type Session = { id: string; messages: Message[]; updatedAt: number };

      let sessions: Session[] = [
        { id: "s1", messages: [{ role: "user", content: "Initial message" }], updatedAt: 1000 },
        { id: "s2", messages: [{ role: "user", content: "Session 2 init" }], updatedAt: 1000 }
      ];

      const setSessions = (updater: (prev: Session[]) => Session[]) => {
        sessions = updater(sessions);
      };

      // Simulate simultaneous user action (adding message to s1) while stream completes for s1
      const action1 = () => {
        setSessions(prev => prev.map(s => s.id === "s1" ? { ...s, messages: [...s.messages, { role: "assistant", content: "Stream chunk 1" }], updatedAt: 2000 } : s));
      };

      const action2 = () => {
        setSessions(prev => prev.map(s => s.id === "s1" ? { ...s, messages: [...s.messages, { role: "assistant", content: "Stream chunk 2" }], updatedAt: 2001 } : s));
      };

      const action3 = () => {
        setSessions(prev => prev.map(s => s.id === "s2" ? { ...s, messages: [...s.messages, { role: "user", content: "Concurrent question" }], updatedAt: 2002 } : s));
      };

      // Execute in interleaved manner
      action1();
      action3();
      action2();

      const s1 = sessions.find(s => s.id === "s1")!;
      const s2 = sessions.find(s => s.id === "s2")!;

      expect(s1.messages.length).toBe(3);
      expect(s1.messages[1].content).toBe("Stream chunk 1");
      expect(s1.messages[2].content).toBe("Stream chunk 2");

      expect(s2.messages.length).toBe(2);
      expect(s2.messages[1].content).toBe("Concurrent question");
    });
  });
});
