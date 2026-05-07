# Plan: WA Broadcast (peserta belum mulai)

> Source PRD: [plans/prd-wa-broadcast.md](prd-wa-broadcast.md)

## Architectural decisions

Durable decisions yang berlaku di seluruh implementasi:

- **Routes baru**:
  - `POST /api/wa/broadcast` — server-side, body `{ batch_id }`. Trainer-only (auth via Supabase server client). Eksekusi serial, 30s antar pesan.
- **Schema delta** (additive, nullable, default-safe):
  - `participants.wa_broadcast_sent_at` — timestamptz nullable. Idempotency gate untuk re-klik.
- **Channel boundary**: hanya batch `channel='whatsapp'`. Batch web tidak terpengaruh, UI broadcast tidak muncul.
- **Distribusi pesan**: bot proaktif kirim ke nomor peserta — secara sadar bypass guideline V2 "no proactive blast" demi efisiensi trainer. Mitigasi via stagger 30s + personalisasi pesan.
- **Phone → JID**: normalisasi otomatis untuk format Indonesia (`08...`/`+62...`/`628...`/`8...` → `62XXX@c.us`). Invalid → skip dengan reason, tidak set timestamp.
- **Idempotency**: `wa_broadcast_sent_at IS NOT NULL` ⇒ skip. Aman untuk re-klik pasca-Vercel-timeout dan paralel-klik.
- **Feature gate**: `WHATSAPP_ENABLED=true` + `getSessionStatus()` WORKING/STARTING. Salah satu tidak terpenuhi → tombol disabled / route 503.

---

## Phase 1: WA broadcast end-to-end (single phase)

**User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15

### What to build

Trainer membuka halaman batch WA → melihat section "Broadcast WA" dengan count peserta yang akan di-broadcast (peserta `wa_status=pending` & belum pernah di-broadcast & punya phone). Klik tombol → confirm dialog → request ke server. Server normalisasi phone, kirim pesan personalisasi via WAHA satu per satu dengan jeda 30 detik, set `wa_broadcast_sent_at` per peserta yang sukses. Setelah selesai (atau timeout), UI tampil hasil ringkas: berapa terkirim, berapa gagal + alasan. Re-klik: lanjut sisanya saja. Batch web: section tidak muncul. WAHA gangguan / `WHATSAPP_ENABLED=false`: tombol disabled dengan alasan jelas.

### Acceptance criteria

- [ ] Migration baru menambahkan `participants.wa_broadcast_sent_at` (timestamptz nullable). Tidak break batch lama.
- [ ] Halaman batch detail (channel=whatsapp) menampilkan section "Broadcast WA" dengan: count peserta target, tombol "Broadcast ke X peserta", hint "1 pesan tiap 30 detik · estimasi ~Y menit". Section **tidak muncul** untuk batch web.
- [ ] Tombol broadcast disabled saat: target=0, WAHA session bukan WORKING/STARTING, `WHATSAPP_ENABLED ≠ true`, atau request sedang in-flight. Setiap kondisi punya tooltip/label yang menjelaskan kenapa.
- [ ] Klik tombol → confirm dialog "Yakin broadcast ke X peserta? Proses berjalan ~Y menit." → user confirm → request ke `POST /api/wa/broadcast`.
- [ ] `POST /api/wa/broadcast { batch_id }`:
  - Auth: trainer harus owner batch (Supabase server client + RLS atau explicit check). Non-owner / tidak login → 401/403.
  - Batch `status='closed'` (deadline lewat) → 400 dengan reason `batch_closed`.
  - `WHATSAPP_ENABLED ≠ true` atau `getSessionStatus()` bukan WORKING/STARTING → 503 reason `wa_unavailable`.
  - Query peserta `batch_id=X AND wa_status='pending' AND wa_broadcast_sent_at IS NULL AND phone IS NOT NULL`.
  - Untuk tiap peserta: normalisasi phone → JID. Phone null/invalid → result entry `{status: "skipped", reason: "no_phone"|"invalid_phone"}`, tidak set timestamp, tidak sleep.
  - Compose pesan personalisasi (nama peserta + batch name + course bila ada + instruksi balas `Halo TrainingScout {token}`).
  - `sendText(jid, text)` sukses → set `wa_broadcast_sent_at = now()`, push `{status: "sent"}`. Gagal → push `{status: "failed", reason: <msg>}`, tidak set timestamp.
  - Sleep 30 detik antar peserta yang ter-attempt sendText (skip tidak perlu sleep).
  - Return `{ ok: true, total, sent, failed, skipped, results: [{participant_id, name, status, reason?}] }`.
- [ ] Phone normalization handle: `08123456789`, `+628123456789`, `628123456789`, `8123456789`, `+62 812-3456-789` (dengan space/dash). Hasil: `628123456789@c.us`. Format selain ini → `invalid_phone`.
- [ ] Pesan broadcast template (hardcoded V1): menyebut nama peserta, nama batch, course bila ada, dan instruksi balas dengan token. Token tidak pernah masuk ke server log.
- [ ] Idempotency: peserta dengan `wa_broadcast_sent_at IS NOT NULL` ter-skip otomatis di query. Re-klik setelah Vercel timeout lanjut dari peserta sisanya.
- [ ] UI sukses (200 response): panel hasil — "✅ {sent} terkirim · ⚠️ {failed} gagal · ⏭ {skipped} dilewati" + collapsible list nama + reason per entry.
- [ ] UI partial (request timeout di klien sebelum server selesai): tampil "Request timeout — sebagian peserta mungkin sudah ter-broadcast. Refresh halaman dan klik lagi untuk lanjut sisanya." Count target di UI berkurang sesuai progress server-side.
- [ ] Banner WAHA gangguan (existing Phase 5 V2) tetap muncul kalau session down — section broadcast otomatis disabled (acceptance criterion sebelumnya sudah cover).
- [ ] Server log (mask JID, jangan log token/action_link):
  - `[wa/broadcast] start batch_id=X total=N`
  - `[wa/broadcast] sent participant_id=Y jid=<masked>`
  - `[wa/broadcast] failed participant_id=Y reason=<msg>`
  - `[wa/broadcast] skipped participant_id=Y reason=<no_phone|invalid_phone>`
  - `[wa/broadcast] done batch_id=X sent=A failed=B skipped=C duration=Ds`
- [ ] Smoke test:
  - Batch WA dengan 3 peserta (1 phone valid, 1 phone format aneh, 1 phone null) → klik broadcast → 1 sent, 1 invalid_phone, 1 no_phone. DB: hanya peserta sent yang punya `wa_broadcast_sent_at`.
  - Klik tombol kedua kali (segera) → target count = 0, tombol disabled.
  - Set `WHATSAPP_ENABLED=false` → tombol disabled, UI alasan jelas. Coba force panggil endpoint via curl → 503.
  - Buka batch web (channel=web) → section broadcast tidak muncul.
  - Batch dengan deadline sudah lewat (status=closed) → request ditolak 400.
