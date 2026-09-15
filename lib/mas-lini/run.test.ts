import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initialContact } from "./flow";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  sendText: vi.fn(),
  lookupPhoneByLid: vi.fn(),
  understand: vi.fn(),
  buildNotice: vi.fn(),
  composeReply: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/wa/client", () => ({
  sendText: mocks.sendText,
  lookupPhoneByLid: mocks.lookupPhoneByLid,
}));
vi.mock("./understand", () => ({ understand: mocks.understand }));
vi.mock("./notify", () => ({ buildNotice: mocks.buildNotice }));
vi.mock("./compose", () => ({ composeReply: mocks.composeReply }));
import { runMasLini } from "./run";
const jid = "628123456789@c.us";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.composeReply.mockImplementation(
    async ({ draft }: { draft: string }) => draft,
  );
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

it("kontak @lid memakai nomor dari WAHA sehingga tidak ditanya nomor HP", async () => {
  const lid = "168812345678901@lid";
  mocks.rpc.mockImplementation(async (name) => ({
    data:
      name === "cs_claim"
        ? {
            ...initialContact(lid),
            welcomed: true,
            name: "Ridwan",
            business: "Resto",
          }
        : null,
    error: null,
  }));
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
  mocks.understand.mockResolvedValue({});
  mocks.lookupPhoneByLid.mockResolvedValue("6281234567890");
  await runMasLini(lid, "m3", "Pagi");
  expect(mocks.lookupPhoneByLid).toHaveBeenCalledWith(lid);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "cs_prepare",
    expect.objectContaining({
      p_state: expect.objectContaining({
        phone: "6281234567890",
        framework_sent: true,
      }),
    }),
  );
  expect(mocks.sendText).toHaveBeenCalledWith(
    lid,
    expect.stringContaining("drive.google.com"),
  );
  expect(mocks.sendText).not.toHaveBeenCalledWith(
    lid,
    expect.stringContaining("nomor HP"),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});
function freshQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
}

it("notifikasi kontak baru ke Bang Herri dikirim setelah balasan peserta lalu antrean dikosongkan", async () => {
  vi.stubEnv("TRAINER_WA_JID", "628112268556@c.us");
  const query = freshQuery();
  mocks.from.mockReturnValue(query);
  mocks.understand.mockResolvedValue({ name: "Ayu", business: "Toko kue" });
  mocks.buildNotice.mockResolvedValue("NOTIF");
  await runMasLini(jid, "m1", "Saya Ayu, punya toko kue");
  expect(mocks.sendText).toHaveBeenNthCalledWith(
    1,
    jid,
    expect.stringContaining("drive.google.com"),
  );
  expect(mocks.sendText).toHaveBeenNthCalledWith(
    2,
    "628112268556@c.us",
    "NOTIF",
  );
  expect(mocks.buildNotice).toHaveBeenCalledWith(
    { type: "identity" },
    expect.objectContaining({ name: "Ayu", phone: "628123456789" }),
    jid,
  );
  expect(query.update).toHaveBeenLastCalledWith({
    state: expect.objectContaining({ pending_notices: [] }),
  });
});

it("notifikasi gagal tidak menggagalkan balasan peserta dan tetap tertunda", async () => {
  vi.stubEnv("TRAINER_WA_JID", "628112268556@c.us");
  const query = freshQuery();
  mocks.from.mockReturnValue(query);
  mocks.understand.mockResolvedValue({ name: "Ayu", business: "Toko kue" });
  mocks.buildNotice.mockResolvedValue("NOTIF");
  mocks.sendText
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("WAHA down"));
  await expect(runMasLini(jid, "m1", "Saya Ayu")).resolves.toBeUndefined();
  expect(query.update).not.toHaveBeenCalledWith({ state: expect.anything() });
});

it("balasan yang dikirim dan disimpan adalah hasil tulisan ulang, beserta riwayat percakapan", async () => {
  const query = freshQuery();
  mocks.from.mockReturnValue(query);
  mocks.understand.mockResolvedValue({});
  const natural = "Waalaikumsalam, Kak! Saya Mas Lini. Boleh tahu nama Kakak?";
  mocks.composeReply.mockResolvedValue(natural);
  await runMasLini(jid, "m9", "Assalamualaikum");
  expect(mocks.composeReply).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "Assalamualaikum",
      draft: expect.stringContaining("Boleh tahu nama Kakak"),
      history: [],
    }),
  );
  expect(mocks.sendText).toHaveBeenCalledWith(jid, natural);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "cs_prepare",
    expect.objectContaining({
      p_reply: natural,
      p_state: expect.objectContaining({
        history: [
          { role: "user", text: "Assalamualaikum" },
          { role: "assistant", text: natural },
        ],
      }),
    }),
  );
});
