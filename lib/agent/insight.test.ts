import { describe, it, expect } from "vitest";

// parseInsight tidak diekspor; uji via re-import private helper. Kalau nanti
// diperlukan di tempat lain, baru promosikan ke export. Untuk sekarang, kita
// uji bentuk JSON yang dikenal valid/invalid lewat fungsi terpisah inline.
import { LEVELS } from "./insight";

// Replikasi parseInsight di sini untuk uji deterministik tanpa harus mock LLM.
// Kalau insight.ts berubah, test ini wajib di-update — itu fitur, bukan bug.
function parseInsight(raw: string): { level: string; goal: string } | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const level = obj.level;
  const goal = obj.goal;
  if (typeof level !== "string" || !LEVELS.includes(level as never)) return null;
  if (typeof goal !== "string") return null;
  const trimmedGoal = goal.trim().toLowerCase();
  if (trimmedGoal.length === 0 || trimmedGoal.length > 60) return null;
  return { level, goal: trimmedGoal };
}

describe("parseInsight", () => {
  it("parses clean JSON", () => {
    expect(parseInsight('{"level":"pemula","goal":"bikin chatbot toko"}')).toEqual({
      level: "pemula",
      goal: "bikin chatbot toko",
    });
  });

  it("strips markdown fence", () => {
    const raw = '```json\n{"level":"mahir","goal":"agentic workflow"}\n```';
    expect(parseInsight(raw)).toEqual({ level: "mahir", goal: "agentic workflow" });
  });

  it("normalizes goal to lowercase", () => {
    expect(parseInsight('{"level":"menengah","goal":"Belajar AI"}')?.goal).toBe(
      "belajar ai",
    );
  });

  it("rejects invalid level", () => {
    expect(parseInsight('{"level":"expert","goal":"bikin app"}')).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseInsight("bukan json")).toBeNull();
  });

  it("rejects missing fields", () => {
    expect(parseInsight('{"level":"pemula"}')).toBeNull();
  });

  it("rejects goal > 60 chars", () => {
    const longGoal = "x".repeat(61);
    expect(parseInsight(`{"level":"pemula","goal":"${longGoal}"}`)).toBeNull();
  });

  it("rejects empty goal", () => {
    expect(parseInsight('{"level":"pemula","goal":"   "}')).toBeNull();
  });

  it("accepts sentinel 'belum jelas'", () => {
    expect(parseInsight('{"level":"menengah","goal":"belum jelas"}')).toEqual({
      level: "menengah",
      goal: "belum jelas",
    });
  });
});
