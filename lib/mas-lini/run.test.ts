import { beforeEach, expect, it, vi } from "vitest";
import { initialContact } from "./flow";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  sendText: vi.fn(),
  understand: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/wa/client", () => ({ sendText: mocks.sendText }));
vi.mock("./understand", () => ({ understand: mocks.understand }));
import { runMasLini } from "./run";
const jid = "628123456789@c.us";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(async (name) => ({
    data: name === "cs_claim" ? initialContact(jid) : null,
    error: null,
  }));
});
function cachedReply(delivered: boolean) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { reply: "Cached", delivered }, error: null }),
  };
  mocks.from.mockReturnValue(query);
}
it("webhook duplikat tidak memanggil AI atau mengirim dua kali", async () => {
  cachedReply(true);
  await runMasLini(jid, "m1", "Halo");
  expect(mocks.understand).not.toHaveBeenCalled();
  expect(mocks.sendText).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenLastCalledWith("cs_release", expect.anything());
});
it("retry pengiriman memakai balasan tersimpan dan tidak memajukan topik", async () => {
  cachedReply(false);
  mocks.sendText.mockRejectedValue(new Error("delivery failed"));
  await expect(runMasLini(jid, "m1", "Halo")).rejects.toThrow(
    "delivery failed",
  );
  expect(mocks.sendText).toHaveBeenCalledWith(jid, "Cached");
  expect(mocks.understand).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalledWith("cs_prepare", expect.anything());
  expect(mocks.rpc).toHaveBeenLastCalledWith("cs_release", expect.anything());
});
it("kontak sibuk tidak diproses bersamaan", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  await expect(runMasLini(jid, "m2", "Halo")).rejects.toThrow("busy");
  expect(mocks.from).not.toHaveBeenCalled();
});

it("menyimpan nama, nomor dan bisnis sebelum mengirim framework", async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  mocks.from.mockReturnValue(query);
  mocks.understand.mockResolvedValue({ name: "Ayu", business: "Toko kue" });
  await runMasLini(jid, "m1", "Saya Ayu, punya toko kue");
  expect(mocks.rpc).toHaveBeenCalledWith(
    "cs_prepare",
    expect.objectContaining({
      p_jid: jid,
      p_message_id: "m1",
      p_state: expect.objectContaining({
        name: "Ayu",
        phone: "628123456789",
        business: "Toko kue",
        framework_sent: true,
      }),
    }),
  );
  expect(mocks.sendText).toHaveBeenCalledWith(
    jid,
    expect.stringContaining("drive.google.com"),
  );
  expect(mocks.rpc.mock.invocationCallOrder[1]).toBeLessThan(
    mocks.sendText.mock.invocationCallOrder[0],
  );
});
