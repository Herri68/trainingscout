import { describe, expect, it } from "vitest";
import { advance, initialContact, FRAMEWORK } from "./flow";
import { parseUnderstanding } from "./understand";

describe("Mas Lini", () => {
  it("memberikan framework setelah identitas lengkap sebelum menggali feedback", () => {
    const contact = initialContact("628123456789@c.us");
    const first = advance(contact, { name: "Ayu", business: "Toko kue" });
    expect(first.contact.name).toBe("Ayu");
    expect(first.contact.phone).toBe("628123456789");
    expect(first.reply).toContain(FRAMEWORK);
    expect(first.reply).toContain("kesan");
    expect(first.contact.framework_sent).toBe(true);
  });
  it("mengenali kontak bertahap dan mempertahankan nama saat chat berikutnya", () => {
    let result = advance(initialContact("628123456789@c.us"), {});
    expect(result.reply).toContain("Boleh tahu nama Kakak");
    expect(result.reply).toContain("disimpan");
    result = advance(result.contact, { name: "Dina" });
    expect(result.reply).toContain("Dina");
    expect(result.reply).not.toContain(FRAMEWORK);
    result = advance(result.contact, { business: "Belum punya bisnis" });
    expect(result.reply).toContain(FRAMEWORK);
    expect(result.contact.name).toBe("Dina");
  });
  it("menyapa dengan Kak tanpa dobel sapaan", () => {
    const result = advance(initialContact("123456789012345@lid"), {
      name: "Ridwan",
      business: "Resto",
    });
    expect(result.reply).toContain("Kak Ridwan");
    expect(result.reply).not.toMatch(/\bkamu\b/i);
    expect(
      advance(initialContact("628123456789@c.us"), { name: "Kak Ridwan" })
        .reply,
    ).not.toContain("Kak Kak");
  });
  it("tidak menganggap LID sebagai nomor HP", () => {
    const first = advance(initialContact("123456789012345@lid"), {
      name: "Dina",
      business: "Kopi",
    });
    expect(first.contact.phone).toBeNull();
    expect(first.reply).toContain("nomor HP");
    const next = advance(first.contact, { phone: "081234567890" });
    expect(next.contact.phone).toBe("6281234567890");
    expect(next.reply).toContain(FRAMEWORK);
  });
  it("feedback selesai tidak mengunci chat dan framework bisa diminta lagi", () => {
    let result = advance(initialContact("628123456789@c.us"), {
      name: "Ayu",
      business: "Kue",
    });
    for (const feedback of ["Bagus", "Contohnya", "Sudah jelas", "Praktik AI"])
      result = advance(result.contact, { feedback });
    expect(result.contact.feedback.filter(Boolean)).toHaveLength(4);
    result = advance(result.contact, { request_framework: true });
    expect(result.reply).toContain(FRAMEWORK);
    expect(result.reply).not.toContain("kesan Kakak");
  });
  it("penolakan feedback tetap mendapat framework dan menghentikan pertanyaan", () => {
    const result = advance(initialContact("628123456789@c.us"), {
      name: "Ayu",
      business: "Kue",
      decline_feedback: true,
    });
    expect(result.reply).toContain(FRAMEWORK);
    expect(result.contact.feedback_stopped).toBe(true);
    expect(advance(result.contact, {}).reply).not.toContain("?");
  });
  it("respons negatif langsung dialihkan dan tidak ditanya feedback lagi", () => {
    const first = advance(initialContact("628123456789@c.us"), {
      name: "Ayu",
      negative: true,
    });
    expect(first.reply).toContain("Bang Herri");
    expect(first.reply).toContain("08112268556");
    expect(first.reply).not.toContain("?");
    expect(
      advance(first.contact, { feedback: "jawaban" }).contact.feedback,
    ).toEqual([null, null, null, null]);
  });
  it("eskalasi profesional: minta maaf, catat keluhan, tanpa kartu wa.me, tidak mengulang", () => {
    const base = advance(initialContact("628123456789@c.us"), {
      name: "Ridwan",
      business: "Resto",
    }).contact;
    const first = advance(base, { negative: true }, "Jelek banget materinya");
    expect(first.reply).toContain("Kak Ridwan");
    expect(first.reply).toContain("mohon maaf");
    expect(first.reply).toContain("sudah kami catat");
    expect(first.reply).toContain("08112268556");
    expect(first.reply).not.toContain("wa.me");
    expect(first.contact.complaints).toEqual(["Jelek banget materinya"]);
    const more = advance(
      first.contact,
      { negative: true },
      "Pembicaranya telat",
    );
    expect(more.reply).not.toContain("mohon maaf");
    expect(more.reply).toContain("tambahan masukan");
    expect(more.contact.complaints).toHaveLength(2);
    const neutral = advance(more.contact, {}, "oke");
    expect(neutral.reply).not.toContain("catat");
    expect(neutral.reply).toContain("08112268556");
    expect(neutral.contact.complaints).toHaveLength(2);
  });
  it("antrean notifikasi: identitas, review selesai sekali, dan keluhan", () => {
    let result = advance(initialContact("628123456789@c.us"), {
      name: "Ayu",
      business: "Kue",
    });
    expect(result.contact.pending_notices).toEqual([{ type: "identity" }]);
    for (const feedback of ["Bagus", "Contohnya", "Sudah jelas", "Praktik AI"])
      result = advance(result.contact, { feedback });
    expect(result.contact.pending_notices).toEqual([
      { type: "identity" },
      { type: "review" },
    ]);
    result = advance(
      { ...result.contact, pending_notices: [] },
      { feedback: "lagi" },
    );
    expect(result.contact.pending_notices).toEqual([]);
    const complaint = advance(
      result.contact,
      { negative: true },
      "Kurang jelas",
    );
    expect(complaint.contact.pending_notices).toEqual([
      { type: "complaint", text: "Kurang jelas" },
    ]);
  });
  it("menolak feedback saat framework dikirim hanya memicu notifikasi identitas", () => {
    const result = advance(initialContact("628123456789@c.us"), {
      name: "Ayu",
      business: "Kue",
      decline_feedback: true,
    });
    expect(result.contact.pending_notices).toEqual([{ type: "identity" }]);
    expect(advance(result.contact, {}).contact.pending_notices).toEqual([
      { type: "identity" },
    ]);
  });
  it("berhenti di tengah feedback memicu notifikasi review", () => {
    let result = advance(initialContact("628123456789@c.us"), {
      name: "Ayu",
      business: "Kue",
    });
    result = advance(
      { ...result.contact, pending_notices: [] },
      { feedback: "Bagus" },
    );
    result = advance(result.contact, { decline_feedback: true });
    expect(result.contact.pending_notices).toEqual([{ type: "review" }]);
  });
  it("menolak output model rusak dan tidak menerima status dari model", () => {
    expect(() => parseUnderstanding('{"negative":"false"}')).toThrow();
    expect(() => parseUnderstanding("[]")).toThrow();
    expect(
      parseUnderstanding(
        '{"name":"Ayu","framework_sent":true,"phone_jid":"attacker"}',
      ),
    ).toEqual({ name: "Ayu" });
  });
});
