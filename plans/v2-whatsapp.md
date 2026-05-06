# Plan: V2 WhatsApp Channel + Reminder

> Source PRD: [plans/prd-v2-whatsapp.md](prd-v2-whatsapp.md)

## Architectural decisions

Durable decisions yang berlaku di semua fase:

- **Routes baru**:
  - `POST /api/wa/webhook` — terima batch dari sidecar debouncer (HMAC-verified).
  - Cron existing `/api/cron/reminder` di-extend, tidak ada route reminder baru.
- **Schema** (additive, semua kolom baru nullable / default-safe):
  - `batches.channel` enum text `web`/`whatsapp`, NOT NULL DEFAULT `web`.
  - `participants.phone_jid` text nullable, unique partial index (where not null).
  - `participants.wa_status` text nullable: `pending`/`pending_consent`/`in_progress`/`completed`.
  - `participants.session_locked_at` timestamptz nullable.
  - `participants.wa_reminder_24h_sent_at`, `participants.wa_reminder_2h_sent_at` timestamptz nullable.
- **Identity binding**: token tetap binding identitas peserta (sama dengan MVP). `phone_jid` di-attach saat first message claim.
- **Channel boundary**: per-batch final, tidak ada switch mid-session.
- **Distribusi pesan**: selalu participant-initiated (no proactive blast). Sistem hanya reply.
- **Infra di luar Vercel**: WAHA + sidecar debouncer Node di VPS owner; docker-compose di `infra/waha/`.
- **Auth boundary**: webhook debouncer→Vercel via HMAC shared secret (`WAHA_WEBHOOK_HMAC_SECRET`). WAHA REST via API key (`WAHA_API_KEY`).
- **Feature gate**: `WHATSAPP_ENABLED` env (boolean) — kill switch global instant. Kalau `false`: opsi WhatsApp hilang dari UI create-batch + webhook handler return 503.
- **System prompt cache stability**: channel-specific instruction di-append di akhir prompt (rubrik dimensi tidak berubah → cache hit tetap tinggi).

---

## Phase 1: Channel toggle + link WA UI (trainer-side)

**User stories**: 1, 2, 3, 6

### What to build

Trainer bisa membuat batch WhatsApp lewat UI dan mendapat link `wa.me` per peserta yang di-copy untuk distribusi manual. Belum ada WAHA wiring — link belum berfungsi di sisi peserta. Slice ini fokus ke schema migration, UI create-batch, dan generator link. Batch web existing tidak berubah perilakunya.

### Acceptance criteria

- [ ] Migration baru menambahkan semua kolom V2 (additive, nullable/default-safe), tidak break batch lama.
- [ ] UI create-batch menampilkan dropdown channel (web/whatsapp) hanya kalau `WHATSAPP_ENABLED=true`. Kalau `false` atau env absent, opsi tidak muncul, default tetap `web`.
- [ ] CSV import: kalau batch `channel=whatsapp`, kolom nomor HP wajib (validasi tolak baris tanpa nomor); kalau `web`, perilaku existing.
- [ ] Batch detail page menampilkan tombol "Salin link WA" per peserta untuk batch WA, format `https://wa.me/{WAHA_NUMBER}?text={URL_ENCODED("Halo TrainingScout {token}")}`.
- [ ] Tombol "Salin link" web tetap muncul di batch web seperti sebelumnya.
- [ ] Smoke test: trainer buat batch WA, upload CSV 2 peserta dengan nomor, dapat 2 link `wa.me` yang berbeda token-nya.

---

## Phase 2: Infra WAHA + debouncer + welcome/consent flow

**User stories**: 8, 9, 17, 18, 20

### What to build

Infra WAHA + sidecar debouncer di VPS jadi live. Peserta yang klik link `wa.me` dan kirim pesan token akan terclaim ke `phone_jid`, terima welcome 2-bubble, lalu diminta konfirmasi consent. Setelah konfirmasi, status berubah ke `wa_in_progress` — tapi agent belum di-invoke (itu fase berikutnya). Slice ini memvalidasi seluruh handshake channel sebelum LLM agent menyentuh chat.

### Acceptance criteria

- [ ] `infra/waha/` berisi docker-compose dengan 2 service: WAHA (persistent volume `/app/.sessions`) + debouncer sidecar Node (~30–50 LoC, per-JID debounce 4 detik, HMAC-sign forward ke Vercel).
- [ ] README di `infra/waha/` mencantumkan langkah setup VPS: deploy compose, scan QR sekali via WAHA endpoint, set webhook config WAHA ke debouncer.
- [ ] Endpoint `POST /api/wa/webhook` di Vercel: verifikasi HMAC; return 503 kalau `WHATSAPP_ENABLED=false`.
- [ ] First inbound dari nomor baru dengan token valid → claim: set `phone_jid`, `wa_status=pending_consent`, kirim 2-bubble welcome (sapa + consent prompt).
- [ ] Inbound berikutnya saat `wa_status=pending_consent` → consent detection longgar (apapun ≠ regex `tidak|no|skip|nggak|gak` → consent granted, status → `wa_in_progress`; kalau eksplisit tolak → balas template "Oke, hubungi trainer kalau berubah pikiran", status tetap `pending_consent`).
- [ ] Token tidak valid / nomor tanpa token → balas template "Hubungi trainer untuk link."
- [ ] Multi-pesan beruntun di-debounce 4 detik di sidecar, ter-forward sebagai 1 batch ke Vercel.
- [ ] Smoke test: 2 nomor tester (owner + 1 lain) klik link → terima welcome → consent "ya" / "tidak" → status di DB sesuai.

---

## Phase 3: Agent wiring + auto-split + typing + lock total

**User stories**: 5, 10, 12, 13, 16

### What to build

Inti V2: setelah peserta `wa_in_progress`, agent core (`lib/agent/run.ts`) di-invoke untuk turn berikutnya, reply di-split per paragraf dengan typing indicator, sampai `end_session` tool dipanggil → sesi lock total, brief generate seperti web. Slice ini delivering wawancara end-to-end via WA untuk text-only input.

### Acceptance criteria

- [ ] System prompt channel-aware: slot di akhir prompt berisi instruksi gaya WA ("balas pendek 1–3 kalimat, pisah paragraf, hindari heading/bullet markdown") saat `channel=whatsapp`.
- [ ] Webhook handler: setelah `wa_status=in_progress`, gabung pesan batch jadi 1 user turn, jalankan agent, reply via helper auto-split (split `\n\n`, max 4 chunk, startTyping → sleep proportional → sendText → sleep 400ms).
- [ ] Lock per-JID via Postgres advisory lock saat agent run; pesan baru yang masuk saat lock di-buffer dan di-process setelah release (atau di-treat sebagai turn berikut).
- [ ] `end_session` tool execution → set `participants.session_locked_at`. Pesan masuk berikutnya dari JID tersebut → balas template lock standar tanpa LLM call.
- [ ] Resume: peserta yang tutup HP di tengah sesi, kirim pesan beberapa jam kemudian → agent lanjut dari history (sama mekanisme MVP).
- [ ] Brief generate (`/api/...` existing) jalan untuk batch WA — transcript format kompatibel, output identik dengan batch web kecuali konten.
- [ ] Smoke test: full wawancara 6 dimensi via WA dari satu nomor, sampai end_session, brief generate dan ter-deliver ke trainer.

---

## Phase 4: Voice transcribe + reject media + edge cases

**User stories**: 11, 14

### What to build

Multimodal handling lengkap di adapter WA: voice note di-transcribe via Groq Whisper dan masuk transcript dengan prefix `[via voice]`; gambar/file/sticker ditolak halus tanpa masuk transcript; semua edge case identitas/state ditangani konsisten.

### Acceptance criteria

- [ ] Groq Whisper client + env `GROQ_API_KEY`. Voice note ≤120 detik di-download dari WAHA, transcribe, masuk turn agent dengan prefix `[via voice]`.
- [ ] Voice >120 detik → balas template "Tolong dipotong jadi pesan-pesan lebih singkat ya 🙂", skip transcript.
- [ ] Transcribe gagal (audio rusak/quota habis/timeout) → balas template "Voice kurang jelas, kirim ulang atau ketik ya."
- [ ] Gambar / dokumen / video / sticker → balas template halus, **tidak** masuk transcript, **tidak** invoke agent.
- [ ] Edge case: token valid tapi sudah claim oleh JID lain → tolak "Link sudah dipakai, hubungi trainer."
- [ ] Edge case: pesan masuk dari JID claimed di batch yang `closed` (deadline lewat) → balas template "Sesimu sudah ditutup karena deadline."
- [ ] Edge case: pesan masuk dengan token yang ownernya sudah `wa_completed` → balas template lock.
- [ ] Webhook handler timeout / 5xx → debouncer retry 3x dengan backoff (5s, 30s, 2min), drop ke dead-letter log.
- [ ] Smoke test: peserta kirim text + voice 30s + voice 3 menit + gambar dalam 1 sesi — semua handled sesuai matrix.

---

## Phase 5: Reminder cron WA + dashboard status + finalisasi feature flag

**User stories**: 4, 7, 15, 19

### What to build

Reminder otomatis untuk batch WA, status visibility di dashboard trainer, dan polishing kill switch + observability sebelum production-ready. Setelah fase ini, V2 siap soft launch.

### Acceptance criteria

- [ ] Cron `/api/cron/reminder` cabang berdasarkan `batch.channel`. Untuk WA: query `wa_status='in_progress'` dengan deadline ≤24 jam dan `wa_reminder_24h_sent_at IS NULL` → kirim reminder WA, set timestamp. Idem untuk window ≤2 jam dengan `wa_reminder_2h_sent_at`.
- [ ] Dashboard batch detail menampilkan status badge WA per peserta: `belum mulai` / `menunggu konfirmasi` / `sedang wawancara` / `selesai`. Breakdown count seperti existing.
- [ ] Banner di dashboard "WhatsApp service sedang gangguan" kalau WAHA session check gagal (cek periodic via `getSessionStatus`).
- [ ] Kill switch: set `WHATSAPP_ENABLED=false` → opsi WA hilang dari UI create-batch baru, webhook return 503, batch existing tetap functional selama WAHA up.
- [ ] Tidak ada regresi di batch web: cron email reminder existing tetap jalan, tidak ter-trigger untuk batch WA.
- [ ] Smoke test full flow soft launch sesuai PRD § Smoke test plan: 1 batch WA internal end-to-end + uji kill switch.
