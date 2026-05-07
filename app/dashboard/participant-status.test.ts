import { describe, it, expect } from "vitest";
import { isParticipantCompleted } from "./participant-status";

describe("isParticipantCompleted (Phase 1 dashboard smoke)", () => {
  it("web batch: completed when status='completed'", () => {
    expect(
      isParticipantCompleted({
        status: "completed",
        wa_status: null,
        batches: { channel: "web" },
      }),
    ).toBe(true);
  });

  it("web batch: not completed for in_progress / not_started", () => {
    expect(
      isParticipantCompleted({
        status: "in_progress",
        wa_status: null,
        batches: { channel: "web" },
      }),
    ).toBe(false);
    expect(
      isParticipantCompleted({
        status: "not_started",
        wa_status: null,
        batches: { channel: "web" },
      }),
    ).toBe(false);
  });

  it("web batch: ignores wa_status (won't flag completed via WA field)", () => {
    expect(
      isParticipantCompleted({
        status: "in_progress",
        wa_status: "completed",
        batches: { channel: "web" },
      }),
    ).toBe(false);
  });

  it("WA batch: completed when wa_status='completed'", () => {
    expect(
      isParticipantCompleted({
        status: "not_started",
        wa_status: "completed",
        batches: { channel: "whatsapp" },
      }),
    ).toBe(true);
  });

  it("WA batch: ignores web status when deciding completion", () => {
    expect(
      isParticipantCompleted({
        status: "completed",
        wa_status: "pending",
        batches: { channel: "whatsapp" },
      }),
    ).toBe(false);
  });

  it("handles batches as array (Supabase relation can return either shape)", () => {
    expect(
      isParticipantCompleted({
        status: "completed",
        wa_status: null,
        batches: [{ channel: "web" }],
      }),
    ).toBe(true);
  });

  it("handles null batch defensively", () => {
    expect(
      isParticipantCompleted({
        status: "completed",
        wa_status: null,
        batches: null,
      }),
    ).toBe(true);
  });
});
