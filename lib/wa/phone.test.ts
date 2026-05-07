import { describe, it, expect } from "vitest";
import { normalizePhoneToJid } from "./phone";

describe("normalizePhoneToJid", () => {
  it("normalizes 08... format", () => {
    expect(normalizePhoneToJid("08123456789")).toBe("628123456789@c.us");
  });

  it("normalizes +628... format", () => {
    expect(normalizePhoneToJid("+628123456789")).toBe("628123456789@c.us");
  });

  it("normalizes 628... format", () => {
    expect(normalizePhoneToJid("628123456789")).toBe("628123456789@c.us");
  });

  it("normalizes bare 8... format", () => {
    expect(normalizePhoneToJid("8123456789")).toBe("628123456789@c.us");
  });

  it("strips spaces and dashes", () => {
    expect(normalizePhoneToJid("+62 812-3456-789")).toBe("628123456789@c.us");
  });

  it("handles parentheses and dots", () => {
    expect(normalizePhoneToJid("(0812) 3456.789")).toBe("628123456789@c.us");
  });

  it("returns null for null/undefined/empty input", () => {
    expect(normalizePhoneToJid(null)).toBeNull();
    expect(normalizePhoneToJid(undefined)).toBeNull();
    expect(normalizePhoneToJid("")).toBeNull();
    expect(normalizePhoneToJid("   ")).toBeNull();
  });

  it("returns null for non-Indonesian prefix", () => {
    expect(normalizePhoneToJid("+1 555 123 4567")).toBeNull();
    expect(normalizePhoneToJid("12345")).toBeNull();
  });

  it("returns null for non-digit garbage", () => {
    expect(normalizePhoneToJid("abc")).toBeNull();
    expect(normalizePhoneToJid("---")).toBeNull();
  });

  it("returns null for too short numbers", () => {
    expect(normalizePhoneToJid("0812")).toBeNull();
    expect(normalizePhoneToJid("628")).toBeNull();
  });

  it("returns null when normalized form does not start with 628", () => {
    // mis. nomor fixed line 021xxx → 6221xxx, bukan 628 → invalid untuk WA
    expect(normalizePhoneToJid("0211234567")).toBeNull();
  });
});
