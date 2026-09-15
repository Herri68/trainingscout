# Mas Lini — CS AI Bang Herri

WhatsApp masuk tanpa undangan/token → nama → bisnis → framework Creative Talk → empat topik feedback opsional. Nomor pengirim disimpan bersama nama/bisnis di `cs_contacts`. Jika pengirim berupa `@lid`, bot meminta nomor HP karena LID bukan nomor telepon. Respons negatif dialihkan ke Bang Herri, 08112268556. Percakapan tetap bisa dibalas setelah feedback selesai.

## Aktivasi versi Mas Lini

1. Jalankan `supabase/migrations/0008_mas_lini.sql` pada Supabase sebelum deployment. Migrasi menambahkan tabel dan fungsi, tanpa menghapus data training lama. Tabel baru hanya dapat diakses server (`service_role`), tanpa akses anon/authenticated.
2. Gunakan konfigurasi WAHA/Supabase/Anthropic yang sudah ada. `WHATSAPP_ENABLED=true`, `WAHA_SESSION_NAME` harus sama dengan session pada webhook; `WAHA_NUMBER` adalah nomor **bot**, format internasional tanpa +, bukan nomor pengalihan Bang Herri. Jangan membagikan secret.
3. Webhook tetap `/api/wa/webhook`, event `message`, HMAC SHA512. Aktifkan retry WAHA untuk respons HTTP 503. Kiriman harus memiliki ID pesan dan session. Grup, broadcast/status, pesan dari bot sendiri, dan session lain diabaikan.
4. Deploy kode setelah migrasi. Jadwal cron lama dihapus dari konfigurasi. Halaman dan API training lama mengembalikan HTTP 410. Kode/data lama dipertahankan untuk pemulihan, tetapi tidak dipakai Mas Lini.
5. Uji dengan nomor WhatsApp asli: kontak baru, nama/bisnis, link framework, empat jawaban, penolakan feedback, tanggapan negatif, dan chat kembali. Pastikan folder Drive dapat dibuka peserta tanpa permintaan akses.

`lib/mas-lini/flow.ts` memuat link framework, nomor pengalihan, pertanyaan dan alur. `understand.ts` mengekstrak jawaban dengan AI; `run.ts` menyimpan progres dan mengirim balasan. `compose.ts` menulis ulang draf balasan dari `flow.ts` dengan Claude Opus 5 agar luwes seperti CS manusia (membaca pesan peserta dan 12 pesan terakhir di `state.history`); link dan nomor telepon wajib sama persis dengan draf, dan bila AI gagal atau hasilnya tidak lolos pemeriksaan, draf asli yang dikirim. `notify.ts` menyusun notifikasi WhatsApp ke Bang Herri (`TRAINER_WA_JID`): kontak baru saat nama, bisnis, dan nomor lengkap; review dengan ringkasan AI saat feedback selesai atau dihentikan; dan ⚠️ keluhan segera saat eskalasi. Notifikasi diantrekan di `cs_contacts.state.pending_notices` bersama balasan peserta, dikirim setelah balasan peserta terkirim, dan dicoba lagi pada pesan berikutnya bila gagal. Tidak ada dashboard/laporan baru.

`cs_replies` menyimpan balasan untuk retry/deduplikasi, bukan fitur riwayat percakapan peserta. Progres empat topik disimpan pada `cs_contacts.state.feedback`. Pengiriman WAHA tidak mendukung transaksi bersama database: jika pesan terkirim tetapi konfirmasi database gagal, retry dapat mengirim balasan yang sama. Progres tidak diulang. Jika retry pesan terdahulu habis, balasan pending perlu diperiksa operator sebelum kontak dapat diproses kembali.

Validasi lokal: `npm run typecheck`, `npm test`, `npm run build`. Skrip lint warisan memerlukan konfigurasi ESLint terlebih dahulu. Migrasi dan integrasi WAHA/AI live harus diverifikasi saat aktivasi.

---

## Dokumentasi TrainingScout sebelumnya (arsip)

Agent pra-kelas yang memetakan kesiapan peserta sebelum pelatihan AI coding / vibe coding / app-building dengan AI. Trainer upload daftar peserta, peserta diwawancara via chat adaptif, sistem menghasilkan class brief untuk trainer.

Lihat [plans/prd-trainingscout.md](plans/prd-trainingscout.md) untuk PRD dan [plans/trainingscout.md](plans/trainingscout.md) untuk plan per-fase.

## Status

**Phase 1: Walking skeleton + auth** ✅ — login magic link, buat batch + peserta, chat sederhana dengan Haiku.
**Phase 2: Tool use infrastructure** ✅ — `mark_dimension_covered` + `end_session` dengan guardrail, prompt caching aktif, 2 dimensi placeholder (`profil`, `goal`).
**Phase 3: Rubrik 6 dimensi + probing + welcome transparan** ✅ — 6 dimensi penuh (profil, goal, level_ai_coding, level_vibe_coding, tantangan, preferensi), welcome eksplisit menyatakan brief dibagikan ke trainer + estimasi 15 menit, probing maks 2x, flag `[tipis]` di summary, konfirmasi ringkasan akhir sebelum `end_session`.
**Phase 4: CSV upload + status + resume** ✅ — bulk import peserta via CSV (header `name`/`nama` wajib, dedup email & phone), deadline editor per batch, status label prettified + breakdown count, token expiry: link tidak bisa dibuka setelah deadline atau batch `closed`. Resume sudah jalan sejak Phase 1 via load history.
**Phase 5: Class brief + edit + lampiran** ✅ — tombol generate/regenerate di batch page memanggil Opus 4.7 dengan rubrik + dimension_marks + transkrip semua peserta; markdown class brief tersimpan di `briefs` (history dipertahankan). Halaman `/dashboard/batches/[id]/brief` menampilkan brief, edit text bebas (`edited_content`), toggle versi original vs edit, dan lampiran expandable per-peserta (ringkasan dimensi + transkrip). Retry + fallback ke Sonnet 4.6 saat Opus overloaded.
**Phase 6: Deadline cron + email** ✅ — Vercel Cron `/api/cron/deadline` (tiap 15 menit) auto-close batch yang lewat deadline + generate brief otomatis + email trainer via Resend. Cron `/api/cron/reminder` (tiap jam) kirim 1 reminder ke peserta dengan deadline ≤24 jam. Idempotency via flag `auto_brief_sent_at` (batch) dan `reminder_sent_at` (participant). Bearer-auth dengan `CRON_SECRET`.

## Setup

### 1. Supabase

1. Buka project Supabase kamu.
2. SQL Editor → jalankan isi [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql), lalu [supabase/migrations/0002_tools.sql](supabase/migrations/0002_tools.sql), [supabase/migrations/0003_briefs.sql](supabase/migrations/0003_briefs.sql), dan [supabase/migrations/0004_cron.sql](supabase/migrations/0004_cron.sql).
3. Authentication → URL Configuration → tambahkan `http://localhost:3000/auth/callback` di "Redirect URLs".
4. Authentication → Providers → pastikan Email (magic link) aktif.
5. Catat: `Project URL`, `anon key` (Project Settings → API), dan `service_role key` (rahasia, jangan commit).

### 2. Environment variables

Salin `.env.example` jadi `.env.local` lalu isi:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Jalankan dev server

```
pnpm install
pnpm dev
```

Buka http://localhost:3000.

## Smoke test Phase 1

1. `/` → klik "Masuk sebagai trainer" → masukkan email → klik magic link di inbox.
2. Otomatis redirect ke `/dashboard`. Buat batch baru.
3. Di halaman batch, tambah 1 peserta. Klik "Salin link".
4. Buka link itu di browser lain (atau incognito) → chat dengan TrainingScout. Asisten harus sapa, jawab balik, history persist saat refresh.

## Stack

- Next.js 15 (App Router) + React 19
- Supabase (Postgres + Auth + RLS)
- Claude Haiku 4.5 untuk wawancara
- Tailwind CSS

## Cron jobs (Phase 6)

Vercel Cron config ada di [vercel.json](vercel.json):

- `/api/cron/deadline` — tiap 15 menit. Auto-close batch yang lewat deadline + generate class brief + email trainer.
- `/api/cron/reminder` — tiap jam. Kirim 1 reminder ke peserta dengan deadline ≤24 jam.

Setup env vars di Vercel: `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` (random string ≥32 karakter; Vercel Cron otomatis mengirim header `Authorization: Bearer <CRON_SECRET>`).

Test manual lokal:

```
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/deadline
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/reminder
```

## V2 WhatsApp

Fase 1–5 sudah masuk. Lihat [plans/v2-whatsapp.md](plans/v2-whatsapp.md).

- **Phase 1** ✅ channel toggle + UI link wa.me
- **Phase 2** ✅ webhook + welcome/consent flow
- **Phase 3** ✅ agent wiring + auto-split + typing + lock total
- **Phase 4** ✅ voice transcribe (Groq Whisper) + reject non-audio media
- **Phase 5** ✅ reminder cron WA (24h + 2h) + dashboard status WA + banner WAHA gangguan

### Trainer login via WhatsApp (internal-only)

Single-trainer setup. Set `TRAINER_EMAIL` + `TRAINER_WA_JID` di env, lalu di `/login` tombol "Kirim magic link via WhatsApp" akan generate Supabase magic link dan kirim via WAHA. Auto-fallback ke email kalau WAHA tidak available. Tombol "Kirim via email" tetap ada sebagai opsi manual. Lihat [plans/wa-magic-link-login.md](plans/wa-magic-link-login.md).

### Setup WAHA managed (Sumopod / serupa)

1. Buat session di dashboard WAHA → tab **Webhooks** → **Add Webhook**:
   - URL: `https://<vercel-url>/api/wa/webhook`
   - Events: pilih `message` (Phase 4 nanti tambah `message.any` untuk media)
   - Retries: default OK (15 attempts, 2s delay, exponential)
   - HMAC Key: generate random ≥32 char (`openssl rand -hex 32`), simpan — sama dengan `WAHA_WEBHOOK_HMAC_SECRET` di Vercel
2. Set env di Vercel project settings (lihat [.env.example](.env.example) bagian V2 WhatsApp).
3. Jalankan migration [supabase/migrations/0005_whatsapp.sql](supabase/migrations/0005_whatsapp.sql) di Supabase SQL Editor.
4. Set `WHATSAPP_ENABLED=true` di Vercel → opsi channel WhatsApp muncul di UI create-batch. Untuk kill switch, set `false` → opsi hilang + webhook return 503.

Trade-off: tanpa sidecar debouncer, peserta yang kirim pesan beruntun akan dapat reply per pesan. Welcome message minta peserta tulis lengkap dalam satu pesan.

## Roadmap pasca-MVP

- Auto-share link ke peserta (tanpa copy-paste manual)
- Dashboard agregat lintas batch
- Custom rubrik per kelas
