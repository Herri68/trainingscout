## Problem Statement

Trainer di pasar Indonesia mengeluh peserta sering tidak meng-klik link web TrainingScout — email pra-kelas tidak dibuka, link asing dari domain yang tidak dikenal di-skip, dan response rate untuk batch web rendah (<60% di MVP). Channel paling natural untuk peserta Indonesia adalah WhatsApp: nomor HP sudah dimiliki trainer (dikumpulkan saat registrasi kelas), peserta cek WA berkali-kali sehari, dan tidak perlu install/buka apa-apa baru. Reminder via email juga sering masuk Promotions tab atau di-ignore — momen H-24 / H-2 sering lewat tanpa peserta sadar deadline.

Trainer ingin: (1) peserta bisa wawancara di channel yang sama dengan koordinasi kelas mereka (WA), (2) reminder yang benar-benar terbaca, dan (3) tetap bisa pilih web untuk konteks korporat / batch yang sudah jalan.

## Solution

Tambah WhatsApp sebagai channel kedua di TrainingScout, di-toggle per-batch saat pembuatan batch oleh trainer. Untuk batch WhatsApp:

- Trainer upload daftar peserta dengan nomor HP (sudah ada di MVP), sistem generate link `wa.me/<nomor-WAHA>?text=Halo TrainingScout {token}` per peserta yang trainer share manual ke peserta (grup batch / chat personal).
- Peserta klik link → WA terbuka dengan pesan pre-filled berisi token → kirim → backend kenali token, bind nomor peserta ke `phone_jid`, balas welcome 2-bubble + minta consent.
- Setelah peserta konfirmasi consent (interpretasi longgar: apapun kecuali "tidak/no/skip"), agent jalankan rubrik 6 dimensi yang sama persis dengan web — channel-agnostic di core, hanya gaya bahasa yang adaptif (lebih pendek per bubble untuk WA).
- Pesan dari peserta di-debounce 4 detik di sidecar VPS sebelum di-forward ke Vercel (mengakomodasi pola "kirim beruntun" di WA), agent reply auto-split per paragraf dengan typing indicator + jeda 800ms antar bubble.
- Voice note di-transcribe via Groq Whisper (cap 2 menit) dan masuk transcript dengan prefix `[via voice]`. Gambar/file ditolak halus.
- Reminder cron diperluas: untuk batch WA, hanya peserta status `wa_in_progress` yang dapat reminder otomatis (H-24 dan H-2 sebelum deadline) — peserta yang belum claim link tampil di dashboard untuk trainer follow-up manual.
- Setelah `end_session`, sesi peserta lock total — pesan masuk berikutnya di-balas template tetap, tanpa LLM call.

WAHA (https://waha.devlike.pro) di-host trainer/owner di VPS sendiri, satu nomor SIM burner shared untuk semua batch & trainer. Rilis V2 di-gate via env flag `WHATSAPP_ENABLED` sebagai kill switch instant.

## User Stories

### Trainer
1. Sebagai trainer, saya ingin memilih channel (web atau WhatsApp) saat membuat batch baru, supaya saya bisa adaptasi ke konteks peserta (peserta korporat → web, peserta umum/UMKM → WA).
2. Sebagai trainer, saya ingin tetap upload daftar peserta lewat CSV yang sama (dengan kolom nomor HP wajib untuk batch WA), supaya alur upload tidak berubah.
3. Sebagai trainer batch WA, saya ingin tombol "Salin link WA" per peserta di dashboard batch yang menghasilkan link `wa.me` dengan token pre-filled, supaya saya bisa share langsung ke grup WA batch atau chat personal peserta.
4. Sebagai trainer, saya ingin lihat status tiap peserta WA di dashboard — `belum mulai` (`wa_pending`), `menunggu konfirmasi` (`wa_pending_consent`), `sedang wawancara` (`wa_in_progress`), `selesai` (`wa_completed`) — supaya tahu siapa yang harus saya chase manual.
5. Sebagai trainer, saya ingin batch WA tetap menghasilkan class brief + lampiran profil individu yang sama formatnya dengan batch web, supaya saya tidak perlu belajar UI baru.
6. Sebagai trainer, saya ingin batch web yang sudah jalan tidak terganggu rilis V2, supaya tidak ada regresi.
7. Sebagai trainer, saya ingin opsi WhatsApp bisa di-disable global oleh sistem (kalau WAHA bermasalah) tanpa mempengaruhi batch web saya.

### Peserta
8. Sebagai peserta, saya ingin klik link dari trainer di HP saya, langsung terbuka WA dengan pesan pra-isi, dan tinggal kirim — tanpa install/login/buka browser apapun.
9. Sebagai peserta, saya ingin tahu di awal sesi bahwa yang saya ceritakan akan jadi ringkasan untuk trainer kelas, supaya saya bisa memutuskan partisipasi dengan informed consent.
10. Sebagai peserta, saya ingin balasan agent terasa natural di WA — bubble pendek 1–3 kalimat, ada typing indicator, tidak wall-of-text — supaya tidak terasa seperti spam bot.
11. Sebagai peserta, saya ingin bisa kirim voice note (≤2 menit) untuk menjawab, supaya saya tidak harus mengetik panjang di HP.
12. Sebagai peserta yang kirim pesan beruntun ("halo", "saya andi", "kerja di marketing"), saya ingin agent membalas sekali untuk semua pesan saya yang berdekatan, bukan reply 3 kali — supaya percakapan tidak chaos.
13. Sebagai peserta, saya ingin tutup HP di tengah sesi dan lanjut beberapa jam kemudian dari pertanyaan terakhir, tanpa kehilangan progress.
14. Sebagai peserta yang kirim gambar/dokumen/sticker, saya ingin balasan halus yang menjelaskan bahwa sesi ini text/voice saja, supaya saya tahu harus apa.
15. Sebagai peserta, saya ingin dapat reminder via WA H-24 dan H-2 jam sebelum deadline kalau sesi saya belum selesai, supaya tidak miss deadline.
16. Sebagai peserta yang sesinya sudah selesai, saya ingin balasan template yang sopan kalau saya iseng chat lagi — bukan agent yang tetap ngobrol seolah sesi belum berakhir.
17. Sebagai peserta yang menjawab "tidak" saat consent, saya ingin tidak di-spam pesan lanjutan, dan bisa berubah pikiran dengan kirim pesan baru kapan saja.

### System / Owner (operator VPS WAHA)
18. Sebagai operator, saya ingin scan QR sekali saat setup awal dan session WAHA persist saat container restart, supaya tidak perlu re-scan tiap deploy.
19. Sebagai operator, saya ingin tahu kalau nomor WAHA banned (via log atau alert), supaya bisa swap SIM cadangan tanpa kehilangan data peserta.
20. Sebagai operator, saya ingin webhook dari debouncer ke Vercel terverifikasi via HMAC, supaya endpoint tidak bisa di-spoof dari luar.

## Implementation Decisions

### Schema delta (Supabase migration baru)
- `batches.channel` — enum text `web`/`whatsapp`, NOT NULL DEFAULT `web`, CHECK constraint. Batch lama tetap `web`.
- `participants.phone_jid` — text nullable, format WAHA JID (`6281234567890@c.us`), unique partial index where not null untuk dedup nomor di seluruh sistem.
- `participants.wa_status` — text nullable, salah satu `pending`/`pending_consent`/`in_progress`/`completed`. Null untuk peserta batch web.
- `participants.session_locked_at` — timestamptz nullable. Set saat `end_session` tool call dieksekusi (untuk web maupun WA — di web hanya untuk audit; di WA jadi gate pesan masuk).
- `participants.wa_reminder_24h_sent_at`, `participants.wa_reminder_2h_sent_at` — timestamptz nullable, untuk idempotency reminder WA. Terpisah dari `reminder_sent_at` (email).

### Modul baru di repo TrainingScout
- WAHA client wrapper: helper REST untuk `sendText`, `startTyping`/`stopTyping`, `downloadMedia`, `getSessionStatus`. Pakai `fetch` native Next.js, auth via header WAHA API key.
- Webhook handler `/api/wa/webhook`: terima POST dari debouncer dengan body `{ jid, messages: [{type, text|mediaUrl, timestamp}] }` dan header HMAC. Verifikasi signature, gabung pesan jadi 1 user turn, jalankan agent run, reply via WAHA client dengan auto-split chunking.
- Welcome/consent flow: helper terpisah yang menangani 3 state pre-agent — token claim, welcome 2-bubble, consent detection. Agent baru di-invoke setelah `wa_status = in_progress`.
- Voice transcription: helper Groq Whisper, dipanggil dari webhook handler saat `message.type === 'audio'|'voice'`. Cap durasi via metadata WAHA sebelum download (tolak >120 detik). Hasil transkrip di-prefix `[via voice]` di message content yang masuk ke agent.
- Lock per-JID: Postgres advisory lock di webhook handler — kalau lock tidak bisa diambil (agent masih reply turn sebelumnya), buffer pesan baru ke `wa_inbound_buffer` dengan retry flag, biar nanti di-pickup setelah lock release. Atau pendekatan sederhana: row lock `SELECT ... FOR UPDATE` di `participants` untuk JID itu.
- Channel-aware system prompt: `lib/agent/system-prompt.ts` di-extend dengan slot `channel` di akhir prompt (cache-stable — bagian rubrik dimensi tidak berubah). Untuk WA: instruksi "balas pendek 1–3 kalimat per giliran, pisah paragraf jelas dengan baris kosong, hindari heading/bullet markdown".
- Auto-split sender: helper `sendChunked(jid, fullText)` — split by `\n\n`, max 4 chunk per turn, untuk tiap chunk: startTyping → sleep min(50ms × char_count, 1500ms) → sendText → sleep 400ms. Tool call output (`mark_dimension_covered`, `end_session`) tidak dikirim sebagai bubble.
- Reminder cron `/api/cron/reminder` di-extend: cabang baru berdasarkan `batch.channel`. Untuk `whatsapp`: query peserta `wa_status = 'in_progress'` dengan deadline ≤24 jam dan `wa_reminder_24h_sent_at IS NULL`, kirim pesan WA, set timestamp. Window kedua (≤2 jam) idem dengan `wa_reminder_2h_sent_at`.
- Generate link UI: tombol "Salin link WA" di [batch detail page] (mirror tombol "Salin link" web yang sudah ada). Format: `https://wa.me/{WAHA_NUMBER}?text={URL_ENCODED("Halo TrainingScout " + token)}`.

### Komponen infra di luar Vercel (VPS sendiri)
- WAHA container — image resmi `devlikeapro/waha`, persistent volume untuk `/app/.sessions`. Owner scan QR sekali via `/api/{session}/auth/qr`. Pakai SIM burner.
- Debouncer sidecar — service Node 20 kecil (~30–50 LoC), terima webhook dari WAHA (config WAHA: webhook URL = `http://waha-debouncer:3000/inbound`), per-JID `setTimeout(4000ms)` reset on new message, on flush forward ke `${VERCEL_URL}/api/wa/webhook` dengan HMAC signature header.
- Docker compose dua service di `infra/waha/`. Owner deploy manual ke VPS-nya sendiri (ada README cara setup).

### Env vars baru (Vercel)
- `WAHA_BASE_URL`, `WAHA_API_KEY`, `WAHA_SESSION_NAME` (default `default`), `WAHA_NUMBER` (untuk generate `wa.me` link, format internasional tanpa `+`).
- `WAHA_WEBHOOK_HMAC_SECRET` — shared secret antara debouncer dan Vercel webhook handler.
- `GROQ_API_KEY` — untuk Whisper transcription.
- `WHATSAPP_ENABLED` — `true`/`false`. Kalau `false`, opsi WhatsApp tidak muncul di UI create-batch dan webhook handler return 503 (kill switch).

### Edge cases yang harus ditangani
- Pesan masuk dari nomor yang tidak punya `phone_jid` claimed dan tidak berisi token valid → balas template "Maaf, sepertinya kamu belum klik link dari trainer. Hubungi trainer untuk mendapatkan link."
- Pesan masuk dengan token valid tapi token milik peserta yang sudah `wa_completed` → balas template lock standar.
- Token valid tapi peserta sudah claim oleh `phone_jid` lain (misal trainer share link ke orang salah) → tolak: "Link ini sudah dipakai. Hubungi trainer untuk link baru kalau ada masalah."
- Pesan masuk dari `phone_jid` yang sudah claim peserta tapi di batch yang `closed` (deadline lewat) → balas "Sesimu sudah ditutup karena deadline. Trainer akan menghubungi kalau masih bisa diakomodasi."
- Webhook handler timeout / 5xx → debouncer retry 3x dengan backoff (5s, 30s, 2min), lalu drop ke dead letter log.
- Voice >2 menit → tolak halus, "Tolong dipotong jadi pesan-pesan lebih singkat ya 🙂", tidak masuk transcript.
- Transcribe gagal (audio rusak/sunyi/quota Groq habis) → balas "Maaf, voice-nya kurang jelas, tolong kirim ulang atau ketik ya."
- Peserta jawab "tidak" di consent → balas "Oke, kamu bisa hubungi trainermu kalau berubah pikiran. Selamat hari 🙂", `wa_status` tetap `pending_consent`. Pesan apapun setelahnya treat ulang sebagai consent attempt.
- WAHA banned / session disconnected → webhook send call gagal; log error, gracefully skip reminder run, tampilkan banner di dashboard trainer "WhatsApp service sedang gangguan, batch web tidak terpengaruh".

## Out of Scope

- WhatsApp Business API (Meta Cloud API) — V2 pakai WAHA unofficial saja. Migrasi ke WABA bisa jadi v3 kalau scaling butuh.
- Per-trainer WhatsApp number / multi-tenancy nomor — single shared SIM burner untuk semua batch.
- Switch channel mid-session (peserta mulai di WA lalu lanjut di web atau sebaliknya). Per-batch channel adalah final.
- Reopen sesi setelah `end_session` (lock total adalah final). Trainer tidak punya tombol "buka ulang sesi peserta" di V2.
- Auto-blast pesan opening dari sistem ke nomor peserta (ban risk). Distribusi link `wa.me` adalah tugas trainer manual.
- Image OCR / vision untuk peserta yang kirim screenshot — gambar tetap ditolak halus.
- Sticker reaction / emoji-only handling khusus — diperlakukan sebagai pesan biasa (akan di-filter LLM).
- Multi-bahasa channel-aware (auto-detect Indo/Inggris) — tetap mengikuti perilaku MVP.
- Allowlist trainer beta (`WHATSAPP_ENABLED_FOR=email1,email2`). Rilis langsung global flag boolean, soft launch via koordinasi manual.
- Group chat WA (peserta bicara di grup, bukan DM). Hanya 1:1 chat.

## Further Notes

### Risiko yang harus dimonitor pasca-rilis
1. **WAHA banned dalam 1–4 minggu pertama.** Mitigasi: SIM burner (bukan nomor pribadi), conservative traffic pattern (selalu reply, tidak proactive blast), dokumentasi prosedur swap SIM. Owner harus siap monthly cost SIM cadangan.
2. **Latency total turn (debounce 4s + LLM 2–5s + chunked send 2–4s) = 8–13 detik dari pesan terakhir peserta.** Acceptable untuk WA conversational, tapi monitor — kalau peserta complain "lambat", tuning DEBOUNCE_MS ke 2500ms.
3. **Cost Groq Whisper.** Asumsi 30 peserta × 5 voice turns × 30 detik avg = 75 menit/batch × $0.0002/menit (Groq large-v3-turbo) ≈ $0.015/batch. Negligible, tapi monitor kalau peserta voice-heavy.
4. **Postgres lock contention** kalau 1 peserta kirim banyak pesan beruntun melebihi window debounce — debouncer harus garansi 1 forward = 1 webhook call sequential per JID; lock per-JID di Vercel jadi safety net.

### Smoke test plan untuk soft launch (pre-rilis)
- Owner sebagai trainer dummy + 2–3 nomor tester: full flow upload CSV → share link `wa.me` → peserta klik dari HP → welcome → consent → wawancara 6 dimensi (text + voice + 1 gambar untuk uji tolak) → end_session → cek brief generate → cek lock total → cek reminder H-24 (atur deadline mepet untuk uji).
- Uji kill switch: set `WHATSAPP_ENABLED=false` di Vercel → opsi hilang dari UI create-batch baru → batch existing tetap functional (peserta yang sudah chat masih bisa lanjut).

### Open questions yang ditunda ke implementasi
- Format exact teks template lock, welcome, dan reject-media — copy-writing final saat implementasi (bisa di-tune setelah lihat reaksi peserta tester).
- Apakah sidecar debouncer perlu metric/health endpoint untuk monitoring VPS — kemungkinan ya (`GET /healthz` simple), tapi finalize saat tulis sidecar.
- Database migration ordering vs deploy Vercel: migration jalan dulu (additive only, nullable cols), lalu deploy app, lalu set `WHATSAPP_ENABLED=true`. Tidak ada destructive migration di V2.
