## Problem Statement

Trainer pelatihan AI coding / vibe coding / app-building dengan AI sering masuk kelas tanpa pemahaman yang cukup tentang siapa pesertanya. Mereka tidak tahu goal konkret tiap orang, tools apa yang sudah dipakai, di mana peserta stuck, atau apa constraint praktis yang dihadapi (waktu, hardware, pengalaman programming sebelumnya). Akibatnya materi sering meleset: terlalu dasar untuk sebagian, terlalu cepat untuk yang lain, atau menggunakan contoh yang tidak relevan dengan konteks kerja peserta.

Asesmen pra-kelas berupa Google Form gagal mengisi gap ini karena form tidak bisa probing — peserta menulis "ingin belajar AI" dan trainer tidak punya cara menggali lebih jauh. Form juga tidak menghasilkan sintesis: trainer tetap harus baca 30 entri dan menyimpulkan sendiri, yang jarang sempat dilakukan.

## Solution

TrainingScout adalah agent pra-kelas berbasis chat yang mewawancarai peserta secara adaptif (~15–25 menit) untuk memetakan 6 dimensi kesiapan, lalu menghasilkan **class brief** sintesis untuk trainer + lampiran profil per-peserta. Agent menggunakan tool use untuk melacak dimensi yang sudah tertutup dan probing ketika jawaban terlalu tipis. Trainer upload daftar peserta lewat web admin, sistem generate link unik per peserta, dan brief auto-generate di deadline yang ditentukan trainer.

MVP dideploy sebagai web chat. Arsitektur dirancang channel-agnostic supaya WhatsApp adapter bisa ditambah di v2 tanpa rewrite.

## User Stories

**Trainer**

1. Sebagai trainer, saya ingin upload daftar peserta (CSV: nama, no HP, email, batch_id), supaya sistem bisa generate link wawancara unik untuk masing-masing.
2. Sebagai trainer, saya ingin set deadline wawancara per batch, supaya class brief auto-generate tepat waktu sebelum kelas mulai.
3. Sebagai trainer, saya ingin copy-paste link unik tiap peserta untuk saya share manual ke mereka via channel apa pun.
4. Sebagai trainer, saya ingin menerima email notifikasi saat class brief sudah siap, supaya saya tidak perlu cek dashboard berulang kali.
5. Sebagai trainer, saya ingin membaca class brief sintesis (level kelas, distribusi goal, fokus rekomendasi materi), supaya saya bisa adjust slide/contoh sebelum kelas.
6. Sebagai trainer, saya ingin edit teks brief secara bebas, supaya saya bisa koreksi nuansa yang LLM miss.
7. Sebagai trainer, saya ingin regenerate brief, supaya peserta yang ngisi telat tetap masuk hitungan.
8. Sebagai trainer, saya ingin lihat lampiran profil per-peserta (ringkasan 6 dimensi + transkrip), supaya saya bisa personalisasi interaksi di kelas dengan peserta tertentu.
9. Sebagai trainer, saya ingin login dengan akun Google/email, supaya data batch saya terikat ke identitas saya.
10. Sebagai trainer, saya ingin lihat status peserta (belum mulai / sedang berlangsung / selesai), supaya saya tahu siapa yang perlu di-nudge.

**Peserta**

11. Sebagai peserta, saya ingin klik link dan langsung mulai chat tanpa login, supaya friction-nya rendah.
12. Sebagai peserta, saya ingin tahu di awal sesi bahwa jawaban saya akan dibagikan ke trainer, supaya saya bisa menjawab dengan informed consent.
13. Sebagai peserta, saya ingin agent bertanya dengan natural dalam Bahasa Indonesia, supaya saya nyaman cerita apa adanya.
14. Sebagai peserta, saya ingin agent probing kalau jawaban saya tipis, supaya saya bisa eksplorasi sendiri apa yang sebenarnya saya inginkan dari kelas.
15. Sebagai peserta, saya ingin bisa tutup browser di tengah sesi dan lanjut nanti dengan klik link yang sama, supaya saya tidak harus selesai dalam satu duduk.
16. Sebagai peserta, saya ingin dapat 1 reminder kalau saya belum selesai sebelum deadline, supaya saya tidak miss.
17. Sebagai peserta, saya ingin tahu kapan sesi sudah selesai, supaya saya tidak ragu-ragu apakah harus jawab lagi.

**Sistem / Edge Cases**

18. Sebagai sistem, saya tidak boleh mengizinkan agent menutup sesi sebelum semua 6 dimensi punya entry tool `mark_dimension_covered`, supaya brief tidak generate dari data tidak lengkap.
19. Sebagai sistem, saya harus tetap generate class brief di deadline meskipun ada peserta yang belum selesai, dengan catatan eksplisit di brief tentang berapa peserta yang tidak menyelesaikan asesmen.
20. Sebagai sistem, saya harus membatasi probing maksimum 2x per dimensi, supaya peserta yang memang menutup diri tidak terjebak loop.
21. Sebagai sistem, saya harus menampilkan "peserta sangat tertutup di dimensi X" di brief sebagai sinyal kepada trainer, bukan menyembunyikannya sebagai data hilang.

## Implementation Decisions

**Stack & deployment**

- Frontend & backend: Next.js (App Router) di Vercel
- Database, auth, storage: Supabase (Postgres + Supabase Auth + Storage)
- LLM: Anthropic Claude API langsung (bukan via abstraction layer)
  - Wawancara turn-by-turn: Claude Haiku 4.5
  - Class brief generation: Claude Opus 4.7
  - Prompt caching aktif untuk system prompt rubrik (read-heavy di wawancara)
- Streaming chat via Server-Sent Events untuk feel responsif
- Email transactional: Resend (atau equivalent) untuk notifikasi trainer + reminder peserta

**Arsitektur**

- Core agent ditulis channel-agnostic. Channel adapter (web, WhatsApp di v2) memanggil core lewat interface tipis. Web adapter = API route Next.js. WhatsApp adapter di v2 = webhook receiver yang memanggil interface yang sama.
- Wawancara state dilacak via Claude tool use:
  - `mark_dimension_covered(dimension, summary)` — agent panggil saat menilai satu dimensi cukup tertutup
  - `end_session()` — agent panggil saat siap menutup; backend tolak panggilan ini kalau ada dimensi belum di-mark
- Setiap turn wawancara: satu LLM call ke Haiku dengan full chat history + tool definitions. Tool call hasil di-persist ke DB.

**Tenancy & auth**

- Multi-trainer, single-org. Tabel `users` dari Supabase Auth. Tabel domain (`batches`, `participants`, `briefs`) punya kolom `created_by_user_id`. UI filter by current user. Tidak ada konsep `org_id` di MVP.
- Peserta tidak login. Akses sesi via signed token di URL (`/s/<token>`). Token mapping ke `participant_id` di DB.

**Schema (level konseptual)**

- `batches`: id, name, course_name, deadline, created_by_user_id, status (draft / active / closed), created_at
- `participants`: id, batch_id, name, phone, email, token, status (not_started / in_progress / completed / abandoned), started_at, completed_at
- `messages`: id, participant_id, role (user / assistant), content, created_at
- `dimension_marks`: id, participant_id, dimension (enum 6 nilai), summary (text), marked_at
- `briefs`: id, batch_id, generated_at, generated_by (auto / manual), content (markdown), edited_content (markdown nullable)

**Rubrik 6 dimensi (hardcoded di MVP)**

1. Profil & konteks (peran, alasan ikut, ekspektasi)
2. Goal konkret pasca-kelas
3. Level AI coding (tools yang dipakai, frekuensi, untuk apa)
4. Level vibe coding & app-building (pernah bikin? sampai mana? deploy?)
5. Tantangan & blocker
6. Preferensi belajar & constraint (gaya, waktu, hardware)

**Wawancara behavior**

- Bahasa Indonesia, toleransi code-switching untuk istilah teknis
- Welcome message eksplisit menyatakan brief akan dibagikan ke trainer dan estimasi durasi 15 menit
- Probing maksimum 2x per dimensi sebelum agent lanjut ke dimensi lain
- Agent boleh memilih urutan dimensi sendiri (tidak hardcoded)
- Agent harus konfirmasi ringkasan singkat di akhir sebelum panggil `end_session`

**Brief generation**

- Trigger 1: cron job di deadline batch (`status` jadi `closed`, brief auto-generate, email ke trainer)
- Trigger 2: tombol "Regenerate" manual di UI brief
- Input ke Opus: rubrik konteks + semua `dimension_marks` semua peserta dalam batch + transkrip lengkap
- Output: markdown class brief dengan section: ringkasan kelas, distribusi level, goal cluster, rekomendasi fokus materi, peserta yang perlu perhatian khusus, catatan data quality
- Trainer bisa edit `edited_content`. `content` original tetap disimpan untuk audit.

**Resume & reminder**

- Token URL tetap valid sampai batch deadline
- Peserta klik link → kalau status `in_progress`, lanjut dari pesan terakhir (load full history ke client)
- Cron H-1 deadline: kirim email ke peserta `not_started` atau `in_progress`. Maksimum 1 reminder.

**Success metric MVP**

- Primary (kualitatif): apakah trainer mau pakai lagi untuk batch berikutnya tanpa diminta
- Sekunder (kuantitatif): completion rate, avg session duration, drop-off per dimensi — untuk debug saat metric primary negatif

## Out of Scope

- WhatsApp channel (arsitektur sudah siap, ditunda ke v2)
- Reminder via WhatsApp atau SMS
- Auto-share link ke peserta (trainer copy-paste manual di MVP)
- Dashboard agregat lintas batch / multi-batch comparison
- Custom rubrik per kelas — 6 dimensi hardcoded
- Multi-org / multi-tenant isolation, billing, role permissions di luar single trainer ownership
- Analytics dashboard (drop-off rate per pertanyaan, dst.)
- Opt-out per pertanyaan oleh peserta
- Bahasa selain Indonesia
- Integrasi dengan LMS atau platform kursus lain
- Voice / audio input

## Further Notes

- Trainer di-asumsikan berbahasa Indonesia. Konfirmasi ulang kalau ada trainer non-Indonesia di pilot.
- Pilot MVP: 1–2 trainer beneran, 1 batch masing-masing. Wawancara 30 menit pasca-kelas dengan trainer adalah data go/no-go utama.
- Estimasi biaya per sesi wawancara dengan Haiku 4.5 + prompt caching diperkirakan rendah (<$0.05); brief Opus per batch diperkirakan $0.50–$2 tergantung jumlah peserta. Validasi setelah implementasi.
- Compliance: welcome message eksplisit + tidak ada data sensitif yang dikumpulkan secara default sudah memenuhi kebutuhan informed consent dasar UU PDP. Belum ada kebijakan retensi formal — putuskan sebelum pilot publik.
- Open question: apakah trainer perlu API/export brief ke format lain (PDF, Notion)? Tunggu feedback pilot.
