import { describe, it, expect } from "vitest";
import { extractToken } from "./welcome";

describe("extractToken", () => {
  it("extracts token from canonical 'Halo TrainingScout <token>' format", () => {
    const token = "rU5DvrsI5Lc66Dzqgvv9v1Pjd_Eeh8De";
    expect(extractToken(`Halo TrainingScout ${token}`)).toBe(token);
  });

  it("is case-insensitive on the prefix", () => {
    const token = "abcdefghij1234567890ABCDEF";
    expect(extractToken(`halo trainingscout ${token}`)).toBe(token);
    expect(extractToken(`HALO TRAININGSCOUT ${token}`)).toBe(token);
  });

  it("falls back to any 20+ char token-like string", () => {
    const token = "abcdefghij1234567890ABCDEF";
    expect(extractToken(`hi please use ${token}`)).toBe(token);
  });

  it("returns null when no token-like string present", () => {
    expect(extractToken("halo")).toBeNull();
    expect(extractToken("Halo TrainingScout short")).toBeNull();
    expect(extractToken("")).toBeNull();
  });

  it("ignores tokens shorter than 20 chars", () => {
    expect(extractToken("Halo TrainingScout abc123")).toBeNull();
  });
});
