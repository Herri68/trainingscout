## Problem Statement

Dashboard trainer saat ini hanya menampilkan daftar batch. Untuk tahu siapa peserta yang sudah / belum wawancara, profil mereka, dan pola pain point lintas batch, trainer harus masuk ke tiap batch satu per satu lalu membaca transkrip mentah. Tidak ada cara cepat menjawab pertanyaan dasar seperti "berapa pemula yang akan ikut?", "siapa saja yang ingin bikin SaaS?", atau "siapa peserta baru yang belum aku follow up?". Akibatnya trainer kehilangan visibility lintas-batch dan insight kualitatif yang seharusnya jadi nilai utama TrainingScout terbenam dalam transkrip yang harus dibaca manual.

## Solution

Ubah halaman root dashboard menjadi *customer insight view*: daftar peserta lintas batch dengan filter (batch, level) + search bebas (nama, WA, goal). Tiap baris peserta menampilkan chip `level` (pemula/menengah/mahir) dan `goal` (≤5 kata, free text) yang diekstrak otomatis oleh LLM begitu wawancara peserta selesai. Strip ringkasan agregat di atas list memberi sense skala & komposisi (jumlah peserta, status selesai, breakdown level) yang ikut filter aktif. Klik peserta membuka halaman profil per-orang yang menampilkan detail wawancara & tombol re-analyze. Halaman batch detail yang sudah ada tetap dipertahankan untuk kerja operasional (CSV upload, broadcast WA, generate brief, copy link).

## User Stories

1. Sebagai trainer, saya ingin membuka `/dashboard` dan langsung melihat daftar semua peserta saya lintas batch, supaya saya tidak perlu klik per batch untuk dapat overview.
2. Sebagai trainer, saya ingin memfilter list peserta berdasarkan batch tertentu, supaya saya bisa fokus pada cohort yang sedang aktif.
3. Sebagai trainer, saya ingin memfilter peserta berdasarkan level (pemula / menengah / mahir), supaya saya bisa menyesuaikan materi atau menyusun grup.
4. Sebagai trainer, saya ingin mengetik di search box dan mendapat hasil yang match nama, nomor WA, atau goal peserta, supaya saya bisa mencari "siapa yang mau bikin SaaS" tanpa perlu filter terstruktur.
5. Sebagai trainer, saya ingin melihat chip `level` dan `goal` di tiap baris peserta yang sudah selesai wawancara, supaya saya bisa scan profil tanpa membaca transkrip.
6. Sebagai trainer, saya ingin peserta yang belum selesai wawancara tetap muncul di list dengan tag jelas ("belum wawancara"), supaya saya tahu siapa yang perlu di-follow up.
7. Sebagai trainer, saya ingin melihat strip agregat di atas list (jumlah total, jumlah selesai, breakdown level), supaya saya cepat paham komposisi cohort.
8. Sebagai trainer, saya ingin strip agregat itu ikut menyesuaikan dengan filter aktif, supaya angka mencerminkan subset yang sedang saya lihat.
9. Sebagai trainer, saya ingin filter & search saya tertulis di URL, supaya saya bisa bookmark / share view tertentu dan back button bekerja.
10. Sebagai trainer, saya ingin klik baris peserta membawa saya ke halaman profil peserta itu, supaya saya bisa baca transkrip lengkap & detail tanpa terbawa ke halaman batch yang penuh tombol operasional.
11. Sebagai trainer, di halaman profil peserta saya ingin melihat level, goal, transkrip wawancara lengkap, dan link kembali ke batch asal, supaya saya punya satu tempat untuk semua konteks satu peserta.
12. Sebagai trainer, di halaman profil peserta saya ingin tombol "Analisis ulang", supaya saya bisa retry ekstraksi kalau hasil aslinya jelek atau gagal.
13. Sebagai trainer, saya ingin halaman batch detail (`/dashboard/batches/[id]`) tetap berjalan persis seperti sekarang dengan CSV upload, broadcast WA, generate brief, copy link, supaya alur kerja operasional saya tidak terganggu.
14. Sebagai sistem, saya ingin mengekstrak `level` dan `goal` peserta segera setelah status wawancara peserta berubah menjadi "selesai", supaya insight tersedia tanpa trainer perlu trigger manual.
15. Sebagai sistem, saya ingin tetap menandai peserta sebagai "selesai" walaupun ekstraksi LLM gagal (timeout / rate limit / JSON malformed), supaya kegagalan internal tidak menyandera UX peserta.
16. Sebagai trainer, saya ingin peserta yang ekstraksinya gagal muncul dengan chip kosong / placeholder, supaya saya tahu siapa yang perlu di-retry manual.
17. Sebagai trainer (operasional), saya ingin script one-off untuk backfill `level` & `goal` semua peserta lama yang sudah selesai sebelum fitur ini ada, supaya data riwayat tidak mati.
18. Sebagai trainer, saya ingin halaman dashboard cepat terbuka walau peserta saya sudah ratusan, supaya tool ini tidak terasa lambat saat dipakai harian.

## Implementation Decisions

**Routing & halaman**

- `/dashboard` (existing) di-rewrite total menjadi customer insight view (list peserta lintas batch + filter + summary strip). Form "Buat batch baru" dan list batch dipindah ke section terpisah di halaman yang sama (atau ke route terpisah `/dashboard/batches`) — keputusan akhir saat implementasi, tapi keduanya tetap accessible.
- `/dashboard/batches/[id]` (existing) tidak berubah perilaku — tetap halaman operasional batch.
- `/dashboard/participants/[id]` (route baru) — halaman profil peserta: nama, WA, batch (link balik), status, chip level & goal, transkrip wawancara lengkap, tombol "Analisis ulang".

**Data & schema**

- Tambah dua kolom nullable di tabel `participants`:
  - `level` — enum constrained (`pemula | menengah | mahir`), nullable.
  - `goal` — text pendek (max ~50 char), nullable. Sentinel `"belum jelas"` dipakai saat LLM tidak menemukan goal eksplisit (dibedakan dari NULL = belum diekstrak / gagal).
- Migration via mekanisme migrasi Supabase yang sudah dipakai project ini.
- RLS / authorization mengikuti pola `participants` query yang sudah ada — trainer hanya melihat peserta dari batch miliknya.

**Pipeline ekstraksi**

- Hook ekstraksi di titik di pipeline wawancara di mana status peserta transition ke "selesai" (lokasi pasti ditentukan saat implementasi setelah membaca `lib/agent/run.ts` dan flow penyelesaian sesi).
- Provider: Anthropic SDK, model `claude-haiku-4-5` (konsisten dengan agen wawancara). Reuse `ANTHROPIC_API_KEY` yang sudah ada.
- Input prompt: gabungan transkrip Q&A peserta. Bahasa Indonesia. Few-shot 2–3 contoh untuk anchor enum `level`. Instruksi tegas "kembalikan HANYA JSON".
- Output divalidasi via Zod schema `{ level: enum, goal: string ≤ 5 kata }`. Output invalid → diperlakukan sebagai gagal.
- Fail silent: try/catch di sekitar ekstraksi, log error ke server log, jangan throw ke caller pipeline. Status peserta tetap "selesai", `level` & `goal` tetap NULL.

**Recovery / backfill**

- Fungsi internal `extractInsightFor(participantId)` jadi single source of truth: dipakai oleh (1) hook auto saat selesai, (2) tombol "Analisis ulang" di halaman participant, (3) script backfill.
- npm script `scripts/backfill-insights.ts` yang loop `participants` dengan `status=selesai AND level IS NULL`, panggil fungsi di atas, log progress. Dijalankan manual sekali setelah deploy.
- Tombol "Analisis ulang" memanggil server action yang sync (await ekstraksi sebelum return) — UX feedback langsung. Tanpa throttling khusus untuk v1.

**Halaman dashboard root — query & UI**

- URL searchParams sebagai source of truth filter: `?batch=<id>&level=<enum>&q=<search>`.
- Server-side filtering via Supabase query (`.eq` untuk batch & level, `.ilike` untuk search). Search query match terhadap `name`, `wa`, `goal` (case-insensitive contains).
- Hard limit `LIMIT 500` tanpa pagination untuk v1.
- Strip agregat dihitung dari hasil query (post-filter): total peserta, jumlah selesai, breakdown level (pemula / menengah / mahir).
- Toolbar: dropdown batch (default "Semua batch"), dropdown level (default "Semua level"), input search.
- Baris peserta: nama (bold), nama batch (muted), status badge, chip level (warna sesuai enum), chip goal (text mentah). Untuk peserta belum selesai: tag "belum wawancara" menggantikan chip level/goal. Untuk peserta selesai tapi ekstraksi gagal: chip placeholder "—" dengan tooltip "ekstraksi gagal".
- Klik baris navigate ke `/dashboard/participants/[id]`.

**Empty & edge states**

- Belum ada peserta sama sekali → CTA "Buat batch & undang peserta" pointing ke flow batch.
- Filter aktif tanpa hasil → empty state dengan tombol "reset filter".
- Peserta lama (sebelum backfill jalan) tampil sama dengan ekstraksi-gagal: chip "—".

## Out of Scope

- Pagination dashboard (ditunda sampai ada batch tembus 500 peserta).
- Filter goal sebagai facet / chip cloud (goal tetap pasif, search bar saja).
- Grouping toggle (group by batch / level / goal).
- Cron / auto-retry untuk ekstraksi yang gagal — recovery hanya via tombol manual atau script backfill.
- Kategorisasi goal ke enum tetap (clustering) — tunda sampai ada data nyata yang menunjukkan pola.
- Edit manual `level` / `goal` oleh trainer dari UI.
- Catatan trainer per peserta, riwayat interaksi WA terpadu di halaman participant — di luar scope v1, tapi route `/dashboard/participants/[id]` membuka pintu untuk fitur tersebut nanti.
- Multi-tenant / multi-trainer (tetap single-trainer sesuai kondisi sekarang).
- Export CSV insight.

## Further Notes

- **Konsistensi provider LLM**: brief generator pakai `claude-opus-4-7` (fallback `claude-sonnet-4-6`), agen wawancara pakai `claude-haiku-4-5`. Ekstraksi insight pakai Haiku 4.5 — task-nya klasifikasi sederhana, Opus over-spec.
- **Sentinel `"belum jelas"` vs NULL**: penting dibedakan supaya retry tidak menarget peserta yang sudah berhasil diekstrak tapi memang goalnya tidak eksplisit.
- **Lokasi hook auto-extract** belum dipastikan tanpa membaca pipeline. Saat implementasi, eksplor `lib/agent/run.ts` dan tempat status peserta di-set ke "selesai" untuk menentukan titik pasti.
- **Backward compat halaman batch**: form "Buat batch baru" dan akses ke list batch harus tetap discoverable setelah dashboard root di-redesign — keputusan UX (section di halaman yang sama vs route `/dashboard/batches`) ditunda ke fase implementasi.
- **Open question**: apakah tombol "Analisis ulang" perlu rate limit per peserta (mis. 1×/menit) untuk hindari spam saat trainer frustasi? Tunda sampai ada sinyal abuse.
