# TrainingScout

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

## Roadmap pasca-MVP

MVP 6 fase sudah selesai. Item ditunda yang potensial untuk v2:
- WhatsApp channel adapter (arsitektur sudah siap)
- Auto-share link ke peserta (tanpa copy-paste manual)
- Dashboard agregat lintas batch
- Custom rubrik per kelas
