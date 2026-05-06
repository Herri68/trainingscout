# Plan: TrainingScout

> Source PRD: [plans/prd-trainingscout.md](prd-trainingscout.md)

## Architectural decisions

Durable decisions yang berlaku lintas fase:

- **Stack**: Next.js (App Router) di Vercel, Supabase (Postgres + Auth + Storage), Anthropic Claude API langsung, Resend untuk email transactional.
- **Models**: Claude Haiku 4.5 untuk wawancara (streaming SSE, prompt caching aktif), Claude Opus 4.7 untuk class brief.
- **Routes**:
  - `/dashboard` — list batch milik trainer
  - `/dashboard/batches/[id]` — detail batch (peserta, status, brief)
  - `/dashboard/batches/[id]/brief` — view & edit class brief
  - `/s/[token]` — chat wawancara peserta
  - `/api/chat` — turn handler wawancara (SSE)
  - `/api/cron/deadline` — cron auto-brief + close batch
  - `/api/cron/reminder` — cron H-1 reminder peserta
- **Schema (level konseptual)**:
  - `batches`: id, name, course_name, deadline, created_by_user_id, status (draft/active/closed), created_at
  - `participants`: id, batch_id, name, phone, email, token, status (not_started/in_progress/completed/abandoned), started_at, completed_at
  - `messages`: id, participant_id, role (user/assistant), content, created_at
  - `dimension_marks`: id, participant_id, dimension (enum 6 nilai), summary, marked_at
  - `briefs`: id, batch_id, generated_at, generated_by (auto/manual), content, edited_content
- **Tenancy**: Multi-trainer, single-org. Trainer login via Supabase Auth (Google + magic link). Tabel domain dipisah by `created_by_user_id`. Peserta tidak login — akses via signed token URL.
- **Agent control flow**: Tool use sebagai single source of truth state — `mark_dimension_covered(dimension, summary)` dan `end_session()`. Backend menolak `end_session` kalau ada dimensi belum di-mark.
- **Channel-agnostic core**: Logika agent (state, tool handling, LLM call) dipisah dari channel adapter. Web adapter = API route Next.js. WhatsApp adapter (v2) = webhook receiver memanggil interface yang sama.
- **Bahasa**: Bahasa Indonesia untuk semua interaksi peserta dan output brief.

---

## Phase 1: Walking skeleton + auth

**User stories**: 9, 11, 13 (sebagian)

### What to build

Setup proyek end-to-end. Trainer login via Supabase Auth (Google + magic link) dan buat batch + 1 peserta lewat UI minimal. Peserta klik `/s/<token>` → chat sederhana dengan Haiku menggunakan system prompt minimal (tanpa rubrik/tool use). Pesan tersimpan ke DB, streaming SSE jalan, satu turn berfungsi end-to-end.

### Acceptance criteria

- [ ] Trainer bisa login dengan Google atau magic link
- [ ] Trainer bisa create batch dan 1 peserta dari UI dashboard, dapat URL `/s/<token>`
- [ ] Buka URL peserta → chat UI muncul, pesan user dan asisten ter-stream dan persist
- [ ] Schema dasar (`batches`, `participants`, `messages`) dengan `created_by_user_id` di-enforce
- [ ] Deploy ke Vercel + Supabase production sukses

---

## Phase 2: Tool use infrastructure

**User stories**: 18 (mekanisme, belum dimensi penuh)

### What to build

Pasang infrastruktur tool use Claude di core agent. Definisikan dua tool: `mark_dimension_covered(dimension, summary)` dan `end_session()`. Per turn: backend handle tool_use → persist `dimension_marks` → kalau `end_session` dipanggil dan ada dimensi belum di-mark, return tool_result error sehingga agent lanjut bertanya. Pakai 1–2 dimensi dummy untuk validasi loop kerja sebelum rubrik penuh diisi di Fase 3.

### Acceptance criteria

- [ ] Tool definitions terkirim di tiap turn, prompt caching aktif untuk system prompt
- [ ] Tool call dari Claude di-handle: dimension_marks ter-insert ke DB
- [ ] `end_session` ditolak kalau dimensi belum lengkap (tool_result error fed back)
- [ ] `end_session` sukses → status peserta jadi `completed`, UI tampilkan state akhir
- [ ] Multi-turn loop tool use stabil (tidak infinite loop, tidak crash)

---

## Phase 3: Rubrik 6 dimensi + probing + welcome transparan

**User stories**: 12, 13, 14, 17, 18 (penuh), 20, 21

### What to build

Isi system prompt dengan rubrik 6 dimensi penuh (profil, goal, level AI coding, level vibe coding, tantangan, preferensi/constraint) plus instruksi probing maks 2x per dimensi dan welcome message transparan. Agent boleh memilih urutan dimensi. Probing counter dilacak (di prompt context atau DB). Konfirmasi ringkasan singkat sebelum `end_session`. Tandai dimensi yang dijawab tipis dengan flag di summary supaya brief generator bisa expose ke trainer.

### Acceptance criteria

- [ ] Welcome message muncul di awal sesi dengan kalimat eksplisit tentang sharing ke trainer + estimasi durasi
- [ ] Wawancara end-to-end menutup 6 dimensi dengan natural (uji manual 3 sesi)
- [ ] Probing terbatas 2x per dimensi terbukti di transkrip (tidak ada loop ngotot)
- [ ] Jawaban tipis di-mark dengan flag di summary dimensi
- [ ] Konfirmasi ringkasan akhir sebelum sesi ditutup

---

## Phase 4: CSV upload + status + resume

**User stories**: 1, 3, 10, 15

### What to build

Trainer upload CSV (nama, no HP, email) untuk batch existing → bulk-create participants dengan token unik. View daftar peserta dengan kolom status. Tombol copy-link per peserta. Resume: peserta klik link kalau status `in_progress` → load full history dan lanjutkan dari turn terakhir. Token tetap valid sampai batch deadline.

### Acceptance criteria

- [ ] CSV upload menambah peserta ke batch dan generate token unik per row
- [ ] Validasi CSV (header wajib, dedup email/phone) dengan error feedback yang jelas
- [ ] Tabel peserta menampilkan name, status, link copy button
- [ ] Tutup browser di tengah sesi → buka link sama → lanjut tanpa kehilangan progress
- [ ] Token expired (post-deadline) menampilkan halaman "sesi sudah ditutup"

---

## Phase 5: Class brief + edit + lampiran

**User stories**: 5, 6, 7, 8, 19

### What to build

Tombol "Generate brief" manual di halaman batch → call Opus dengan rubrik konteks + semua `dimension_marks` + transkrip lengkap. Output markdown dengan section: ringkasan kelas, distribusi level, goal cluster, rekomendasi fokus materi, peserta perlu perhatian khusus, catatan data quality. View brief di `/dashboard/batches/[id]/brief` dengan tombol edit (text area markdown bebas) — simpan ke `edited_content`. `content` original tetap. Tombol regenerate. Lampiran daftar profil per-peserta (ringkasan 6 dimensi + transkrip expandable).

### Acceptance criteria

- [ ] Generate brief manual sukses untuk batch dengan ≥3 peserta selesai
- [ ] Brief mencakup semua section dengan konten substantif (uji kualitatif)
- [ ] Brief menyertakan catatan eksplisit kalau ada peserta tidak selesai
- [ ] Edit `edited_content` persist dan ditampilkan; original tetap dapat dilihat
- [ ] Regenerate menulis baris baru di `briefs` (tidak overwrite history)
- [ ] Lampiran profil per-peserta accessible dari brief view

---

## Phase 6: Deadline cron + email

**User stories**: 2, 4, 16

### What to build

Field `deadline` jadi actionable. Cron harian (Vercel Cron) cek batch yang deadline sudah lewat dan masih `active` → set ke `closed`, trigger generate brief otomatis, kirim email ke trainer (Resend) dengan link ke brief. Cron terpisah (atau check dalam cron yang sama) H-1 deadline: kirim 1 email reminder ke peserta `not_started` atau `in_progress`. Idempotency: tidak kirim ulang kalau sudah dikirim.

### Acceptance criteria

- [ ] Cron deadline trigger auto-close batch + auto-generate brief + email trainer
- [ ] Cron reminder kirim email H-1 hanya ke peserta belum selesai
- [ ] Reminder tidak duplicate (flag `reminder_sent_at` per peserta)
- [ ] Email punya isi Bahasa Indonesia dengan link langsung ke brief / sesi peserta
- [ ] Trainer bisa pakai produk end-to-end tanpa intervensi manual setelah upload CSV
