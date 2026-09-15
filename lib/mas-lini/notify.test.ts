import { describe, expect, it, vi } from "vitest";
import { advance, initialContact } from "./flow";
import { buildNotice } from "./notify";

const jid = "628123456789@c.us";
function reviewed() {
  let result = advance(initialContact(jid), {
    name: "Ridwan",
    business: "Resto",
  });
  for (const feedback of [
    "Inspiratif",
    "Contoh prompt",
    "[dilewati]",
    "Workshop lanjutan",
  ])
    result = advance(result.contact, { feedback });
  return result.contact;
}

describe("notifikasi Bang Herri", () => {
  it("kontak baru berisi nama, bisnis, dan nomor WhatsApp", async () => {
    const summarize = vi.fn();
    const text = await buildNotice(
      { type: "identity" },
      reviewed(),
      jid,
      summarize,
    );
    expect(text).toContain("Kontak baru");
    expect(text).toContain("Nama: Ridwan");
    expect(text).toContain("Bisnis: Resto");
    expect(text).toContain("WhatsApp: +628123456789");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("review berisi ringkasan AI dan jawaban peserta", async () => {
    const text = await buildNotice(
      { type: "review" },
      reviewed(),
      jid,
      vi.fn().mockResolvedValue("Peserta merasa terinspirasi."),
    );
    expect(text).toContain("Review Creative Talk");
    expect(text).toContain("Peserta merasa terinspirasi.");
    expect(text).toContain("4. Harapan lanjutan: Workshop lanjutan");
  });

  it("ringkasan gagal tetap mengirim jawaban mentah", async () => {
    const text = await buildNotice(
      { type: "review" },
      reviewed(),
      jid,
      vi.fn().mockRejectedValue(new Error("AI down")),
    );
    expect(text).toContain("tidak tersedia");
    expect(text).toContain("1. Kesan: Inspiratif");
  });

  it("keluhan diberi penanda dan menyebut ID bila nomor belum diketahui", async () => {
    const lid = "168812345678901@lid";
    const text = await buildNotice(
      { type: "complaint", text: "Materi kurang jelas" },
      { ...initialContact(lid), name: "Dina" },
      lid,
      vi.fn().mockResolvedValue(null),
    );
    expect(text).toContain("KELUHAN");
    expect(text).toContain('Keluhan: "Materi kurang jelas"');
    expect(text).toContain(`belum diketahui (${lid})`);
  });
});
