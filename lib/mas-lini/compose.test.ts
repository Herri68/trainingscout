import { describe, expect, it, vi } from "vitest";
import { acceptReply, composeReply } from "./compose";
import { FRAMEWORK, initialContact } from "./flow";

const draft = `Ini framework Creative Talk-nya, Kak Ridwan: ${FRAMEWORK}\n\nKalau berkenan, ceritakan sebentar: Bagaimana kesan Kakak setelah mengikuti Creative Talk?`;
const handoff =
  "Terima kasih atas masukannya. Kakak dapat menghubungi Bang Herri melalui WhatsApp di 08112268556.";
const input = {
  contact: initialContact("628123456789@c.us"),
  message: "Assalamualaikum",
  draft,
  history: [],
};

describe("tulis ulang balasan Mas Lini", () => {
  it("memakai balasan natural yang mempertahankan link persis", () => {
    const natural = `Waalaikumsalam, Kak Ridwan 😊 Ini link framework-nya ya: ${FRAMEWORK}. Boleh cerita kesan Kakak setelah ikut Creative Talk?`;
    expect(acceptReply(draft, natural)).toBe(natural);
  });

  it("kembali ke draf bila link hilang atau diubah", () => {
    expect(
      acceptReply(draft, "Waalaikumsalam Kak, link-nya menyusul ya."),
    ).toBe(draft);
    expect(
      acceptReply(
        draft,
        `Ini link-nya: ${FRAMEWORK.replace("sharing", "edit")}`,
      ),
    ).toBe(draft);
  });

  it("kembali ke draf bila menambah link atau nomor yang tidak ada di draf", () => {
    expect(
      acceptReply(
        handoff,
        "Silakan hubungi 08112268556 atau 081299998888 ya Kak.",
      ),
    ).toBe(handoff);
    expect(
      acceptReply(
        handoff,
        "Hubungi 08112268556 atau https://wa.me/628112268556",
      ),
    ).toBe(handoff);
    expect(acceptReply(handoff, "Hubungi Bang Herri ya Kak.")).toBe(handoff);
  });

  it("kembali ke draf bila kosong atau terlalu panjang", () => {
    expect(acceptReply(draft, "   ")).toBe(draft);
    expect(acceptReply(draft, null)).toBe(draft);
    expect(acceptReply(draft, `${FRAMEWORK} ${"a".repeat(1600)}`)).toBe(draft);
  });

  it("kegagalan AI tidak menggagalkan balasan", async () => {
    const reply = await composeReply(
      input,
      vi.fn().mockRejectedValue(new Error("timeout")),
    );
    expect(reply).toBe(draft);
  });

  it("mengirim riwayat, pesan, dan draf ke penulis", async () => {
    const write = vi.fn().mockResolvedValue(`Waalaikumsalam Kak! ${FRAMEWORK}`);
    const reply = await composeReply(input, write);
    expect(write).toHaveBeenCalledWith(input);
    expect(reply).toBe(`Waalaikumsalam Kak! ${FRAMEWORK}`);
  });
});
