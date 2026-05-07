## Problem Statement

Setelah trainer upload CSV peserta WA, distribusi link saat ini **manual penuh**: trainer harus klik tombol "Salin link WA" satu per satu, lalu paste ke chat masing-masing peserta. Untuk batch 20–30 peserta, ini friction yang menyebalkan dan sering bikin trainer menunda kirim → response rate peserta turun karena lupa di-blast.

## Solution

Tambah tombol "Broadcast ke peserta belum mulai" di halaman batch WA. Klik → bot WAHA kirim pesan inisiasi langsung ke nomor masing-masing peserta yang `wa_status=pending` (belum pernah klik link), staggered 30 detik per pesan untuk mengurangi pola spam. Pesan berisi sapaan + nama batch + instruksi balas dengan token. Peserta tinggal balas → bot pickup token via flow welcome existing. Idempotent: peserta yang sudah pernah di-broadcast dilewati pada klik berikutnya.

## User Stories

### Trainer
1. Sebagai trainer, saya ingin tombol "Broadcast ke peserta belum mulai" di halaman batch WA, supaya tidak perlu copy-paste link satu-satu.
2. Sebagai trainer, saya ingin sebelum kirim, melihat preview jumlah peserta yang akan di-broadcast (peserta `wa_status=pending` saja), supaya tahu apa yang sebenarnya akan dikirim.
3. Sebagai trainer, saya ingin proses broadcast jalan serial (1 pesan tiap 30 detik) supaya tidak terlihat spam dan mengurangi risiko nomor WAHA banned.
4. Sebagai trainer, saya ingin peserta yang sudah pernah di-broadcast dilewati otomatis kalau saya klik tombol lagi, supaya tidak double-message.
5. Sebagai trainer, saya ingin tahu status hasil broadcast setelah selesai: berapa terkirim, berapa gagal, alasan kegagalan ringkas (no phone / format invalid / WAHA error), supaya bisa follow-up manual.
6. Sebagai trainer, saya ingin kalau request timeout di tengah jalan (Vercel function limit), klik tombol lagi akan melanjutkan dari peserta yang belum tersentuh — bukan mengulang yang sudah terkirim.
7. Sebagai trainer, saya ingin tombol di-disable saat broadcast sedang berjalan, supaya tidak ter-trigger dua kali parallel.
8. Sebagai trainer, saya ingin nama saya muncul di pesan broadcast (atau setidaknya nama batch + course), supaya peserta tidak bingung sumber pesan.
9. Sebagai trainer batch web, saya tidak ingin melihat tombol broadcast (fitur khusus WA), supaya UI tetap clean.
10. Sebagai trainer, saya ingin tombol broadcast tidak muncul (atau di-disable dengan alasan jelas) kalau WAHA sedang gangguan atau `WHATSAPP_ENABLED=false`, supaya tidak buang-buang waktu klik yang akan gagal.

### Peserta
11. Sebagai peserta, saya ingin terima pesan WA inisiasi yang ramah, menyebut nama saya, nama kelas, dan instruksi jelas balas apa untuk mulai sesi.
12. Sebagai peserta yang nomornya ternyata sudah claim peserta lain (kasus salah input), saya ingin tetap bisa lapor ke trainer — bukan jadi confusion karena terima pesan tidak relevan.

### System / Owner
13. Sebagai owner, saya ingin idempotency via kolom `wa_broadcast_sent_at` di `participants`, supaya state persistent dan resume aman di seberang restart/redeploy.
14. Sebagai owner, saya ingin nomor peserta dengan format Indonesia umum (`08...`, `+628...`, `628...`, `8...`) di-normalisasi otomatis ke JID WAHA `62XXX@c.us`, supaya trainer tidak perlu cleansing manual.
15. Sebagai owner, saya ingin trade-off ban risk dicatat eksplisit di PRD — fitur ini secara sadar mem-bypass guideline V2 "no proactive blast", konsekuensinya nomor WAHA berpotensi banned lebih cepat.

## Implementation Decisions

### Schema delta
- `participants.wa_broadcast_sent_at` — timestamptz nullable. Set saat broadcast `sendText` ke nomor itu sukses. Idempotency gate untuk klik berikutnya. Migration baru, additive.
- (Tidak butuh table baru; semua state cukup di `participants`.)

### Server route baru
- `POST /api/wa/broadcast` (Node runtime, max duration sesuai Vercel plan):
  - Body: `{ batch_id }`.
  - Auth: server action atau RLS check — trainer harus owner batch (lookup via Supabase server client + auth user id). Bukan endpoint public.
  - Step 1: validasi `WHATSAPP_ENABLED=true` + `getSessionStatus()` WORKING/STARTING. Kalau tidak: 503 dengan reason.
  - Step 2: query peserta `batch_id=X AND wa_status='pending' AND wa_broadcast_sent_at IS NULL AND phone IS NOT NULL`.
  - Step 3: untuk tiap peserta:
    - Normalisasi phone → JID (lihat di bawah). Kalau invalid → catat hasil "invalid_phone", skip, jangan set timestamp.
    - Compose pesan (lihat template di bawah).
    - `sendText(jid, text)`. Kalau sukses → set `wa_broadcast_sent_at = now()`, push hasil "sent".
    - Kalau gagal → push hasil "send_failed: <error msg>", jangan set timestamp (bisa retry klik berikutnya).
    - Sleep 30 detik sebelum peserta berikutnya (`await new Promise(r => setTimeout(r, 30_000))`).
  - Step 4: return `{ ok: true, total, sent, failed, results: [{participant_id, name, status, reason?}] }`.
  - Kalau Vercel function timeout di tengah: yang sudah ter-set timestamp aman; trainer klik lagi → lanjut dari sisanya.

### Phone normalization
- Strip semua karakter non-digit kecuali leading `+`.
- Aturan Indonesia (asumsi semua peserta lokal):
  - `+628...` / `628...` → ambil sebagai `628...`
  - `08...` → ganti `0` jadi `62` → `628...`
  - `8...` (10–12 digit) → prepend `62` → `628...`
  - Hasil akhir harus 10–14 digit total (`62XXXXXXXXXX`).
- Append `@c.us` → `62XXXXXXXXXX@c.us`.
- Kalau tidak match pola → invalid, skip dengan reason "invalid_phone".

### Pesan broadcast (template)
```
Halo {nama}! 👋

Trainer mengundang kamu ikut sesi pra-kelas singkat untuk "{batch_name}"{course_suffix}. Sesi ~15 menit ngobrol santai dengan asisten kami.

Untuk mulai, balas pesan ini dengan:
Halo TrainingScout {token}

Link akan kadaluarsa setelah deadline batch. Sampai ketemu! 🙂
```
Di mana `{course_suffix}` = ` (${course_name})` kalau ada course_name, else string kosong. Token dari `participants.token`.

### UI batch detail page (untuk batch WA saja)
- Section baru "Broadcast WA" di antara "Tambah peserta" dan "Class brief":
  - Tampilkan count peserta yang akan di-broadcast (dynamic): "X peserta belum mulai dan belum pernah di-broadcast."
  - Tombol primary "Broadcast ke X peserta" — disabled kalau X=0 atau WAHA down.
  - Hint kecil: "1 pesan tiap 30 detik untuk mengurangi risiko spam. Estimasi: ~Y menit."
- State loading: tombol berubah jadi "Mengirim... (n/X)" dengan progress count via streaming response (atau polling — lihat trade-off di Further Notes).
- State done: panel hasil ringkas — "✅ {sent} terkirim, ⚠️ {failed} gagal" + collapsible list nama + reason.
- Banner gangguan WAHA existing (Phase 5 V2) tetap muncul kalau `getSessionStatus` tidak WORKING — tombol broadcast otomatis di-disable.

### Concurrency guard
- Tombol di-disable selama request fetch in-flight (client-side state).
- Server tidak butuh lock spesifik karena idempotency via `wa_broadcast_sent_at` cukup melindungi kalau toh dua request ter-trigger paralel — peserta yang sudah ter-set di klik 1 akan di-skip di klik 2 (race window kecil = max 30 detik sebelum timestamp ter-write).

### Logging
- `[wa/broadcast] start batch_id=X total=N`
- `[wa/broadcast] sent participant_id=Y jid=<masked>`
- `[wa/broadcast] failed participant_id=Y reason=<msg>`
- `[wa/broadcast] done batch_id=X sent=A failed=B duration=Cs`

### Edge cases
- Peserta phone field kosong → "no_phone", skip, jangan set timestamp.
- Phone tidak match pola Indonesia → "invalid_phone", skip.
- WAHA `sendText` 200 OK tapi nomor tidak ke-deliver (silent fail) → ter-treat sebagai "sent" (kita percaya respon WAHA). Trainer akan tahu via peserta tetap `wa_status=pending` setelah waktu reasonable.
- Trainer klik tombol di batch yang `closed` (deadline lewat) → tetap diizinkan (mungkin trainer mau extend), tapi UI bisa kasih warning. Atau: blokir di server (status=closed → 400). Pilih: **blokir di server**, hindari blast pasca-deadline.
- Vercel function timeout (60s/300s tergantung plan): broadcast ke ~10 peserta sudah pasti melebihi 60s. Kebutuhan: Vercel Pro (300s = max 10 peserta per request). Trainer perlu klik beberapa kali untuk batch besar. Trade-off di "Further Notes".
- Peserta dengan nomor yang sebenarnya nomor trainer / nomor WAHA bot sendiri → akan dapat pesan ke diri sendiri (low impact, biarkan).

## Out of Scope

- Kirim broadcast ke peserta `wa_status=pending_consent` (sudah claim, belum konsen). Mereka sudah pernah dapat welcome bubble, follow-up otomatis nanti via reminder cron WA (Phase 5 V2 existing).
- Kirim email broadcast untuk batch web. Batch web punya jalur reminder email existing.
- Custom pesan broadcast per-batch (template dari trainer). Template hardcoded di kode untuk V1.
- Scheduling broadcast (mis. "kirim besok jam 9 pagi"). Selalu instant on-click.
- Broadcast ke peserta yang sudah `completed` atau `in_progress` (re-engagement). Out of scope.
- Background job queue (BullMQ / Vercel Queue / Inngest). V1 in-request serial, accept Vercel timeout limit.
- Streaming progress real-time (SSE/WebSocket) ke UI. V1 kirim sync, UI tampil hasil setelah selesai (atau timeout = trainer klik lagi).
- Audit log persisten di table tersendiri. Server log Vercel cukup.
- Deduplication antar batch (peserta sama beda batch dapat 2 broadcast). Diizinkan — tiap batch independent.

## Further Notes

### Risiko ban (EKSPLISIT)
Fitur ini secara sadar mem-bypass guideline PRD V2: "Auto-blast pesan opening dari sistem ke nomor peserta (ban risk). Distribusi link `wa.me` adalah tugas trainer manual."

Konsekuensi:
1. Nomor WAHA bot **berpotensi banned lebih cepat** (estimasi: 1–2 minggu lebih cepat dari skenario baseline).
2. Mitigasi parsial: stagger 30 detik antar pesan (tidak burst), pesan personal (sebut nama, batch, instruksi konkret — bukan pure marketing copy).
3. Owner harus siap dengan SIM cadangan dan prosedur swap. Per PRD V2, dokumentasi swap SIM sudah ada di backlog.

### Trade-off Vercel timeout
- Vercel Hobby: 60s function timeout = max ~1 peserta sebelum timeout (1 × 30s sleep + overhead).
- Vercel Pro: 300s = max ~9 peserta per request (9 × 30s = 270s, sisain buffer overhead).
- Untuk batch besar (>10 peserta), trainer harus klik tombol 2–3 kali. UI hint perlu sebutkan: "Untuk batch besar, klik beberapa kali sampai semua peserta ter-broadcast."
- Alternatif cleaner: pindah ke async queue, tapi over-engineering untuk fitur internal V1.

### Saran throttle yang lebih rendah ban risk (not adopted di V1)
- 60–90 detik antar pesan (vs 30 detik) — lebih aman, tapi makin tidak praktis untuk batch besar.
- Random jitter ±10 detik supaya tidak terlihat persis sebagai bot pattern.
- Batas harian (mis. max 50 broadcast/hari per nomor WAHA).
- Bisa dipertimbangkan kalau ban event terjadi pasca-rilis.

### Open questions yang ditunda ke implementasi
- Format exact teks broadcast — copywriting saat coding (template di atas pre-fill).
- Apakah trainer perlu konfirmasi dialog ("Yakin broadcast ke X peserta?") — likely yes untuk safety, finalize saat UI build.
- Apakah hasil broadcast (per-peserta status) perlu disimpan di DB untuk audit historis — V1: tidak, hanya log Vercel.
