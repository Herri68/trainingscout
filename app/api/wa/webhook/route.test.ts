import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/mas-lini/run", () => ({ runMasLini: vi.fn() }));
vi.mock("@/lib/wa/client", () => ({ sendText: vi.fn() }));
vi.mock("@/lib/wa/transcribe", () => ({ transcribeAudio: vi.fn() }));
import { runMasLini } from "@/lib/mas-lini/run";
import { POST } from "./route";

function request(payload: object, signed = true) {
  const body = JSON.stringify(payload);
  return new Request("http://localhost/api/wa/webhook", {
    method: "POST",
    body,
    headers: signed
      ? {
          "x-webhook-hmac": createHmac("sha512", "test-secret")
            .update(body)
            .digest("hex"),
        }
      : {},
  });
}
const event = {
  event: "message",
  session: "default",
  payload: { id: "m1", from: "628123456789@c.us", body: "Halo" },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_ENABLED", "true");
  vi.stubEnv("WAHA_WEBHOOK_HMAC_SECRET", "test-secret");
  vi.stubEnv("WAHA_SESSION_NAME", "default");
  vi.mocked(runMasLini).mockResolvedValue(undefined);
});
describe("webhook Mas Lini", () => {
  it("menolak pesan tanpa autentikasi sebelum akses kontak", async () => {
    expect((await POST(request(event, false))).status).toBe(401);
    expect(runMasLini).not.toHaveBeenCalled();
  });
  it.each([
    { ...event, session: "other" },
    { ...event, payload: { ...event.payload, from: "123@g.us" } },
    { ...event, payload: { ...event.payload, fromMe: true } },
    { ...event, payload: { ...event.payload, from: "status@broadcast" } },
  ])("mengabaikan sumber selain chat pribadi masuk", async (input) => {
    expect((await POST(request(input))).status).toBe(200);
    expect(runMasLini).not.toHaveBeenCalled();
  });
  it("nomor baru langsung diteruskan tanpa token/batch", async () => {
    expect((await POST(request(event))).status).toBe(200);
    expect(runMasLini).toHaveBeenCalledWith(event.payload.from, "m1", "Halo");
  });
  it("kegagalan penyimpanan/pengiriman meminta retry", async () => {
    vi.mocked(runMasLini).mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request(event))).status).toBe(503);
  });
});
